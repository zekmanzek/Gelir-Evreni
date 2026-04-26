require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

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
    .then(() => console.log("✅ Gelir Evreni v7.0 - Dinamik Görev Sistemi Aktif"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: String, unique: true, index: true },
    username: { type: String, default: '', index: true }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    dailyPoints: { type: Number, default: 0 }, 
    lastPointDate: { type: Date, default: Date.now }, 
    completedTasks: { type: [String], default: [] }, // Görev ID'leri burada tutulur
    lastMining: { type: Date, default: new Date(0) },
    lastCheckin: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false },
    miningLevel: { type: Number, default: 1 },
    adTickets: { type: Number, default: 0 },
    lastLootbox1: { type: Date, default: new Date(0) },
    lastLootbox2: { type: Date, default: new Date(0) },
    lastLootbox3: { type: Date, default: new Date(0) }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: { type: String, unique: true }, title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const AirdropLink = mongoose.model('AirdropLink', new mongoose.Schema({
    telegramId: { type: String, unique: true }, 
    username: String,
    title: String,
    description: String,
    url: String,
    updatedAt: { type: Date, default: Date.now } 
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
    announcements: [String],
    mainGroupId: { type: String, default: "" }
}));

const YesterdayWinner = mongoose.model('YesterdayWinner', new mongoose.Schema({ rank: Number, username: String, firstName: String, points: Number, date: { type: Date, default: Date.now } }));

function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) { user.dailyPoints = 0; }
    user.points += amount; user.dailyPoints += amount; user.lastPointDate = now;
}

// ==========================================
// 🛡️ GÜVENLİK VE ROTALAR
// ==========================================
function verifyTelegramWebAppData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash');
        initData.delete('hash');
        const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        return calculatedHash === hash;
    } catch (e) { return false; }
}

const secureRoute = (req, res, next) => {
    const initData = req.body.initData; if (!initData || !verifyTelegramWebAppData(initData)) return res.status(403).json({ success: false });
    next();
};

// --- GÖREVLERİ GETİR (ADMİN + KULLANICI LİNKLERİ) ---
app.get('/api/tasks', async (req, res) => {
    const adminTasks = await Task.find({ isActive: true });
    const sharedLinks = await AirdropLink.find().sort({ updatedAt: -1 }).limit(10); // Son 10 airdrop görev olarak görünür
    
    // Paylaşılan linkleri görev formatına çevir
    const dynamicTasks = sharedLinks.map(link => ({
        taskId: `ad_${link._id}`, // Başına ad_ koyarak ayırt ediyoruz
        title: `📢 Pano: ${link.title}`,
        reward: 1000,
        target: link.url
    }));

    res.json({ tasks: [...adminTasks, ...dynamicTasks] });
});

app.post('/api/tasks/complete', secureRoute, async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user || user.completedTasks.includes(taskId)) return res.json({ success: false });

    let reward = 0;
    if (taskId.startsWith("ad_")) {
        // Siber Pano göreviyse ödül sabit 1000
        reward = 1000;
    } else {
        // Admin göreviyse veritabanından ödülü al
        const task = await Task.findOne({ taskId });
        if (!task) return res.json({ success: false });
        reward = task.reward;
    }

    addPoints(user, reward);
    user.completedTasks.push(taskId);
    await user.save();
    res.json({ success: true, points: user.points });
});

// AİRDROP PANOSU LİSTE VE PAYLAŞIM
app.get('/api/airdrop/list', async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const { telegramId, title, description, url } = req.body;
    const user = await User.findOne({ telegramId });
    const cost = 250000; 

    if(!user || user.points < cost) return res.json({success: false, message: "Yetersiz Bakiye! 250.000 GEP gerekli."});
    
    user.points -= cost; 
    await user.save();

    let existing = await AirdropLink.findOne({ telegramId });
    if (existing) {
        existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date();
        await existing.save();
    } else {
        await AirdropLink.create({ telegramId, username: user.username || user.firstName, title, description, url });
    }
    res.json({success: true, points: user.points, message: "İlan başarıyla hem panoya hem görevlere eklendi!"});
});

// --- DİĞER STANDART ROTALAR ---
app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { telegramId, username, firstName, referrerId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { addPoints(referrer, 2500); referrer.referralCount += 1; await referrer.save(); addPoints(user, 1000); }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save();
        let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); user.lastMining = now; await user.save(); return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false, message: "Maden hazır değil." });
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const { telegramId, boxType } = req.body; const user = await User.findOne({ telegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); let lastOpen;
    if(boxType === 1) lastOpen = user.lastLootbox1; else if(boxType === 2) lastOpen = user.lastLootbox2; else lastOpen = user.lastLootbox3;
    if ((now - new Date(lastOpen || 0)) / (1000 * 60 * 60) < 24) return res.json({ success: false, message: "Günde 1 kez açabilirsin." });
    
    let cost = boxType === 1 ? 1000 : (boxType === 2 ? 5000 : 25000);
    if (user.points < cost) return res.json({ success: false, message: "Bakiye yetersiz." });
    
    user.points -= cost;
    if(boxType === 1) user.lastLootbox1 = now; else if(boxType === 2) user.lastLootbox2 = now; else user.lastLootbox3 = now;

    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (boxType === 3) { // Efsanevi Kapsül Ödülleri
        if (rand <= 20) prize = 0; else if (rand <= 50) prize = 15000; else if (rand <= 80) prize = 40000; else if (rand <= 95) prize = 100000; else prize = 250000;
    } else if (boxType === 2) {
        if (rand <= 30) prize = 0; else if (rand <= 65) prize = 3000; else if (rand <= 85) prize = 7500; else if (rand <= 95) prize = 20000; else prize = 50000;
    } else {
        if (rand <= 40) prize = 0; else if (rand <= 70) prize = 500; else if (rand <= 90) prize = 1500; else if (rand <= 99) prize = 5000; else prize = 10000;
    }
    if (prize > 0) addPoints(user, prize); await user.save();
    res.json({ success: true, prize, points: user.points, lastLootbox1: user.lastLootbox1, lastLootbox2: user.lastLootbox2, lastLootbox3: user.lastLootbox3 });
});

// ADMIN SİLME YETKİSİ
app.post('/api/admin/delete-airdrop', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    await AirdropLink.findByIdAndDelete(req.body.id);
    res.json({ success: true });
});

// Telegram Bot Komutları ve Webhook İşlemleri... (Önceki kodun aynısı)
bot.onText(/\/grububagla/, async (msg) => { if (String(msg.from.id) !== String(ADMIN_ID)) return; const s = await Settings.findOne() || await Settings.create({}); s.mainGroupId = msg.chat.id.toString(); await s.save(); bot.sendMessage(msg.chat.id, "✅ Sistem Entegre Edildi!"); });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
