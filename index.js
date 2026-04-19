require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";

const bot = new TelegramBot(token, { 
    polling: { autoStart: true, params: { timeout: 10 } } 
});

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Gelir Evreni v3.0 - Sistem Aktif"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, index: true },
    username: { type: String, default: '', index: true }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastMining: { type: Date, default: new Date(0) },
    lastCheckin: { type: Date, default: new Date(0) }, // Günlük ödül için
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: String, title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
    announcements: [String],
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 500 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' }
}));

const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

const checkBan = async (req, res, next) => {
    try {
        const teleId = req.body.telegramId;
        if (teleId) {
            const user = await User.findOne({ telegramId: teleId });
            if (user && user.isBanned) return res.status(403).json({ success: false, message: "Yasaklısınız." });
        }
        next();
    } catch (err) { next(); }
};

// --- API ROTALARI ---

app.post('/api/user/auth', checkBan, async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName });
        } else {
            if (username) user.username = username.toLowerCase();
        }
        user.level = calculateLevel(user.points);
        await user.save();
        let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// YENİ: Günlük Ödül
app.post('/api/daily-reward', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const lastCheckin = new Date(user.lastCheckin);
        if (now - lastCheckin >= 24 * 60 * 60 * 1000) {
            user.points += 500; // Ödül miktarı
            user.lastCheckin = now;
            await user.save();
            res.json({ success: true, points: user.points, message: "Günlük ödül başarıyla alındı!" });
        } else {
            res.json({ success: false, message: "Ödülünüzü zaten aldınız, 24 saat bekleyin." });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// YENİ: Reklam Bonusu
app.post('/api/ad-reward', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne() || { adsgramReward: 500 };
        user.points += settings.adsgramReward;
        await user.save();
        res.json({ success: true, points: user.points, reward: settings.adsgramReward });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne() || { miningMultiplier: 1 };
        const now = new Date();
        if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
            const reward = 1000 * (settings.miningMultiplier || 1);
            user.points += reward;
            user.lastMining = now;
            await user.save();
            return res.json({ success: true, points: user.points, reward });
        }
        res.json({ success: false, message: "Maden hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/tasks/complete', checkBan, async (req, res) => {
    const { telegramId, taskId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const task = await Task.findOne({ taskId });
        if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false });
        user.points += task.reward;
        user.completedTasks.push(taskId);
        await user.save();
        res.json({ success: true, points: user.points });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ tasks });
});

app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find().sort({ points: -1 }).limit(10);
    res.json({ success: true, leaderboard: topUsers });
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌟 **Gelir Evreni'ne Hoş Geldiniz!**", {
        reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }]] }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} üzerinde aktif.`));

bot.on('polling_error', (error) => console.log("Bot Hatası:", error.message));
