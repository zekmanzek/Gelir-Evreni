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
    boostEndTime: { type: Date, default: null },
    miningDuration: { type: Number, default: 240 },
    announcementSpeed: { type: Number, default: 15 },
    isSpinActive: { type: Boolean, default: true },
    isCrashActive: { type: Boolean, default: true }
});
const GameConfig = mongoose.models.GameConfig || mongoose.model('GameConfig', gameConfigSchema);

// 🔥 SİBER KALKAN (YEDEK HAFIZA) 🔥
const fallbackConfig = {
    spinCost: 5000, predictCost: 1000, lootbox1Cost: 1000, lootbox2Cost: 5000, lootbox3Cost: 25000, airdropCost: 1000000,
    gepcozReward: 25000, refReward: 10000, mineBaseReward: 1000, mineLevelStep: 500, adReward: 5000, dailyBaseReward: 1000,
    spinJackpot: 50000, spinMid: 10000, spinLow: 2500, lootBig: 250000, lootMid: 50000, lootSmall: 10000, predictReward: 2000,
    spinProbEmpty: 40, spinProbLow: 35, spinProbCost: 17, spinProbMid: 7, spinProbJackpot: 1,
    isLocked: false, boostMultiplier: 1, boostEndTime: null, miningDuration: 240, announcementSpeed: 15,
    isSpinActive: true, isCrashActive: true
};

let cachedConfig = fallbackConfig; // Asla null olamaz!

async function refreshConfigCache() {
    try {
        const dbCfg = await GameConfig.findOne();
        if (dbCfg) cachedConfig = dbCfg;
        else await GameConfig.create({});
        console.log("♻️ Ekonomi RAM'e Alındı.");
    } catch (err) { console.error("❌ RAM Hatası (Yedek Hafıza Devrede):", err); }
}

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log("✅ Gelir Evreni v10.9 - SİBER KALKAN AKTİF");
        await refreshConfigCache();
    })
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => { bot.processUpdate(req.body); res.sendStatus(200); });

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
    user.points += amount; 
    user.dailyPoints += amount; 
    user.lastPointDate = new Date();
}

async function broadcastBigWin(username, firstName, gameName, prize) {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return;
        const displayName = username ? `@${username}` : firstName;
        const msg = `🎉 **BÜYÜK VURGUN!**\n\n${displayName}, **${gameName}** oyunundan tam **${prize.toLocaleString()} GEP** kazandı! 🤑`;
        bot.sendMessage(s.mainGroupId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Sen De Kazan", web_app: { url: WEBHOOK_URL } }]] } });
    } catch (err) {}
}

const botConfig = { ADMIN_ID, WEBHOOK_URL };
const adminContext = { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog, refreshConfigCache };
require('./adminCommands')(adminContext);
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);

const secureRoute = async (req, res, next) => {
    try {
        const initData = req.body.initData || req.query.initData;
        const realId = getTelegramUserFromInitData(initData);
        if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
        
        const config = cachedConfig || fallbackConfig; // Null olma şansı sıfır
        
        if (config.isLocked && realId !== ADMIN_ID) return res.json({ success: false, isLocked: true, message: "BAKIM" });
        
        req.boostMult = (config.boostEndTime && config.boostEndTime > new Date()) ? config.boostMultiplier : 1;
        req.realTelegramId = realId; 
        next();
    } catch(e) { res.status(500).json({ success: false }); }
};

function getTelegramUserFromInitData(telegramInitData) {
    try {
        if (!telegramInitData) return null;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); 
        initData.delete('hash'); 
        const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) return null;
        return JSON.parse(initData.get('user')).id.toString(); 
    } catch (error) { return null; }
}

// -----------------------------------------
// TÜM OYUN VE SİSTEM ROTASI (RESTORE EDİLDİ)
// -----------------------------------------

