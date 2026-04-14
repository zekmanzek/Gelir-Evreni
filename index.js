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

// --- AYARLAR ---
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

// Veritabanı bağlantısı
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Gelir Evreni v3.0 - Sistem Aktif"))
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
    announcements: { type: [String], default: [] },
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

const checkBan = async (req, res, next) => {
    const teleId = req.body.telegramId;
    if (teleId) {
        const user = await User.findOne({ telegramId: teleId });
        if (user && user.isBanned) return res.status(403).json({ success: false, message: "Hesabınız yasaklanmıştır." });
    }
    next();
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
            if (firstName) user.firstName = firstName;
        }
        user.level = calculateLevel(user.points);
        await user.save();

        const settings = await Settings.findOne() || await Settings.create({});
        res.json({ 
            success: true, 
            user, 
            botUsername: settings.botUsername, 
            isAdmin: telegramId === ADMIN_ID,
            announcements: settings.announcements 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne() || { miningMultiplier: 1 };
        const now = new Date();
        const cooldown = 4 * 60 * 60 * 1000;
        if (user && (now - new Date(user.lastMining)) > cooldown) {
            let baseReward = 1000;
            if (user.level === 'Gümüş') baseReward += 100;
            if (user.level === 'Altın') baseReward += 250;
            if (user.level === 'Platin') baseReward += 500;
            if (user.level === 'Elmas') baseReward += 1000;
            const finalReward = baseReward * (settings.miningMultiplier || 1);
            user.points += finalReward;
            user.lastMining = now;
            user.level = calculateLevel(user.points);
            await user.save();
            return res.json({ success: true, points: user.points, reward: finalReward });
        }
        res.json({ success: false, message: "Maden henüz hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/adsgram-reward', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne();
        const reward = settings ? settings.adsgramReward : 500;
        user.points += reward;
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points, reward: reward });
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

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ tasks });
});

app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find().sort({ points: -1 }).limit(10);
    res.json({ success: true, leaderboard: topUsers });
});

// --- ADMIN KOMUTLARI ---
app.post('/api/admin/stats', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const totalUsers = await User.countDocuments();
    const totalPointsRes = await User.aggregate([{ $group: { _id: null, total: { $sum: "$points" } } }]);
    const settings = await Settings.findOne() || { announcements: [] };
    const tasks = await Task.find();
    res.json({ totalUsers, totalPoints: totalPointsRes[0]?.total || 0, announcements: settings.announcements, tasks });
});

app.post('/api/admin/add-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { title, reward, target } = req.body;
    await Task.create({ taskId: 'task_' + Date.now(), title, reward, target });
    res.json({ success: true });
});

app.post('/api/admin/delete-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Task.deleteOne({ taskId: req.body.taskId });
    res.json({ success: true });
});

app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { targetId, action, amount } = req.body;
    let query = targetId.startsWith('@') ? { username: targetId.replace('@', '').toLowerCase() } : { telegramId: targetId };
    const targetUser = await User.findOne(query);
    if (!targetUser) return res.json({ success: false });
    const val = parseInt(amount) || 0;
    if (action === 'add') targetUser.points += val;
    else if (action === 'set') targetUser.points = val;
    else if (action === 'ban') targetUser.isBanned = true;
    else if (action === 'unban') targetUser.isBanned = false;
    targetUser.level = calculateLevel(targetUser.points);
    await targetUser.save();
    res.json({ success: true });
});

// --- ANA DOSYA VE PORT ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', '
