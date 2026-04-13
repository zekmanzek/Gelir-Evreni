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

// AYARLAR
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI).then(() => console.log("✅ Sistem Başlatıldı")).catch(err => console.log(err));

// VERİ MODELLERİ
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: String, username: String, firstName: String,
    points: { type: Number, default: 1000 },
    lastMining: { type: Date, default: new Date(0) },
    completedTasks: [String], streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: String, title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

// API'LAR
app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    let user = await User.findOneAndUpdate({ telegramId }, { username, firstName }, { upsert: true, new: true });
    res.json({ success: true, user, isAdmin: telegramId === ADMIN_ID });
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const cooldown = 4 * 60 * 60 * 1000;
    if (new Date() - new Date(user.lastMining) < cooldown) return res.json({ success: false, message: "Maden henüz soğumadı!" });
    user.points += 1000;
    user.lastMining = new Date();
    await user.save();
    res.json({ success: true, points: user.points });
});

app.get('/api/tasks', async (req, res) => res.json({ tasks: await Task.find({ isActive: true }) }));

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = await Task.findOne({ taskId });
    if (user.completedTasks.includes(taskId)) return res.json({ success: false });
    user.points += task.reward;
    user.completedTasks.push(taskId);
    await user.save();
    res.json({ success: true, points: user.points });
});

app.get('/api/leaderboard', async (req, res) => res.json({ leaderboard: await User.find().sort({ points: -1 }).limit(10) }));

// ADMİN PANELİ FONKSİYONLARI
app.post('/api/admin/add-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send();
    await Task.create({ taskId: 't'+Date.now(), title: req.body.title, reward: req.body.reward, target: req.body.target });
    res.json({ success: true });
});

app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send();
    const { targetId, amount, action } = req.body;
    const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId.replace('@','') }] });
    if (!user) return res.json({ success: false });
    if (action === 'add') user.points += parseInt(amount);
    if (action === 'ban') user.isBanned = true;
    await user.save();
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 10000);