app.post('/api/user/save-wallet', secureRoute, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { walletAddress: walletAddress }, { new: true });
        if (user) addRadarLog(`👛 @${user.username} cüzdan bağladı.`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/user/auth', secureRoute, async (req, res) => {
    try {
        const { username, firstName, referrerId } = req.body;
        const telegramId = req.realTelegramId;
        const config = cachedConfig || fallbackConfig;
        
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { 
                    addPoints(referrer, config.refReward); referrer.referralCount += 1; await referrer.save(); 
                    addPoints(user, config.refReward); 
                }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); 
        
        let settings = await Settings.findOne() || await Settings.create({});
        res.json({ 
            success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), 
            announcements: settings.announcements, isBoostActive: (config.boostEndTime && new Date() < config.boostEndTime), 
            boostMultiplier: config.boostMultiplier, miningDuration: config.miningDuration, announcementSpeed: config.announcementSpeed,
            isSpinActive: config.isSpinActive, isCrashActive: config.isCrashActive,
            costs: { spin: config.spinCost, predict: config.predictCost, airdrop: config.airdropCost, lb1: config.lootbox1Cost, lb2: config.lootbox2Cost, lb3: config.lootbox3Cost },
            rewards: { spinLow: config.spinLow, spinMid: config.spinMid, spinJackpot: config.spinJackpot }
        });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId });
    if (!user) return res.json({ success: false });
    const config = cachedConfig || fallbackConfig;
    const now = new Date();
    const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    user.streak = diffHours >= 48 ? 1 : (user.streak >= 7 ? 1 : user.streak + 1);
    const reward = (config.dailyBaseReward * Math.pow(2, user.streak - 1)) * req.boostMult;
    addPoints(user, reward); user.lastCheckin = now; await user.save();
    addRadarLog(`🎁 @${user.username} Günlük Ödül (+${reward})`);
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId });
    const config = cachedConfig || fallbackConfig;
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > config.miningDuration * 60 * 1000) {
        const reward = (config.mineBaseReward + ((user.miningLevel - 1) * config.mineLevelStep)) * req.boostMult;
        addPoints(user, reward); user.lastMining = now; await user.save();
        addRadarLog(`⛏️ @${user.username} Maden topladı (+${reward})`);
        return res.json({ success: true, points: user.points, reward });
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

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const config = cachedConfig || fallbackConfig;
    if (!config.isSpinActive) return res.json({ success: false, message: "⚠️ Çark sistemi geçici olarak kapalıdır." });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: config.spinCost } }, { $inc: { points: -config.spinCost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" }); 
    const rand = Math.random() * 100; 
    let prize = 0; let msg = "BOŞ";
    if (rand <= config.spinProbEmpty) { prize = 0; msg = "Şansını Dene"; } 
    else if (rand <= config.spinProbEmpty + config.spinProbLow) { prize = config.spinLow; msg = "Yarım Teselli"; } 
    else if (rand <= config.spinProbEmpty + config.spinProbLow + config.spinProbCost) { prize = config.spinCost; msg = "Amorti!"; } 
    else if (rand <= config.spinProbEmpty + config.spinProbLow + config.spinProbCost + config.spinProbMid) { prize = config.spinMid; msg = "İKİYE KATLADIN!"; } 
    else { prize = config.spinJackpot; msg = "💥 JACKPOT! 💥"; }
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    if (prize === config.spinJackpot) broadcastBigWin(user.username, user.firstName, "Çark", prize);
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/zarzara', secureRoute, async (req, res) => {
    const { bet } = req.body; const amount = parseInt(bet);
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP." });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    const diceValue = Math.floor(Math.random() * 6) + 1; let winAmount = 0;
    if (diceValue >= 4) { winAmount = amount * 2; addPoints(user, winAmount); await user.save(); }
    res.json({ success: true, diceValue, winAmount, points: user.points });
});

