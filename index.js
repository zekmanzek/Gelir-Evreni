require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

// 1. MODÜLLERİ İÇERİ AKTARIYORUZ
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

// PAYLAŞILAN DURUM VE ORTAK FONKSİYONLAR
const sharedState = { activeDrop: null };
const activePredictions = new Map();

function addPoints(user, amount) {
    const now = new Date();
    user.points += amount; 
    user.dailyPoints += amount; // Bu artık haftalık puanı temsil eder
    user.lastPointDate = now;
}

// BÜYÜK ÖDÜL DUYURU FONKSİYONU
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

// 2. BOT KOMUTLARINI DIŞARIDAN ÇAĞIRIYORUZ
const botConfig = { ADMIN_ID, WEBHOOK_URL };
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);

// --- OTOMATİK GÖREVLER (CRON JOBS) ---
setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        
        // Sabah ve Akşam Mesajları
        if (utcHour === 6 && utcMin === 0) { bot.sendMessage(s.mainGroupId, "☀️ Günaydın Siber Ağ! Madenleri toplamayı unutmayın."); }
        else if (utcHour === 20 && utcMin === 30) { bot.sendMessage(s.mainGroupId, "🌙 İyi geceler millet! Yarın daha çok kazanacağız..."); }
        
        // Rastgele Siber Drop
        if (utcMin === 0 && Math.random() < 0.10) {
            sharedState.activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nAşağıdaki butona ilk tıklayan **25.000 GEP** kazanır!", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] }
            });
        }

        // --- PAZAR GECESİ ŞAMPİYONLARI İLAN ET VE SIFIRLA (23:59) ---
        if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 59) {
            const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
            if (winners.length > 0) {
                let winMsg = `🏆 **HAFTALIK ŞAMPİYONLAR BELLİ OLDU!**\n\nBu hafta en çok GEP toplayan ve **5$ Nakit Ödül** kazanan ilk 5 kahramanımız:\n\n`;
                winners.forEach((u, i) => {
                    winMsg += `${i+1}. ${u.username ? '@'+u.username : u.firstName} - **${u.dailyPoints.toLocaleString()} GEP** (+$5 💵)\n`;
                });
                winMsg += `\nÖdül kazananların ödemeleri için Admin @gelirevreni ile iletişime geçmesi rica olunur. 🎉\n\nSıralama sıfırlandı, yeni hafta başladı! 🚀`;
                bot.sendMessage(s.mainGroupId, winMsg, { 
                    parse_mode: 'Markdown',
                    reply_markup: { inline_keyboard: [[{ text: "🚀 Yarışa Katıl", web_app: { url: WEBHOOK_URL } }]] }
                });
                
                // Sıfırlama işlemi
                await User.updateMany({}, { $set: { dailyPoints: 0 } });
            }
        }
    } catch (e) { }
}, 60000);

// --- GÜVENLİK VE ROUTE'LAR ---
function getTelegramUserFromInitData(telegramInitData) {
    try {
        if (!telegramInitData) return null;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); const authDate = initData.get('auth_date');
        if (!hash || !authDate) return null;
        const now = Math.floor(Date.now() / 1000); if (now - parseInt(authDate) > 86400) return null;
        initData.delete('hash'); const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) return null;
        return JSON.parse(initData.get('user')).id.toString(); 
    } catch (error) { return null; }
}

const secureRoute = (req, res, next) => {
    const initData = req.body.initData;
    const realId = getTelegramUserFromInitData(initData);
    if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    req.realTelegramId = realId; 
    next();
};

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    const telegramId = req.realTelegramId;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { addPoints(referrer, 10000); referrer.referralCount += 1; await referrer.save(); addPoints(user, 10000); }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    const reward = 100 * Math.pow(2, user.streak - 1); addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, adTickets: { $gt: 0 } }, { $inc: { adTickets: -1 } }, { new: true });
    if (!user) return res.json({ success: false });
    addPoints(user, 5000); await user.save();
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); user.lastMining = now; await user.save(); return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: upgradeCost } }, { $inc: { points: -upgradeCost, miningLevel: 1 } }, { new: true });
    if (updatedUser) { res.json({ success: true, points: updatedUser.points, newLevel: updatedUser.miningLevel }); } else { res.json({ success: false }); }
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const cost = 500; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" }); 
    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (rand <= 40) { prize = 0; msg = "Şansını Dene"; } 
    else if (rand <= 75) { prize = 250; msg = "Yarım Teselli"; } 
    else if (rand <= 92) { prize = 500; msg = "Amorti!"; } 
    else if (rand <= 99) { prize = 1000; msg = "İKİYE KATLADIN!"; } 
    else { prize = 5000; msg = "💥 JACKPOT! 💥"; }
    if (prize === 5000) broadcastBigWin(user.username, user.firstName, "Gelir Çarkı", prize);
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const { boxType } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); let lastOpenDate;
    if (boxType === 1) lastOpenDate = user.lastLootbox1; else if (boxType === 2) lastOpenDate = user.lastLootbox2; else if (boxType === 3) lastOpenDate = user.lastLootbox3;
    if ((now - new Date(lastOpenDate || 0)) < 24 * 60 * 60 * 1000) return res.json({ success: false });
    let cost = boxType === 1 ? 1000 : (boxType === 2 ? 5000 : 25000);
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!updatedUser) return res.json({ success: false });
    if (boxType === 1) updatedUser.lastLootbox1 = now; else if (boxType === 2) updatedUser.lastLootbox2 = now; else updatedUser.lastLootbox3 = now;
    let prize = 0; const rand = Math.random() * 100;
    if (boxType === 1) prize = rand > 90 ? 10000 : 500; else if (boxType === 2) prize = rand > 90 ? 50000 : 3000; else prize = rand > 95 ? 250000 : 15000;
    if ((boxType === 1 && prize === 10000) || (boxType === 2 && prize === 50000) || (boxType === 3 && prize === 250000)) {
        let boxName = boxType === 1 ? "Standart Kapsül" : (boxType === 2 ? "Nadir Kapsül" : "Efsanevi Kapsül");
        broadcastBigWin(updatedUser.username, updatedUser.firstName, boxName, prize);
    }
    addPoints(updatedUser, prize); await updatedUser.save();
    res.json({ success: true, prize, points: updatedUser.points });
});

app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    const weekly = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100); 
    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: weekly }); 
});

const adminCheck = (req, res, next) => { if (req.realTelegramId !== ADMIN_ID) return res.status(403).send("Yetkisiz"); next(); };
app.post('/api/admin/stats', secureRoute, adminCheck, async (req, res) => { const settings = await Settings.findOne() || { announcements: [] }; res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() }); });
app.post('/api/admin/add-task', secureRoute, adminCheck, async (req, res) => { await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target }); res.json({ success: true }); });
app.post('/api/admin/delete-task', secureRoute, adminCheck, async (req, res) => { await Task.deleteOne({ taskId: req.body.taskId }); res.json({ success: true }); });
app.post('/api/admin/user-manage', secureRoute, adminCheck, async (req, res) => { const { targetId, action, amount } = req.body; const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] }); if (!user) return res.json({ success: false }); if (action === 'add') addPoints(user, Number(amount)); if (action === 'set') user.points = Number(amount); if (action === 'ban') user.isBanned = true; if (action === 'unban') user.isBanned = false; await user.save(); res.json({ success: true }); });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
