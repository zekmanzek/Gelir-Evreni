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
    user.dailyPoints += amount; 
    user.lastPointDate = now;
}

// BÜYÜK ÖDÜL DUYURU FONKSİYONU (BUTONLU)
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
    } catch (err) { console.error("Duyuru hatası:", err); }
}

// 2. BOT KOMUTLARINI DIŞARIDAN ÇAĞIRIYORUZ
const botConfig = { ADMIN_ID, WEBHOOK_URL };
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);

// --- OTOMATİK GÖREVLER (CRON JOBS) ---
const morningMsgs = ["☀️ Günaydın Siber Ağ! Madenleri toplamayı unutmayın.", "🌅 Günaydın! Yeni bir gün, yeni GEP'ler...", "☕ Günaydın Gelir Evreni ailesi!"];
const nightMsgs = ["🌙 İyi geceler millet! Bırakın sistem uyurken de sizin için çalışsın.", "🌌 Herkese iyi geceler. Yarın daha çok kazanacağız..."];

setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        
        if (utcHour === 6 && utcMin === 0) { bot.sendMessage(s.mainGroupId, morningMsgs[Math.floor(Math.random() * morningMsgs.length)]); }
        else if (utcHour === 20 && utcMin === 30) { bot.sendMessage(s.mainGroupId, nightMsgs[Math.floor(Math.random() * nightMsgs.length)]); }
        
        if (utcMin === 0 && Math.random() < 0.10) {
            sharedState.activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nAğda sahipsiz bir veri paketi bulundu. Aşağıdaki butona ilk tıklayan **25.000 GEP** kazanır!", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] }
            });
        }
    } catch (e) { }
}, 60000);

// OTOMATİK MADEN UYARI SİSTEMİ
setInterval(async () => {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return; 

        const now = new Date();
        const fourHoursAgo = new Date(now.getTime() - (4 * 60 * 60 * 1000));

        const readyMiners = await User.find({
            lastMining: { $lte: fourHoursAgo },
            isMiningNotified: { $ne: true }
        }).limit(15);

        if (readyMiners.length > 0) {
            let mentions = readyMiners.map(u => u.username ? `@${u.username}` : `[${u.firstName}](tg://user?id=${u.telegramId})`).join(', ');
            const msg = `⛏️ **MADENLERİNİZ DOLDU!** ⛏️\n\n${mentions}\n\nSiber madenleriniz GEP ile dolup taşıyor! Üretimin durmaması için hemen uygulamaya girip ödüllerinizi toplayın! 👇`;

            bot.sendMessage(s.mainGroupId, msg, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "🚀 Madenleri Topla", web_app: { url: WEBHOOK_URL } }]] }
            }).catch(e => console.log("Maden uyarı mesajı atılamadı:", e.message));

            for (let user of readyMiners) {
                user.isMiningNotified = true;
                await user.save();
            }
        }
    } catch (err) { console.error("Maden uyarı hatası:", err); }
}, 15 * 60 * 1000); 

