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
    telegramId: { type: String, unique: true, index: true },
    username: { type: String, default: '', index: true }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
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

// --- MIDDLEWARE (BAN KONTROLÜ) ---
const checkBan = async (req, res, next) => {
    const teleId = req.body.telegramId || req.query.teleId;
    if (teleId) {
        const user = await User.findOne({ telegramId: teleId });
        if (user && user.isBanned) return res.status(403).json({ success: false, message: "Hesabınız yasaklanmıştır." });
    }
    next();
};

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

const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

async function updateOrCreateUser(msg) {
    const telegramId = msg.from.id.toString();
    const username = (msg.from.username || '').toLowerCase();
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

// --- API ROTLARI ---
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

app.post('/api/mine', checkBan, async (req, res) => {
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

// --- ADMIN KOMUTLARI ---

app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { targetId, action, amount } = req.body;
    let query = targetId.startsWith('@') ? { username: targetId.replace('@', '').toLowerCase() } : { telegramId: targetId };
    const targetUser = await User.findOne(query);
    if (!targetUser) return res.json({ success: false, message: "Kullanıcı bulunamadı" });
    const val = parseInt(amount) || 0;
    if (action === 'add') targetUser.points += val;
    else if (action === 'sub') targetUser.points -= val;
    else if (action === 'set') targetUser.points = val;
    else if (action === 'ban') targetUser.isBanned = true;
    else if (action === 'unban') targetUser.isBanned = false;
    targetUser.level = calculateLevel(targetUser.points);
    await targetUser.save();
    res.json({ success: true, newPoints: targetUser.points, isBanned: targetUser.isBanned });
});

// DUYURU SİSTEMİ DÜZENLEMESİ (KÖKTEN ÇÖZÜM)
app.post('/api/admin/add-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    if (!req.body.text || req.body.text.trim() === "") return res.json({ success: false, message: "Metin boş olamaz" });
    
    // Hem push yapıyoruz hem de en güncel listeyi dönüyoruz
    const updated = await Settings.findOneAndUpdate({}, { $push: { announcements: req.body.text } }, { new: true });
    res.json({ success: true, announcements: updated.announcements });
});

app.post('/api/admin/delete-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { index } = req.body;
    const s = await Settings.findOne();
    if (s && s.announcements[index] !== undefined) {
        s.announcements.splice(index, 1);
        await s.save();
        return res.json({ success: true, announcements: s.announcements });
    }
    res.json({ success: false });
});

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

app.post('/api/admin/add-task', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { title, reward, target } = req.body;
    const taskId = 'task_' + Date.now();
    await Task.create({ taskId, title, reward, target, isActive: true });
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

app.post('/api/admin/update-settings', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { multiplier, adsgramReward } = req.body;
    await Settings.updateOne({}, { $set: { miningMultiplier: multiplier, adsgramReward: adsgramReward } });
    res.json({ success: true });
});

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ tasks });
});

app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find().sort({ points: -1 }).limit(10);
    res.json({ success: true, leaderboard: topUsers });
});

bot.onText(/\/start$/, async (msg) => {
    await updateOrCreateUser(msg);
    bot.sendMessage(msg.chat.id, `🚀 *Gelir Evreni'ne Hoş Geldin!*`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç 📱", web_app: { url: `https://gelir-evreni.onrender.com` } }]] }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Gelir Evreni v3.0 Running on port ${PORT}`));
