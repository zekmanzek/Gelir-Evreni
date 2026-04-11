const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- AYARLAR ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = "1469411131"; 

const bot = new TelegramBot(token, { polling: true });
bot.on('error', (error) => console.log("Bot Hatası:", error.message));

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v2.6 Connected"));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: { type: String, default: '' }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastMining: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' }
});
const User = mongoose.model('User', UserSchema);

const SettingsSchema = new mongoose.Schema({
    announcements: { type: [String], default: [] },
    miningMultiplier: { type: Number, default: 1 },
    dynamicTasks: { type: Array, default: [
        { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
        { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' }
    ]}
});
const Settings = mongoose.model('Settings', SettingsSchema);

async function initSettings() {
    let s = await Settings.findOne();
    if (!s) await new Settings().save();
}
initSettings();

const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

// --- ADSGRAM REWARD ---
app.get('/adsgram-reward', async (req, res) => {
    const { teleId, status } = req.query;
    if (status !== 'done') return res.status(400).send('Reward not ready');
    try {
        const user = await User.findOne({ telegramId: teleId });
        if (user) {
            user.points += 500;
            user.level = calculateLevel(user.points);
            await user.save();
            try { bot.sendMessage(teleId, "📺 Reklam izleme ödülü: +500 GEP eklendi!"); } catch (err) {}
            return res.send('OK');
        }
        res.status(404).send('User not found');
    } catch (e) { res.status(500).send('Error'); }
});

// --- TELEGRAM BOT ---
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    let user = await User.findOne({ telegramId });
    const referrerId = match[1];

    if (!user) {
        user = new User({ telegramId, username: msg.from.username || '', firstName: msg.from.first_name || 'Kullanıcı' });
        if (referrerId && referrerId !== telegramId) {
            const referrer = await User.findOne({ telegramId: referrerId });
            if (referrer) {
                referrer.points += 500;
                referrer.referralCount += 1;
                referrer.level = calculateLevel(referrer.points);
                await referrer.save();
                bot.sendMessage(referrerId, `🎉 Yeni referans! +500 GEP kazandın.`);
            }
        }
        await user.save();
    }
    sendWelcomeMessage(chatId);
});

bot.onText(/\/start$/, async (msg) => {
    const telegramId = msg.from.id.toString();
    let user = await User.findOne({ telegramId });
    if(!user) {
        user = new User({ telegramId, username: msg.from.username || '', firstName: msg.from.first_name || 'Kullanıcı' });
        await user.save();
    }
    sendWelcomeMessage(msg.chat.id);
});

function sendWelcomeMessage(chatId) {
    bot.sendMessage(chatId, `🚀 *Gelir Evreni'ne Hoş Geldin!*`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç 📱", web_app: { url: `https://gelir-evreni.onrender.com` } }]] }
    });
}

// --- API ROTLARI ---
app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) user = new User({ telegramId, username, firstName });
        else { user.username = username; user.firstName = firstName; }
        user.level = calculateLevel(user.points);
        await user.save();
        const settings = await Settings.findOne();
        res.json({ success: true, user, isAdmin: telegramId === ADMIN_ID, announcements: settings ? settings.announcements : [] });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne();
        const now = new Date();
        if (user && (now - new Date(user.lastMining)) > 4*60*60*1000) {
            let reward = 1000 * (settings.miningMultiplier || 1);
            user.points += reward;
            user.lastMining = now;
            user.level = calculateLevel(user.points);
            await user.save();
            return res.json({ success: true, points: user.points, reward });
        }
        res.json({ success: false, message: "Henüz hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', async (req, res) => {
    const s = await Settings.findOne();
    res.json({ tasks: s ? s.dynamicTasks : [] });
});

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    const s = await Settings.findOne();
    const task = s.dynamicTasks.find(t => t.taskId === taskId);
    const user = await User.findOne({ telegramId });
    if (user && task && !user.completedTasks.includes(taskId)) {
        user.points += task.reward;
        user.completedTasks.push(taskId);
        user.level = calculateLevel(user.points);
        await user.save();
        return res.json({ success: true, points: user.points });
    }
    res.json({ success: false });
});

// --- ADMIN ÖZEL ---
app.post('/api/admin/stats', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const totalUsers = await User.countDocuments();
    const totalPoints = await User.aggregate([{ $group: { _id: null, t: { $sum: "$points" } } }]);
    const s = await Settings.findOne();
    res.json({ totalUsers, totalPoints: totalPoints[0]?.t || 0, announcements: s.announcements, tasks: s.dynamicTasks });
});

app.post('/api/admin/add-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $push: { announcements: req.body.text } });
    res.json({ success: true });
});

app.post('/api/admin/delete-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $pull: { announcements: req.body.text } });
    res.json({ success: true });
});

app.post('/api/admin/add-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const newTask = { taskId: 'task_' + Date.now(), ...req.body.task };
    await Settings.updateOne({}, { $push: { dynamicTasks: newTask } });
    res.json({ success: true });
});

app.post('/api/admin/delete-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $pull: { dynamicTasks: { taskId: req.body.taskId } } });
    res.json({ success: true });
});

app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const user = await User.findOne({ telegramId: req.body.targetId });
    if (!user) return res.json({ success: false });
    if (req.body.action === 'add') user.points += parseInt(req.body.amount);
    else user.points = parseInt(req.body.amount);
    user.level = calculateLevel(user.points);
    await user.save();
    res.json({ success: true, newPoints: user.points });
});

app.post('/api/admin/all-users', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const users = await User.find().sort({ points: -1 }).limit(100);
    res.json({ success: true, users });
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ points: -1 }).limit(10);
    res.json({ success: true, leaderboard: top });
});

app.post('/api/user/checkin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    const diff = now - new Date(user.lastCheckin || 0);
    if (diff < 24*60*60*1000) return res.json({ success: false, message: "Zaten aldın." });
    user.streak = (diff > 48*60*60*1000) ? 1 : (user.streak % 7) + 1;
    const rewards = [0, 100, 200, 300, 400, 500, 600, 1000];
    user.points += rewards[user.streak];
    user.lastCheckin = now;
    user.level = calculateLevel(user.points);
    await user.save();
    res.json({ success: true, points: user.points, streak: user.streak });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 10000);
