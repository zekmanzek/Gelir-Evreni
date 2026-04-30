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

// 🔥 SİBER ÖNBELLEK (CACHE) 🔥
let cachedConfig = null;

async function refreshConfigCache() {
    try {
        cachedConfig = await GameConfig.findOne() || await GameConfig.create({});
        console.log("♻️ Ekonomi RAM'e Alındı.");
    } catch (err) { console.error("❌ RAM Hatası:", err); }
}

mongoose.connect(MONGODB_URI)
    .then(async () => {
        console.log("✅ Gelir Evreni v10.8 - SİBER ŞALTERLER AKTİF");
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
    const initData = req.body.initData || req.query.initData;
    const realId = getTelegramUserFromInitData(initData);
    if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    
    if (!cachedConfig) await refreshConfigCache();
    const config = cachedConfig; 
    
    if (config.isLocked && realId !== ADMIN_ID) return res.json({ success: false, isLocked: true, message: "BAKIM" });
    
    req.boostMult = (config.boostEndTime && config.boostEndTime > new Date()) ? config.boostMultiplier : 1;
    req.realTelegramId = realId; 
    next();
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

app.post('/api/user/save-wallet', secureRoute, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { walletAddress: walletAddress }, { new: true });
        if (user) addRadarLog(`👛 @${user.username} cüzdan bağladı.`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    const telegramId = req.realTelegramId;
    const config = cachedConfig;
    try {
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
            announcements: settings.announcements, isBoostActive: (config.boostEndTime && config.boostEndTime > new Date()), 
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
    const config = cachedConfig;
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
    const config = cachedConfig;
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > config.miningDuration * 60 * 1000) {
        const reward = (config.mineBaseReward + ((user.miningLevel - 1) * config.mineLevelStep)) * req.boostMult;
        addPoints(user, reward); user.lastMining = now; await user.save();
        addRadarLog(`⛏️ @${user.username} Maden topladı (+${reward})`);
        return res.json({ success: true, points: user.points, reward });
    }
    res.json({ success: false });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    if (!cachedConfig.isSpinActive) return res.json({ success: false, message: "KAPALI" });
    const config = cachedConfig;
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

app.post('/api/arcade/crash/start', secureRoute, async (req, res) => {
    if (!cachedConfig.isCrashActive) return res.json({ success: false, message: "KAPALI" });
    const amount = parseInt(req.body.bet);
    if (!amount || amount < 100) return res.json({ success: false, message: "Min 100" });
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
    if (mult <= session.crashPoint) {
        const win = Math.floor(session.bet * mult);
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: win } }, { new: true });
        return res.json({ success: true, winAmount: win, points: user.points });
    }
    res.json({ success: false });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