// HAFTALIK LİDERLİK SIFIRLAMA (PAZAR 23:58) VE ŞAMPİYONLARI DUYURMA
async function archiveWeeklyLeaderboard() {
    try {
        const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);
        
        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            const archiveData = winners.map((u, i) => ({ rank: i + 1, username: u.username, firstName: u.firstName, points: u.dailyPoints, date: new Date() }));
            await YesterdayWinner.insertMany(archiveData); 

            const s = await Settings.findOne();
            if (s && s.mainGroupId) {
                const top5 = winners.slice(0, 5); 
                let broadcastMsg = `🏆 **HAFTANIN ŞAMPİYONLARI BELLİ OLDU!** 🏆\n\nGeçen haftanın en çok GEP toplayan ve **5$ Nakit Ödül** kazanan ilk 5 efsanesi:\n\n`;
                
                top5.forEach((winner, index) => {
                    const safeName = winner.firstName ? winner.firstName.replace(/([_*\[\]`])/g, '\\$1') : 'Kullanıcı';
                    const displayName = winner.username ? `@${winner.username}` : safeName;
                    broadcastMsg += `**${index + 1}.** ${displayName} - ${winner.dailyPoints.toLocaleString()} GEP\n`;
                });
                
                broadcastMsg += `\n🎁 Kazananların ödüllerini almak için yöneticilerle iletişime geçmesi rica olunur. Yeni hafta başladı, herkese bol şans! 🚀`;
                
                bot.sendMessage(s.mainGroupId, broadcastMsg, { parse_mode: 'Markdown' })
                   .catch(err => console.log("Haftalık liderlik duyurusu atılamadı:", err.message));
            }

            await User.updateMany({}, { $set: { dailyPoints: 0 } });
        } else { 
            await YesterdayWinner.create({ rank: 0, username: 'sistem', firstName: 'sistem', points: 0, date: new Date() }); 
        }
    } catch (err) { console.error("Haftalık sıfırlama hatası:", err); }
}
setInterval(() => { const now = new Date(); if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 58) archiveWeeklyLeaderboard(); }, 60000);

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
    const reward = 1000 * Math.pow(2, user.streak - 1); 
    addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { packageId } = req.body; let cost = packageId === 1 ? 10000 : (packageId === 2 ? 50000 : 100000); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost, adTickets: (packageId === 1 ? 10 : (packageId === 2 ? 50 : 100)) } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
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
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); 
        user.lastMining = now; 
        user.isMiningNotified = false;
        await user.save(); return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: upgradeCost } }, { $inc: { points: -upgradeCost, miningLevel: 1 } }, { new: true });
    if (updatedUser) { res.json({ success: true, points: updatedUser.points, newLevel: updatedUser.miningLevel }); } else { res.json({ success: false }); }
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { code } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz!" });
    if (promo.usedBy.includes(req.realTelegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    if (promo.usedBy.length >= promo.maxUsage) { promo.isActive = false; await promo.save(); return res.json({ success: false, message: "Sınır doldu!" }); }
    promo.usedBy.push(req.realTelegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/arcade/zarzara', secureRoute, async (req, res) => {
    const { bet } = req.body;
    const amount = parseInt(bet);
    
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP olmalıdır." });
    
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    
    const diceValue = Math.floor(Math.random() * 6) + 1;
    let winAmount = 0;
    
    if (diceValue >= 4) {
        winAmount = amount * 2;
        addPoints(user, winAmount);
        await user.save();
    }
    
    res.json({ success: true, diceValue, winAmount, points: user.points });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const cost = 5000; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" }); 
    
    const rand = Math.random() * 100; 
    let prize = 0; let msg = "BOŞ";
    
    if (rand <= 40) { prize = 0; msg = "Şansını Dene"; } 
    else if (rand <= 75) { prize = 2500; msg = "Yarım Teselli"; } 
    else if (rand <= 92) { prize = 5000; msg = "Amorti!"; } 
    else if (rand <= 99) { prize = 10000; msg = "İKİYE KATLADIN!"; } 
    else { prize = 50000; msg = "💥 JACKPOT! 💥"; }
    
    if (prize === 50000) broadcastBigWin(user.username, user.firstName, "Gelir Çarkı", prize);
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

// YENİ ROTA: GEPÇÖZ (hCaptcha Doğrulaması)
app.post('/api/arcade/gepcoz', secureRoute, async (req, res) => {
    const { token } = req.body;
    const secret = process.env.HCAPTCHA_SECRET;

    if (!token || !secret) return res.json({ success: false, message: "Yapılandırma hatası." });

    try {
        const params = new URLSearchParams();
        params.append('secret', secret);
        params.append('response', token);

        const verifyRes = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params
        });
        const data = await verifyRes.json();

        if (data.success) {
            const user = await User.findOne({ telegramId: req.realTelegramId });
            const reward = 25000; // Kullanıcıya verilecek ödül
            addPoints(user, reward);
            await user.save();
            res.json({ success: true, points: user.points, reward: reward });
        } else {
            res.json({ success: false, message: "Doğrulama başarısız." });
        }
    } catch (e) {
        res.json({ success: false, message: "Sistem hatası." });
    }
});

// ... (Diğer tüm rotalar aşağıya aynı şekilde devam ediyor) ...
app.post('/api/arcade/predict/start', secureRoute, async (req, res) => {
    const { guess } = req.body; const cost = 1000; 
    if (activePredictions.has(req.realTelegramId)) return res.json({ success: false, message: "Zaten devam eden bir tahminin var!" });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });

    try {
        const r1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d1 = await r1.json(); const p1 = parseFloat(d1.price);
        activePredictions.set(req.realTelegramId, { guess, p1, startTime: Date.now() });
        res.json({ success: true, price1: p1, points: user.points });
    } catch (e) { 
        await User.updateOne({ telegramId: req.realTelegramId }, { $inc: { points: cost } }); 
        res.json({ success: false, message: "Fiyat alınamadı, GEP iade edildi." }); 
    }
});

app.post('/api/arcade/predict/result', secureRoute, async (req, res) => {
    const prediction = activePredictions.get(req.realTelegramId);
    if (!prediction) return res.json({ success: false, message: "Aktif tahmin bulunamadı." });
    if (Date.now() - prediction.startTime < 9000) return res.json({ success: false, message: "Henüz süre dolmadı!" });
    activePredictions.delete(req.realTelegramId);

    try {
        const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d2 = await r2.json(); const p2 = parseFloat(d2.price);
        let won = false; 
        if ((prediction.guess === 'UP' && p2 > prediction.p1) || (prediction.guess === 'DOWN' && p2 < prediction.p1)) won = true;
        let user = await User.findOne({ telegramId: req.realTelegramId });
        if (won) { addPoints(user, 2000); await user.save(); }
        res.json({ success: true, won, price1: prediction.p1, price2: p2, points: user.points });
    } catch (e) { 
        let user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: 1000 } }, { new: true });
        res.json({ success: false, message: "Bağlantı koptu, 1000 GEP iade edildi.", points: user.points }); 
    }
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

app.post('/api/airdrop/list', secureRoute, async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links: links.map(l => ({ _id: l._id, username: l.username, title: l.title, description: l.description, url: l.url, hasJoined: l.joinedUsers.includes(req.realTelegramId), isOwner: l.telegramId === req.realTelegramId })) });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const { title, description, url } = req.body;
    const cost = 1000000; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if(!user) return res.json({success: false});
    let existing = await AirdropLink.findOne({ telegramId: req.realTelegramId });
    if (existing) { existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date(); await existing.save(); } 
    else { await AirdropLink.create({ telegramId: req.realTelegramId, username: user.username || user.firstName, title, description, url }); }
    res.json({success: true, points: user.points, message: "Pano güncellendi!"});
});

app.post('/api/airdrop/join', secureRoute, async (req, res) => {
    const { projectId } = req.body;
    try {
        const project = await AirdropLink.findOneAndUpdate(
            { _id: projectId, joinedUsers: { $ne: req.realTelegramId }, telegramId: { $ne: req.realTelegramId } },
            { $addToSet: { joinedUsers: req.realTelegramId } },
            { new: true }
        );
        if (!project) return res.json({ success: false });

        const user = await User.findOne({ telegramId: req.realTelegramId });
        if (user) {
            addPoints(user, 10000); 
            await user.save();
            return res.json({ success: true, points: user.points });
        }
        res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });

app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    const weekly = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100); 
    const lastWeek = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 }); 
    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: weekly, yesterdayLeaderboard: lastWeek }); 
});

app.post('/api/tasks/complete', secureRoute, async (req, res) => { 
    const { taskId } = req.body; 
    const task = await Task.findOne({ taskId }); 
    if (!task) return res.json({ success: false }); 
    
    const user = await User.findOneAndUpdate(
        { telegramId: req.realTelegramId, completedTasks: { $ne: taskId } },
        { $addToSet: { completedTasks: taskId } },
        { new: true }
    );
    if (!user) return res.json({ success: false }); 
    
    addPoints(user, task.reward); 
    await user.save(); 
    res.json({ success: true, points: user.points }); 
});

const adminCheck = (req, res, next) => { if (req.realTelegramId !== ADMIN_ID) return res.status(403).send("Yetkisiz"); next(); };
app.post('/api/admin/stats', secureRoute, adminCheck, async (req, res) => { const settings = await Settings.findOne() || { announcements: [] }; res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() }); });
app.post('/api/admin/add-task', secureRoute, adminCheck, async (req, res) => { await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target }); res.json({ success: true }); });
app.post('/api/admin/delete-task', secureRoute, adminCheck, async (req, res) => { await Task.deleteOne({ taskId: req.body.taskId }); res.json({ success: true }); });
app.post('/api/admin/create-promo', secureRoute, adminCheck, async (req, res) => { const { code, reward, maxUsage } = req.body; try { await PromoCode.create({ code: code.toUpperCase(), reward, maxUsage }); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/announcement', secureRoute, adminCheck, async (req, res) => { const s = await Settings.findOne() || await Settings.create({}); if(req.body.action === 'add') s.announcements.push(req.body.text); else s.announcements.splice(req.body.index, 1); await s.save(); res.json({ success: true }); });
app.post('/api/admin/user-manage', secureRoute, adminCheck, async (req, res) => { const { targetId, action, amount } = req.body; const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] }); if (!user) return res.json({ success: false }); if (action === 'add') addPoints(user, Number(amount)); if (action === 'set') user.points = Number(amount); if (action === 'ban') user.isBanned = true; if (action === 'unban') user.isBanned = false; await user.save(); res.json({ success: true }); });
app.post('/api/admin/delete-airdrop', secureRoute, adminCheck, async (req, res) => { await AirdropLink.findByIdAndDelete(req.body.id); res.json({ success: true }); });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
