require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
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
    .then(() => console.log("✅ Gelir Evreni v3.0 - Sistem Aktif (Webhook Mode)"))
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
    completedTasks: { type: [String], default: [] },
    lastMining: { type: Date, default: new Date(0) },
    lastCheckin: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: { type: String, unique: true },
    title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
    announcements: [String],
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 500 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' }
}));

// --- API ROTALARI ---
app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) user = new User({ telegramId, username: (username || '').toLowerCase(), firstName });
    else { if (username) user.username = username.toLowerCase(); }
    await user.save();
    let settings = await Settings.findOne() || await Settings.create({});
    res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
});

// Günlük Ödül (100'den başlayıp 2'ye katlanan streak sistemi)
app.post('/api/daily-reward', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    
    const now = new Date();
    const lastCheckin = new Date(user.lastCheckin);
    const diffHours = (now - lastCheckin) / (1000 * 60 * 60);

    if (diffHours < 24) {
        return res.json({ success: false, message: "Ödülünüzü zaten aldınız, 24 saat bekleyin." });
    }

    // Eğer 48 saatten fazla süre geçmişse seriyi sıfırla, aksi halde artır. (Maks 7 gün)
    if (diffHours >= 48) {
        user.streak = 1;
    } else {
        user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    }

    // Ödül hesaplama: 1. Gün: 100, 2. Gün: 200, 3. Gün: 400 ...
    const reward = 100 * Math.pow(2, user.streak - 1);
    
    user.points += reward;
    user.lastCheckin = now;
    await user.save();
    
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/adsgram-reward', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    const settings = await Settings.findOne() || { adsgramReward: 500 };
    user.points += settings.adsgramReward;
    await user.save();
    res.json({ success: true, points: user.points });
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        user.points += 1000;
        user.lastMining = now;
        await user.save();
        return res.json({ success: true, points: user.points, reward: 1000 });
    }
    res.json({ success: false, message: "Maden hazır değil." });
});

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = await Task.findOne({ taskId });
    if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false });
    user.points += task.reward;
    user.completedTasks.push(taskId);
    await user.save();
    res.json({ success: true, points: user.points });
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });

// Sıralama ilk 100 olarak güncellendi
app.get('/api/leaderboard', async (req, res) => { res.json({ success: true, leaderboard: await User.find().sort({ points: -1 }).limit(100) }); });

// --- ADMIN API ---
app.post('/api/admin/stats', async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    const settings = await Settings.findOne() || { announcements: [] };
    res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() });
});

app.post('/api/admin/add-task', async (req, res) => {
    await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target });
    res.json({ success: true });
});

app.post('/api/admin/delete-task', async (req, res) => {
    await Task.deleteOne({ taskId: req.body.taskId });
    res.json({ success: true });
});

app.post('/api/admin/announcement', async (req, res) => {
    const s = await Settings.findOne() || await Settings.create({});
    if(req.body.action === 'add') s.announcements.push(req.body.text);
    else s.announcements.splice(req.body.index, 1);
    await s.save();
    res.json({ success: true });
});

app.post('/api/admin/user-manage', async (req, res) => {
    const { targetId, action, amount } = req.body;
    const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] });
    if (!user) return res.json({ success: false });
    if (action === 'add') user.points += Number(amount);
    if (action === 'set') user.points = Number(amount);
    if (action === 'ban') user.isBanned = true;
    if (action === 'unban') user.isBanned = false;
    await user.save();
    res.json({ success: true });
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "🌟 Gelir Evreni Başlat!", { reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: WEBHOOK_URL } }]] } });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} üzerinde aktif.`));
