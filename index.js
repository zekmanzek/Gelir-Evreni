require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Gelir Evreni v3.5 - Motor Çalıştırıldı"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true, index: true },
    username: { type: String, default: '', index: true }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastMining: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const TaskSchema = new mongoose.Schema({
    taskId: { type: String, unique: true },
    title: { type: String },
    reward: { type: Number },
    target: { type: String },
    isActive: { type: Boolean, default: true }
});
const Task = mongoose.model('Task', TaskSchema);

const SettingsSchema = new mongoose.Schema({
    announcements: { type: [String], default: ["Hoş Geldiniz!"] },
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 500 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' }
});
const Settings = mongoose.model('Settings', SettingsSchema);

// --- YARDIMCI FONKSİYONLAR ---
const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

const isAdmin = (req, res, next) => {
    const adminId = req.body.adminId || req.query.adminId;
    if (adminId !== ADMIN_ID) return res.status(403).json({ success: false, message: "Yetkisiz Erişim!" });
    next();
};

const checkBan = async (req, res, next) => {
    const teleId = req.body.telegramId || req.query.teleId;
    if (teleId) {
        const user = await User.findOne({ telegramId: teleId });
        if (user && user.isBanned) return res.status(403).json({ success: false, message: "Yasaklandınız." });
    }
    next();
};

const getSettings = async () => {
    let s = await Settings.findOne();
    if (!s) s = await Settings.create({});
    return s;
};

// --- API ROTLARI ---

app.post('/api/user/auth', checkBan, async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    try {
        let user = await User.findOneAndUpdate(
            { telegramId },
            { username: (username || '').toLowerCase(), firstName: firstName || 'Kullanıcı' },
            { upsert: true, new: true }
        );
        user.level = calculateLevel(user.points);
        await user.save();
        const settings = await getSettings();
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: telegramId === ADMIN_ID, announcements: settings.announcements });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/daily-checkin', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const diffInHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
        if (diffInHours < 24) return res.json({ success: false, message: "Bugün ödülünüzü aldınız!" });
        user.streak = diffInHours > 48 ? 1 : (user.streak % 7) + 1;
        const reward = user.streak * 500;
        user.points += reward;
        user.lastCheckin = now;
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points, streak: user.streak, reward });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await getSettings();
        const now = new Date();
        const cooldown = 4 * 60 * 60 * 1000;
        if (now - new Date(user.lastMining) < cooldown) return res.json({ success: false, message: "Maden henüz soğumadı." });
        
        let reward = 1000;
        const bonus = { 'Gümüş': 100, 'Altın': 250, 'Platin': 500, 'Elmas': 1000 };
        reward = (reward + (bonus[user.level] || 0)) * settings.miningMultiplier;
        
        user.points += reward;
        user.lastMining = now;
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points, reward });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adsgram-reward', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await getSettings();
        user.points += (settings.adsgramReward || 500);
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points });
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
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN ---
app.post('/api/admin/stats', isAdmin, async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalPoints = await User.aggregate([{ $group: { _id: null, total: { $sum: "$points" } } }]);
    const settings = await getSettings();
    const tasks = await Task.find();
    res.json({ totalUsers, totalPoints: totalPoints[0]?.total || 0, settings, tasks });
});

app.post('/api/admin/add-task', isAdmin, async (req, res) => {
    const { title, reward, target } = req.body;
    await Task.create({ taskId: 'task_' + Date.now(), title, reward, target });
    res.json({ success: true });
});

app.post('/api/admin/user-manage', isAdmin, async (req, res) => {
    const { targetId, action, amount } = req.body;
    const user = await User.findOne(targetId.startsWith('@') ? { username: targetId.replace('@','').toLowerCase() } : { telegramId: targetId });
    if (!user) return res.json({ success: false });
    if (action === 'add') user.points += parseInt(amount);
    if (action === 'set') user.points = parseInt(amount);
    if (action === 'ban') user.isBanned = true;
    if (action === 'unban') user.isBanned = false;
    user.level = calculateLevel(user.points);
    await user.save();
    res.json({ success: true });
});

app.get('/api/tasks', async (req, res) => res.json({ tasks: await Task.find({ isActive: true }) }));
app.get('/api/leaderboard', async (req, res) => res.json({ success: true, leaderboard: await User.find().sort({ points: -1 }).limit(10) }));

bot.onText(/\/start$/, async (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 *Gelir Evreni'ne Hoş Geldin!*`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç 📱", web_app: { url: `https://gelir-evreni.onrender.com` } }]] }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 10000, () => console.log(`🚀 Sistem Aktif`));