app.post('/api/arcade/gepcoz', secureRoute, async (req, res) => {
    const { token } = req.body; const secret = process.env.HCAPTCHA_SECRET;
    if (!token || !secret) return res.json({ success: false, message: "Yapılandırma hatası." });
    try {
        const params = new URLSearchParams(); params.append('secret', secret); params.append('response', token);
        const verifyRes = await fetch('https://hcaptcha.com/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
        const data = await verifyRes.json();
        if (data.success) {
            const config = cachedConfig || fallbackConfig;
            const user = await User.findOne({ telegramId: req.realTelegramId });
            const finalReward = config.gepcozReward * req.boostMult;
            addPoints(user, finalReward); await user.save();
            res.json({ success: true, points: user.points, reward: finalReward });
        } else { res.json({ success: false, message: "Doğrulama başarısız." }); }
    } catch (e) { res.json({ success: false, message: "Sistem hatası." }); }
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const config = cachedConfig || fallbackConfig;
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
    
    addPoints(updatedUser, prize); await updatedUser.save();
    res.json({ success: true, prize, points: updatedUser.points });
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
    const config = cachedConfig || fallbackConfig;
    const finalReward = config.adReward * req.boostMult; 
    addPoints(user, finalReward); await user.save();
    res.json({ success: true, points: user.points, adTickets: user.adTickets, reward: finalReward });
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { code } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz!" });
    if (promo.usedBy.includes(req.realTelegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    if (promo.usedBy.length >= promo.maxUsage) { promo.isActive = false; await promo.save(); return res.json({ success: false, message: "Sınır doldu!" }); }
    promo.usedBy.push(req.realTelegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); 
    res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/airdrop/list', secureRoute, async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links: links.map(l => ({ _id: l._id, username: l.username, title: l.title, description: l.description, url: l.url, hasJoined: l.joinedUsers.includes(req.realTelegramId), isOwner: l.telegramId === req.realTelegramId })) });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const config = cachedConfig || fallbackConfig;
    const { title, description, url } = req.body;
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: config.airdropCost } }, { $inc: { points: -config.airdropCost } }, { new: true });
    if(!user) return res.json({success: false, message: "Yetersiz GEP!"});
    let existing = await AirdropLink.findOne({ telegramId: req.realTelegramId });
    if (existing) { existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date(); await existing.save(); } 
    else { await AirdropLink.create({ telegramId: req.realTelegramId, username: user.username || user.firstName, title, description, url }); }
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
    addPoints(user, task.reward * req.boostMult); await user.save(); 
    res.json({ success: true, points: user.points }); 
});

app.post('/api/arcade/crash/start', secureRoute, async (req, res) => {
    const config = cachedConfig || fallbackConfig;
    if (!config.isCrashActive) return res.json({ success: false, message: "⚠️ Roket pisti bakımda." });
    const amount = parseInt(req.body.bet);
    if (!amount || amount < 100) return res.json({ success: false, message: "Min 100" });
    if (activeCrashSessions.has(req.realTelegramId)) return res.json({ success: false, message: "Devam eden oyununuz var!" });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz" });
    let cp = (Math.random() < 0.05) ? 1.00 : (1.00 / (1.00 - (Math.random() * 0.99))).toFixed(2);
    activeCrashSessions.set(req.realTelegramId, { bet: amount, crashPoint: parseFloat(cp) });
    res.json({ success: true, points: user.points, crashPoint: cp });
});

app.post('/api/arcade/crash/cashout', secureRoute, async (req, res) => {
    const session = activeCrashSessions.get(req.realTelegramId);
    if (!session) return res.json({ success: false });
    const mult = parseFloat(req.body.multiplier);
    activeCrashSessions.delete(req.realTelegramId);
    if (mult <= session.crashPoint && mult >= 1.00) {
        const win = Math.floor(session.bet * mult);
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: win } }, { new: true });
        return res.json({ success: true, winAmount: win, points: user.points });
    }
    res.json({ success: false, message: "Roket zaten patladı!" });
});

app.post('/api/arcade/crash/notify-loss', secureRoute, async (req, res) => {
    if (activeCrashSessions.has(req.realTelegramId)) { activeCrashSessions.delete(req.realTelegramId); }
    res.json({ success: true });
});

app.post('/api/arcade/predict/start', secureRoute, async (req, res) => {
    const config = cachedConfig || fallbackConfig;
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
    const config = cachedConfig || fallbackConfig;
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
        res.json({ success: true, won, price1: prediction.p1, price2: p2, points: user.points });
    } catch (e) { 
        let user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: config.predictCost } }, { new: true });
        res.json({ success: false, message: "Bağlantı koptu, iade edildi.", points: user.points }); 
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
