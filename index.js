require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

// 1. MODÜLLER VE VERİTABANI
const models = require('./models');
const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

const app = express();
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// PATRON ID'Sİ KİLİTLENDİ (TANRI MODU)
const ADMIN_ID = "1469411131"; 
const WEBHOOK_URL = "https://gelir-evreni.onrender.com"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/webhook`);

// --- 🔥 %100 DİNAMİK EKONOMİ TABLOSU 🔥 ---
const gameConfigSchema = new mongoose.Schema({
    spinCost: { type: Number, default: 5000 },
    predictCost: { type: Number, default: 1000 },
    lootbox1Cost: { type: Number, default: 1000 },
    lootbox2Cost: { type: Number, default: 5000 },
    lootbox3Cost: { type: Number, default: 25000 },
    airdropCost: { type: Number, default: 1000000 },
    gepcozReward: { type: Number, default: 25000 },
    refReward: { type: Number, default: 10000 },
    mineBaseReward: { type: Number, default: 1000 },
    mineLevelStep: { type: Number, default: 500 },
    adReward: { type: Number, default: 5000 },
    dailyBaseReward: { type: Number, default: 1000 },
    spinJackpot: { type: Number, default: 50000 },
    spinMid: { type: Number, default: 10000 },
    spinLow: { type: Number, default: 2500 },
    lootBig: { type: Number, default: 250000 }, 
    lootMid: { type: Number, default: 50000 },  
    lootSmall: { type: Number, default: 10000 },
    predictReward: { type: Number, default: 2000 },
    spinProbEmpty: { type: Number, default: 40 },
    spinProbLow: { type: Number, default: 35 },
    spinProbCost: { type: Number, default: 17 },
    spinProbMid: { type: Number, default: 7 },
    spinProbJackpot: { type: Number, default: 1 },
    isLocked: { type: Boolean, default: false }, 
    boostMultiplier: { type: Number, default: 1 }, 
    boostEndTime: { type: Date, default: null } 
});
const GameConfig = mongoose.models.GameConfig || mongoose.model('GameConfig', gameConfigSchema);

// 🔥 SİBER ÖNBELLEK (CACHE) SİSTEMİ 🔥
let cachedConfig = null;

async function refreshConfigCache() {
    try {
        cachedConfig = await GameConfig.findOne() || await GameConfig.create({});
        console.log("♻️ Ekonomi Önbelleği (RAM) Tazelendi.");
    } catch (err) {
        console.error("❌ Önbellek tazelenirken hata:", err);
    }
}

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log("✅ Gelir Evreni v10.7 - %100 DİNAMİK EKONOMİ AKTİF");
        await refreshConfigCache(); // Sistem açılırken RAM'e yükle
    })
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ORTAK FONKSİYONLAR VE RADAR SİSTEMİ
const sharedState = { activeDrop: null };
const activePredictions = new Map();
const activeCrashSessions = new Map();

const radarLogs = [];
function addRadarLog(action) {
    const time = new Date().toLocaleTimeString('tr-TR', { hour12: false, timeZone: 'Europe/Istanbul' });
    radarLogs.unshift(`[${time}] ${action}`);
    if (radarLogs.length > 20) radarLogs.pop();
}

function addPoints(user, amount) {
    const now = new Date();
    user.points += amount; 
    user.dailyPoints += amount; 
    user.lastPointDate = now;
}

async function broadcastBigWin(username, firstName, gameName, prize) {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return;
        const displayName = username ? `@${username}` : firstName;
        const msg = `🎉 **BÜYÜK VURGUN!**\n\n${displayName}, **${gameName}** oyunundan tam **${prize.toLocaleString()} GEP** kazandı! 🤑\n\nSen de şansını denemek için hemen aşağıdaki butona tıkla! 🚀`;
        bot.sendMessage(s.mainGroupId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Sen De Kazan", web_app: { url: WEBHOOK_URL } }]] } });
    } catch (err) { console.error("Duyuru hatası:", err); }
}

// =====================================================================
// 🛡️ SİBER KOMUTA MERKEZİ (MODÜLER) 🛡️
// =====================================================================
const botConfig = { ADMIN_ID, WEBHOOK_URL };
// refreshConfigCache adminCommands'e aktarıldı, böylece /ayar komutu RAM'i güncelleyebilir.
const adminContext = { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog, refreshConfigCache };
require('./adminCommands')(adminContext);
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);
// =====================================================================

// --- OTOMATİK GÖREVLER (CRON JOBS) ---
setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        if (utcHour === 6 && utcMin === 0) bot.sendMessage(s.mainGroupId, "☀️ Günaydın Siber Ağ!");
        else if (utcHour === 20 && utcMin === 30) bot.sendMessage(s.mainGroupId, "🌙 İyi geceler millet!");
        if (utcMin === 0 && Math.random() < 0.10) {
            sharedState.activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nİlk tıklayan kazanır!", { reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] } });
        }
    } catch (e) { }
}, 60000);

setInterval(async () => {
    const now = new Date(); if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 58) {
        const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);
        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            await YesterdayWinner.insertMany(winners.map((u, i) => ({ rank: i + 1, username: u.username, firstName: u.firstName, points: u.dailyPoints, date: new Date() }))); 
            await User.updateMany({}, { $set: { dailyPoints: 0 } });
        }
    } 
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

const secureRoute = async (req, res, next) => {
    const initData = req.body.initData || req.query.initData;
    const realId = getTelegramUserFromInitData(initData);
    if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    
    // 🔥 OPTİMİZASYON: Artık GameConfig.findOne() YOK, RAM'den (cachedConfig) OKUNUYOR 🔥
    const config = cachedConfig; 
    
    if (config.isLocked && realId !== ADMIN_ID) {
        return res.json({ success: false, isLocked: true, message: "SİSTEM BAKIMDA" });
    }
    
    req.boostMult = (config.boostEndTime && config.boostEndTime > new Date()) ? config.boostMultiplier : 1;
    req.realTelegramId = realId; 
    next();
};

app.post('/api/user/save-wallet', secureRoute, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const user = await User.findOneAndUpdate(
            { telegramId: req.realTelegramId },
            { walletAddress: walletAddress },
            { new: true }
        );
        if (user) addRadarLog(`👛 @${user.username} cüzdanını bağladı.`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    const telegramId = req.realTelegramId;
    const config = cachedConfig; // RAM'den al
    
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { 
                    addPoints(referrer, config.refReward); referrer.referralCount += 1; await referrer.save(); 
                    addPoints(user, config.refReward); 
                    addRadarLog(`👥 @${user.username || 'Yeni'} ağa katıldı. (Ref: @${referrer.username})`);
                }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); let settings = await Settings.findOne() || await Settings.create({});
        
        const isBoostActive = config.boostEndTime && config.boostEndTime > new Date();
        
        res.json({ 
            success: true, 
            user, 
            botUsername: settings.botUsername, 
            isAdmin: String(telegramId) === String(ADMIN_ID), 
            announcements: settings.announcements, 
            isBoostActive, 
            boostMultiplier: config.boostMultiplier,
            costs: {
                spin: config.spinCost,
                predict: config.predictCost,
                airdrop: config.airdropCost,
                lb1: config.lootbox1Cost,
                lb2: config.lootbox2Cost,
                lb3: config.lootbox3Cost
            },
            rewards: {
                spinLow: config.spinLow,
                spinMid: config.spinMid,
                spinJackpot: config.spinJackpot
            }
        });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const config = cachedConfig; // RAM'den al
    const now = new Date(); const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    
    const baseReward = config.dailyBaseReward * Math.pow(2, user.streak - 1); 
    const finalReward = baseReward * req.boostMult;
    
    addPoints(user, finalReward); user.lastCheckin = now; await user.save();
    addRadarLog(`🎁 @${user.username} Günlük Ödül aldı. (+${finalReward})`);
    res.json({ success: true, points: user.points, streak: user.streak, reward: finalReward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { packageId } = req.body; let cost = packageId === 1 ? 10000 : (packageId === 2 ? 50000 : 100000); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost, adTickets: (packageId === 1 ? 10 : (packageId === 2 ? 50 : 100)) } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    addRadarLog(`🎟️ @${user.username} Reklam Paketi satın aldı.`);
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, adTickets: { $gt: 0 } }, { $inc: { adTickets: -1 } }, { new: true });
    if (!user) return res.json({ success: false });
    const config = cachedConfig; // RAM'den al
    
    const finalReward = config.adReward * req.boostMult; 
    addPoints(user, finalReward); await user.save();
    addRadarLog(`📺 @${user.username} Reklam izledi. (+${finalReward})`);
    res.json({ success: true, points: user.points, adTickets: user.adTickets, reward: finalReward });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); const now = new Date();
    const config = cachedConfig; // RAM'den al
    
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const baseReward = config.mineBaseReward + ((user.miningLevel - 1) * config.mineLevelStep); 
        const finalReward = baseReward * req.boostMult;
        addPoints(user, finalReward); user.lastMining = now; user.isMiningNotified = false; await user.save(); 
        addRadarLog(`⛏️ @${user.username} Maden topladı. (+${finalReward})`);
        return res.json({ success: true, points: user.points, reward: finalReward });
    }
    res.json({ success: false });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: upgradeCost } }, { $inc: { points: -upgradeCost, miningLevel: 1 } }, { new: true });
    if (updatedUser) { 
        addRadarLog(`⚙️ @${updatedUser.username} Motorunu Seviye ${updatedUser.miningLevel} yaptı.`);
        res.json({ success: true, points: updatedUser.points, newLevel: updatedUser.miningLevel }); 
    } else { res.json({ success: false }); }
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { code } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz!" });
    if (promo.usedBy.includes(req.realTelegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    if (promo.usedBy.length >= promo.maxUsage) { promo.isActive = false; await promo.save(); return res.json({ success: false, message: "Sınır doldu!" }); }
    promo.usedBy.push(req.realTelegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); 
    addRadarLog(`🎫 @${user.username} [${code}] promosunu kullandı.`);
    res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/arcade/zarzara', secureRoute, async (req, res) => {
    const { bet } = req.body; const amount = parseInt(bet);
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP." });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    const diceValue = Math.floor(Math.random() * 6) + 1; let winAmount = 0;
    if (diceValue >= 4) { winAmount = amount * 2; addPoints(user, winAmount); await user.save(); }
    addRadarLog(`🎲 @${user.username} Zarzara oynadı. Sonuç: ${diceValue >= 4 ? 'KAZANDI (+'+winAmount+')' : 'KAYBETTİ'}`);
    res.json({ success: true, diceValue, winAmount, points: user.points });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const config = cachedConfig; // RAM'den al
    const cost = config.spinCost;
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" }); 
    
    const pEmpty = config.spinProbEmpty || 40;
    const pLow = config.spinProbLow || 35;
    const pCost = config.spinProbCost || 17;
    const pMid = config.spinProbMid || 7;

    const rand = Math.random() * 100; 
    let prize = 0; let msg = "BOŞ";
    
    if (rand <= pEmpty) { prize = 0; msg = "Şansını Dene"; } 
    else if (rand <= pEmpty + pLow) { prize = config.spinLow; msg = "Yarım Teselli"; } 
    else if (rand <= pEmpty + pLow + pCost) { prize = config.spinCost; msg = "Amorti!"; } 
    else if (rand <= pEmpty + pLow + pCost + pMid) { prize = config.spinMid; msg = "İKİYE KATLADIN!"; } 
    else { prize = config.spinJackpot; msg = "💥 JACKPOT! 💥"; }
    
    addRadarLog(`🎰 @${user.username} Çark çevirdi. Ödül: ${prize}`);
    if (prize === config.spinJackpot) broadcastBigWin(user.username, user.firstName, "Gelir Çarkı", prize);
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/gepcoz', secureRoute, async (req, res) => {
    const { token } = req.body; const secret = process.env.HCAPTCHA_SECRET;
    if (!token || !secret) return res.json({ success: false, message: "Yapılandırma hatası." });
    try {
        const params = new URLSearchParams(); params.append('secret', secret); params.append('response', token);
        const verifyRes = await fetch('https://hcaptcha.com/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
        const data = await verifyRes.json();
        if (data.success) {
            const config = cachedConfig; // RAM'den al
            const user = await User.findOne({ telegramId: req.realTelegramId });
            const finalReward = config.gepcozReward * req.boostMult;
            addPoints(user, finalReward); await user.save();
            addRadarLog(`🔓 @${user.username} Gepçöz çözdü. (+${finalReward})`);
            res.json({ success: true, points: user.points, reward: finalReward });
        } else { res.json({ success: false, message: "Doğrulama başarısız." }); }
    } catch (e) { res.json({ success: false, message: "Sistem hatası." }); }
});

app.post('/api/arcade/predict/start', secureRoute, async (req, res) => {
    const config = cachedConfig; // RAM'den al
    const { guess } = req.body; const cost = config.predictCost; 
    if (activePredictions.has(req.realTelegramId)) return res.json({ success: false, message: "Zaten devam eden tahminin var!" });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    try {
        const r1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d1 = await r1.json(); const p1 = parseFloat(d1.price);
        activePredictions.set(req.realTelegramId, { guess, p1, startTime: Date.now() });
        res.json({ success: true, price1: p1, points: user.points });
    } catch (e) { 
        await User.updateOne({ telegramId: req.realTelegramId }, { $inc: { points: cost } }); 
        res.json({ success: false, message: "Fiyat alınamadı, iade edildi." }); 
    }
});

app.post('/api/arcade/predict/result', secureRoute, async (req, res) => {
    const config = cachedConfig; // RAM'den al
    const prediction = activePredictions.get(req.realTelegramId);
    if (!prediction) return res.json({ success: false, message: "Aktif tahmin yok." });
    if (Date.now() - prediction.startTime < 9000) return res.json({ success: false, message: "Süre dolmadı!" });
    activePredictions.delete(req.realTelegramId);
    try {
        const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d2 = await r2.json(); const p2 = parseFloat(d2.price);
        let won = false; if ((prediction.guess === 'UP' && p2 > prediction.p1) || (prediction.guess === 'DOWN' && p2 < prediction.p1)) won = true;
        let user = await User.findOne({ telegramId: req.realTelegramId });
        if (won) { addPoints(user, config.predictReward); await user.save(); }
        addRadarLog(`📈 @${user.username} Kripto Tahmini: ${won ? 'BAŞARILI' : 'BAŞARISIZ'}`);
        res.json({ success: true, won, price1: prediction.p1, price2: p2, points: user.points });
    } catch (e) { 
        let user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: config.predictCost } }, { new: true });
        res.json({ success: false, message: "Bağlantı koptu, iade edildi.", points: user.points }); 
    }
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const config = cachedConfig; // RAM'den al
    const { boxType } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); let lastOpenDate;
    if (boxType === 1) lastOpenDate = user.lastLootbox1; else if (boxType === 2) lastOpenDate = user.lastLootbox2; else if (boxType === 3) lastOpenDate = user.lastLootbox3;
    if ((now - new Date(lastOpenDate || 0)) < 24 * 60 * 60 * 1000) return res.json({ success: false });
    
    let cost = boxType === 1 ? config.lootbox1Cost : (boxType === 2 ? config.lootbox2Cost : config.lootbox3Cost);
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!updatedUser) return res.json({ success: false });
    
    if (boxType === 1) updatedUser.lastLootbox1 = now; else if (boxType === 2) updatedUser.lastLootbox2 = now; else updatedUser.lastLootbox3 = now;
    
    let prize = 0; const rand = Math.random() * 100;
    if (boxType === 1) prize = rand > 90 ? config.lootSmall : 500; 
    else if (boxType === 2) prize = rand > 90 ? config.lootMid : 3000; 
    else prize = rand > 95 ? config.lootBig : 15000;
    
    let boxName = boxType === 1 ? "Standart Kapsül" : (boxType === 2 ? "Nadir Kapsül" : "Efsanevi Kapsül");
    addRadarLog(`📦 @${updatedUser.username} ${boxName} açtı. Ödül: ${prize}`);
    if ((boxType === 1 && prize === config.lootSmall) || (boxType === 2 && prize === config.lootMid) || (boxType === 3 && prize === config.lootBig)) broadcastBigWin(updatedUser.username, updatedUser.firstName, boxName, prize);
    
    addPoints(updatedUser, prize); await updatedUser.save();
    res.json({ success: true, prize, points: updatedUser.points });
});

app.post('/api/airdrop/list', secureRoute, async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links: links.map(l => ({ _id: l._id, username: l.username, title: l.title, description: l.description, url: l.url, hasJoined: l.joinedUsers.includes(req.realTelegramId), isOwner: l.telegramId === req.realTelegramId })) });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const config = cachedConfig; // RAM'den al
    const { title, description, url } = req.body;
    const cost = config.airdropCost; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if(!user) return res.json({success: false});
    let existing = await AirdropLink.findOne({ telegramId: req.realTelegramId });
    if (existing) { existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date(); await existing.save(); } 
    else { await AirdropLink.create({ telegramId: req.realTelegramId, username: user.username || user.firstName, title, description, url }); }
    addRadarLog(`📢 @${user.username} VIP Panoya ilan verdi.`);
    res.json({success: true, points: user.points, message: "Pano güncellendi!"});
});

app.post('/api/airdrop/join', secureRoute, async (req, res) => {
    const { projectId } = req.body;
    try {
        const project = await AirdropLink.findOneAndUpdate({ _id: projectId, joinedUsers: { $ne: req.realTelegramId }, telegramId: { $ne: req.realTelegramId } }, { $addToSet: { joinedUsers: req.realTelegramId } }, { new: true });
        if (!project) return res.json({ success: false });
        const user = await User.findOne({ telegramId: req.realTelegramId });
        if (user) { addPoints(user, 10000); await user.save(); return res.json({ success: true, points: user.points }); }
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
    const { taskId } = req.body; const task = await Task.findOne({ taskId }); if (!task) return res.json({ success: false }); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, completedTasks: { $ne: taskId } }, { $addToSet: { completedTasks: taskId } }, { new: true });
    if (!user) return res.json({ success: false }); 
    const finalReward = task.reward * req.boostMult; 
    addPoints(user, finalReward); await user.save(); 
    addRadarLog(`🎯 @${user.username} Görev tamamladı: ${task.title}`);
    res.json({ success: true, points: user.points }); 
});

app.post('/api/arcade/crash/start', secureRoute, async (req, res) => {
    const { bet } = req.body; 
    const amount = parseInt(bet);
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP." });
    if (activeCrashSessions.has(req.realTelegramId)) return res.json({ success: false, message: "Devam eden oyununuz var!" });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    let cPoint = 1.00;
    const rand = Math.random();
    if (rand < 0.05) { cPoint = 1.00; } else {
        cPoint = (1.00 / (1.00 - (Math.random() * 0.99))).toFixed(2);
        if (cPoint > 50.00) cPoint = (15.00 + Math.random() * 20.00).toFixed(2); 
    }
    activeCrashSessions.set(req.realTelegramId, { bet: amount, crashPoint: parseFloat(cPoint) });
    addRadarLog(`🚀 @${user.username} Çöküş oyunu başlattı. (Bahis: ${amount})`);
    res.json({ success: true, points: user.points, crashPoint: cPoint });
});

app.post('/api/arcade/crash/cashout', secureRoute, async (req, res) => {
    const session = activeCrashSessions.get(req.realTelegramId);
    if (!session) return res.json({ success: false, message: "Aktif oyun bulunamadı." });
    const requestedMult = parseFloat(req.body.multiplier);
    activeCrashSessions.delete(req.realTelegramId);
    if (requestedMult <= session.crashPoint && requestedMult >= 1.00) {
        const winAmount = Math.floor(session.bet * requestedMult);
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: winAmount } }, { new: true });
        addRadarLog(`🪂 @${user.username} Çöküşten çekildi! Kazanç: ${winAmount} GEP (${requestedMult}x)`);
        if (winAmount >= 50000) broadcastBigWin(user.username, user.firstName, "GEP Roketi", winAmount);
        return res.json({ success: true, winAmount, points: user.points });
    } else {
        return res.json({ success: false, message: "Roket zaten patladı!" });
    }
});

app.post('/api/arcade/crash/notify-loss', secureRoute, async (req, res) => {
    if (activeCrashSessions.has(req.realTelegramId)) { activeCrashSessions.delete(req.realTelegramId); }
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
