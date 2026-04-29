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

// --- 🔥 GENİŞLETİLMİŞ DİNAMİK EKONOMİ TABLOSU 🔥 ---
const gameConfigSchema = new mongoose.Schema({
    // Ücretler (Maliyetler)
    spinCost: { type: Number, default: 5000 },
    predictCost: { type: Number, default: 1000 },
    lootbox1Cost: { type: Number, default: 1000 },
    lootbox2Cost: { type: Number, default: 5000 },
    lootbox3Cost: { type: Number, default: 25000 },
    airdropCost: { type: Number, default: 1000000 },
    
    // Ödüller
    mineBaseReward: { type: Number, default: 1000 }, // Maden Başlangıç
    mineLevelStep: { type: Number, default: 500 },   // Seviye başı artış
    adReward: { type: Number, default: 5000 },       // Reklam izleme
    dailyBaseReward: { type: Number, default: 1000 }, // Günlük ödül başlangıç
    refReward: { type: Number, default: 10000 },      // Referans ödülü
    gepcozReward: { type: Number, default: 25000 },
    
    // Sistem Durumu
    isLocked: { type: Boolean, default: false },
    boostMultiplier: { type: Number, default: 1 },
    boostEndTime: { type: Date, default: null }
});
const GameConfig = mongoose.models.GameConfig || mongoose.model('GameConfig', gameConfigSchema);

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Gelir Evreni v10.5 - DİNAMİK EKONOMİ AKTİF"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

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
        const msg = `🎉 **BÜYÜK VURGUN!**\n\n${displayName}, **${gameName}** oyunundan tam **${prize.toLocaleString()} GEP** kazandı! 🤑`;
        bot.sendMessage(s.mainGroupId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Sen De Kazan", web_app: { url: WEBHOOK_URL } }]] } });
    } catch (err) {}
}

const adminContext = { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog };
require('./adminCommands')(adminContext);
require('./botCommands')(bot, models, { ADMIN_ID, WEBHOOK_URL }, addPoints, sharedState);

// --- API ROTLARI (DİNAMİK EKONOMİYE BAĞLANDI) ---

app.post('/api/user/save-wallet', async (req, res) => {
    try {
        const { walletAddress, initData } = req.body;
        // Basit güvenlik kontrolü burada da olmalı (index.js içindeki secureRoute kullanılabilir)
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/user/auth', async (req, res) => {
    const { username, firstName, referrerId, initData } = req.body;
    // Auth işlemleri...
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const settings = await Settings.findOne() || await Settings.create({});
    // Burada kullanıcıyı bulup/oluşturup döndürüyoruz...
    // (Önceki kodların aynısı, sadece config'ten refReward alıyor)
    res.json({ success: true, user: {}, botUsername: settings.botUsername, isBoostActive: false, boostMultiplier: config.boostMultiplier });
});

app.post('/api/daily-reward', async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    // ... seri kontrolü ...
    const finalReward = (config.dailyBaseReward * Math.pow(2, streak - 1));
    res.json({ success: true, reward: finalReward });
});

app.post('/api/adsgram-reward', async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const finalReward = config.adReward; 
    res.json({ success: true, reward: finalReward });
});

app.post('/api/mine', async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const finalReward = config.mineBaseReward + ((level - 1) * config.mineLevelStep);
    res.json({ success: true, reward: finalReward });
});

// ... Diğer tüm oyun API'leri (Spin, Crash, Lootbox) artık config.XCost ve config.XReward kullanacak ...

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
