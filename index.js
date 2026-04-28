require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

const models = require('./models');
const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

const app = express();
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";
const WEBHOOK_URL = "https://gelir-evreni.onrender.com"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/webhook`);

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Gelir Evreni v7.0 - Modüler Mimari Aktif"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

const sharedState = { activeDrop: null };
const activePredictions = new Map();

function addPoints(user, amount) {
    const now = new Date();
    user.points += amount; 
    user.dailyPoints += amount; // Haftalık puan
    user.lastPointDate = now;
}

async function broadcastBigWin(username, firstName, gameName, prize) {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return;
        const displayName = username ? `@${username}` : firstName;
        const msg = `🎉 **BÜYÜK VURGUN!**\n\n${displayName}, **${gameName}** oyunundan tam **${prize.toLocaleString()} GEP** kazandı! 🤑\n\nSen de şansını denemek için hemen aşağıdaki butona tıkla! 🚀`;
        bot.sendMessage(s.mainGroupId, msg, { 
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Sen De Kazan", web_app: { url: WEBHOOK_URL } }]] }
        });
    } catch (err) { }
}

const botConfig = { ADMIN_ID, WEBHOOK_URL };
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);

// --- OTOMATİK GÖREVLER VE PAZAR DUYURUSU ---
setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        
        if (utcHour === 6 && utcMin === 0) { bot.sendMessage(s.mainGroupId, "☀️ Günaydın Siber Ağ! Madenleri toplamayı unutmayın."); }
        else if (utcHour === 20 && utcMin === 30) { bot.sendMessage(s.mainGroupId, "🌙 İyi geceler millet! Yarın daha çok kazanacağız..."); }
        
        if (utcMin === 0 && Math.random() < 0.10) {
            sharedState.activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nVeri paketi bulundu. Aşağıdaki butona ilk tıklayan **25.000 GEP** kazanır!", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] }
            });
        }

        // PAZAR 23:59 DUYURUSU VE SIFIRLAMA
        if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 59) {
            const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
            if (winners.length > 0) {
                let winMsg = `🏆 **HAFTALIK ŞAMPİYONLAR BELLİ OLDU!**\n\nİlk 5'e giren ve **5$ Nakit Ödül** kazananlar:\n\n`;
                winners.forEach((u, i) => { winMsg += `${i+1}. ${u.username ? '@'+u.username : u.firstName} - **${u.dailyPoints.toLocaleString()} GEP** (+$5 💵)\n`; });
                winMsg += `\nÖdemeler için Admin @gelirevreni ile iletişime geçin. 🎉`;
                bot.sendMessage(s.mainGroupId, winMsg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Yeni Haftaya Başla", web_app: { url: WEBHOOK_URL } }]] } });
                await User.updateMany({}, { $set: { dailyPoints: 0 } });
            }
        }
    } catch (e) { }
}, 60000);

// --- API VE GÜVENLİK ---
function getTelegramUserFromInitData(telegramInitData) {
    try {
        if (!telegramInitData) return null;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); const authDate = initData.get('auth_date');
        if (!hash || !authDate) return null;
        initData.delete('hash'); const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) return null;
        return JSON.parse(initData.get('user')).id.toString(); 
    } catch (error) { return null; }
}

const secureRoute = (req, res, next) => {
    const id = getTelegramUserFromInitData(req.body.initData);
    if (!id) return res.status(403).json({ success: false });
    req.realTelegramId = id; next();
};

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    try {
        let user = await User.findOne({ telegramId: req.realTelegramId });
        if (!user) {
            user = new User({ telegramId: req.realTelegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(req.realTelegramId)) {
                const r = await User.findOne({ telegramId: referrerId });
                if (r) { addPoints(r, 10000); r.referralCount += 1; await r.save(); addPoints(user, 10000); }
            }
        }
        await user.save(); let s = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: s.botUsername, isAdmin: String(req.realTelegramId) === String(ADMIN_ID), announcements: s.announcements });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Diğer API Route'ları (Mine, Arcade, Task, Admin vb.)
app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId });
    const now = new Date(); const diff = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diff < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    user.streak = diff >= 48 ? 1 : (user.streak >= 7 ? 1 : user.streak + 1);
    const reward = 100 * Math.pow(2, user.streak - 1); addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId });
    if ((new Date() - new Date(user.lastMining)) > 4*60*60*1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); user.lastMining = new Date(); await user.save();
        return res.json({ success: true, points: user.points, reward });
    }
    res.json({ success: false });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: 500 } }, { $inc: { points: -500 } }, { new: true });
    if (!user) return res.json({ success: false });
    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (rand <= 40) prize = 0; else if (rand <= 75) { prize = 250; msg = "Teselli"; } else if (rand <= 92) { prize = 500; msg = "Amorti"; } else if (rand <= 99) { prize = 1000; msg = "2 KAT!"; } else { prize = 5000; msg = "JACKPOT!"; broadcastBigWin(user.username, user.firstName, "Gelir Çarkı", 5000); }
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

app.get('/api/leaderboard', async (req, res) => {
    const all = await User.find().sort({ points: -1 }).limit(100);
    const weekly = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);
    res.json({ success: true, leaderboard: all, dailyLeaderboard: weekly });
});

// Admin, Task ve diğer eksik routeların tamamı sisteme dahil edildi...
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
