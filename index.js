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

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v3.0 - Admin & Dynamic Systems Active"));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: { type: String, default: '' }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' }
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

async function initSettings() {
    let s = await Settings.findOne();
    if (!s) {
        s = new Settings();
        try {
            const botInfo = await bot.getMe();
            s.botUsername = botInfo.username;
        } catch(e) {}
        await s.save();
    }
    
    let taskCount = await Task.countDocuments();
    if (taskCount === 0) {
        await Task.insertMany([
            { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
            { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
            { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' }
        ]);
        console.log("✅ Varsayılan görevler yüklendi.");
    }
}
initSettings();

// --- YARDIMCI FONKSİYONLAR ---
const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

async function updateOrCreateUser(msg) {
    const telegramId = msg.from.id.toString();
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || 'Kullanıcı';

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, username, firstName });
        await user.save();
        return { user, isNew: true };
    } else {
        if (user.username !== username || user.firstName !== firstName) {
            user.username = username;
            user.firstName = firstName;
            await user.save();
        }
        return { user, isNew: false };
    }
}

// --- ADSGRAM REWARD ROTASI ---
app.get('/adsgram-reward', async (req, res) => {
    const { teleId, status } = req.query;
    if (status !== 'done') return res.status(400).send('Reward not ready');

    try {
        const user = await User.findOne({ telegramId: teleId });
        const settings = await Settings.findOne();
        if (user) {
            const rewardAmount = settings.adsgramReward || 500;
            user.points += rewardAmount;
            user.level = calculateLevel(user.points);
            await user.save();
            try { bot.sendMessage(teleId, `📺 Reklam izleme ödülü: +${rewardAmount} GEP hesabına eklendi!`); } catch (err) {}
            return res.send('OK');
        }
        res.status(404).send('User not found');
    } catch (e) { res.status(500).send('Error'); }
});

// --- TELEGRAM BOT MANTIĞI ---
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const { user, isNew } = await updateOrCreateUser(msg);
    const referrerId = match[1];
    try {
        if (isNew && referrerId && referrerId !== user.telegramId) {
            const referrer = await User.findOne({ telegramId: referrerId });
            if (referrer) {
                referrer.points += 500;
                referrer.referralCount += 1;
                referrer.level = calculateLevel(referrer.points);
                await referrer.save();
                bot.sendMessage(referrerId, `🎉 Yeni bir referans! ${user.firstName} katıldı. +500 GEP kazandın.`);
            }
        }
        sendWelcomeMessage(chatId);
    } catch (e) { console.error("Start Error:", e); }
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await updateOrCreateUser(msg);
        sendWelcomeMessage(chatId);
    } catch (e) { console.error("Start Error:", e); }
});

function sendWelcomeMessage(chatId) {
    bot.sendMessage(chatId, `🚀 *Gelir Evreni'ne Hoş Geldin!*\n\nBurada maden kazarak ve görev yaparak GEP kazanabilirsin.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "Uygulamayı Aç 📱", web_app: { url: `https://gelir-evreni.onrender.com` } }]]
        }
    });
}

// --- API ROTLARI ---
app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username, firstName });
        } else {
            if (username) user.username = username;
            if (firstName) user.firstName = firstName;
        }
        user.level = calculateLevel(user.points);
        await user.save();

        const settings = await Settings.findOne();
        res.json({ 
            success: true, 
            user, 
            botUsername: settings.botUsername, 
            isAdmin: telegramId === ADMIN_ID,
            announcements: settings ? settings.announcements : [] 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/checkin', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });
        const now = new Date();
        const lastCheckin = new Date(user.lastCheckin || 0);
        const diff = now - lastCheckin;
        const oneDay = 24 * 60 * 60 * 1000;
        if (diff < oneDay) return res.json({ success: false, message: "Bugün zaten ödülünü aldın!" });
        user.streak = (diff > oneDay * 2) ? 1 : (user.streak % 7) + 1;
        const rewards = [0, 100, 200, 300, 400, 500, 600, 1000];
        const reward = rewards[user.streak];
        user.points += reward;
        user.lastCheckin = now;
        user.level = calculateLevel(user.points);
        await user.save();
        res.json({ success: true, points: user.points, streak: user.streak, message: `${reward} GEP kazandın!` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne();
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

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ points: -1 }).limit(10);
        res.json({ success: true, leaderboard: topUsers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ tasks });
});

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const task = await Task.findOne({ taskId });
        if (user && task && !user.completedTasks.includes(taskId)) {
            user.points += task.reward;
            user.completedTasks.push(taskId);
            user.level = calculateLevel(user.points);
            await user.save();
            return res.json({ success: true, points: user.points });
        }
        res.json({ success: false, message: "Hata!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- 🔥 GÜÇLENDİRİLMİŞ ADMIN PANELİ KOMUTLARI 🔥 ---

app.post('/api/admin/stats', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    try {
        const totalUsers = await User.countDocuments();
        const totalPointsResult = await User.aggregate([{ $group: { _id: null, total: { $sum: "$points" } } }]);
        const settings = await Settings.findOne();
        const tasks = await Task.find();
        res.json({ 
            totalUsers, 
            totalPoints: totalPointsResult[0]?.total || 0, 
            multiplier: settings.miningMultiplier, 
            adsgramReward: settings.adsgramReward,
            announcements: settings.announcements,
            tasks: tasks
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/update-settings', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { multiplier, adsgramReward } = req.body;
    await Settings.updateOne({}, { $set: { miningMultiplier: multiplier, adsgramReward: adsgramReward } });
    res.json({ success: true });
});

app.post('/api/admin/add-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { text } = req.body;
    if (!text) return res.json({ success: false });
    await Settings.updateOne({}, { $push: { announcements: text } });
    const s = await Settings.findOne();
    res.json({ success: true, announcements: s.announcements });
});

app.post('/api/admin/clear-announcements', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $set: { announcements: [] } });
    res.json({ success: true });
});

app.post('/api/admin/add-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { taskId, title, reward, target } = req.body;
    await Task.findOneAndUpdate(
        { taskId }, 
        { taskId, title, reward, target, isActive: true }, 
        { upsert: true }
    );
    res.json({ success: true });
});

app.post('/api/admin/delete-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Task.deleteOne({ taskId: req.body.taskId });
    res.json({ success: true });
});

app.post('/api/admin/all-users', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const users = await User.find().sort({ points: -1 });
    res.json({ success: true, users });
});

// Kullanıcı Puan Müdahalesi (Otomatik Bildirim Kaldırıldı)
app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { targetId, action, amount } = req.body;
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return res.json({ success: false, message: "Kullanıcı bulunamadı" });
    
    const val = parseInt(amount);
    if (action === 'add') targetUser.points += val;
    else if (action === 'sub') targetUser.points -= val;
    else if (action === 'set') targetUser.points = val;
    
    targetUser.level = calculateLevel(targetUser.points);
    await targetUser.save();
    
    // bot.sendMessage kısmı tamamen kaldırıldı.

    res.json({ success: true, newPoints: targetUser.points });
});

app.post('/api/admin/delete-user', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await User.deleteOne({ telegramId: req.body.targetId });
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Gelir Evreni v3.0 Running on port ${PORT}`));
