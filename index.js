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

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v2.5 Connected"));

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

const SettingsSchema = new mongoose.Schema({
    announcements: { type: [String], default: [] },
    miningMultiplier: { type: Number, default: 1 }
});
const Settings = mongoose.model('Settings', SettingsSchema);

async function initSettings() {
    let s = await Settings.findOne();
    if (!s) await new Settings().save();
}
initSettings();

// --- YARDIMCI FONKSİYONLAR ---
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

const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

let TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' }
];

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
    bot.sendMessage(chatId, `🚀 *Gelir Evreni'ne Hoş Geldin!*\n\nBurada maden kazarak, görevleri yaparak ve arkadaşlarını davet ederek GEP kazanabilirsin.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "Uygulamayı Aç 📱", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'senin-linkin.com'}` } }]
            ]
        }
    });
}

// --- ADSGRAM REWARD ROUTE (S2S) ---
app.get('/adsgram-reward', async (req, res) => {
    const { teleId, status } = req.query;
    if (status !== 'done') return res.send('Reward not ready');

    try {
        const user = await User.findOne({ telegramId: teleId });
        if (user) {
            user.points += 500;
            await user.save();
            return res.send('OK');
        }
        res.status(404).send('User not found');
    } catch (e) {
        res.status(500).send('Error');
    }
});

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
        const botInfo = await bot.getMe();
        res.json({ 
            success: true, 
            user, 
            botUsername: botInfo.username, 
            isAdmin: telegramId === ADMIN_ID,
            announcements: settings ? settings.announcements : [] 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/user/checkin', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false, message: "Kullanıcı bulunamadı." });
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
            await user.save();
            return res.json({ success: true, points: user.points, reward: finalReward });
        }
        res.json({ success: false, message: "Maden henüz hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ points: -1 }).limit(10).select('telegramId points level username firstName');
        res.json({ success: true, leaderboard: topUsers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const task = TASKS.find(t => t.taskId === taskId);
        if (user && task && !user.completedTasks.includes(taskId)) {
            user.points += task.reward;
            user.completedTasks.push(taskId);
            await user.save();
            return res.json({ success: true, points: user.points });
        }
        res.json({ success: false, message: "Hata!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ADMIN KOMUTA MERKEZİ ---
app.post('/api/admin/all-users', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    try {
        const users = await User.find().sort({ points: -1 });
        res.json({ success: true, users });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/stats', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const totalUsers = await User.countDocuments();
    const totalPointsResult = await User.aggregate([{ $group: { _id: null, total: { $sum: "$points" } } }]);
    const settings = await Settings.findOne();
    res.json({ totalUsers, totalPoints: totalPointsResult[0]?.total || 0, multiplier: settings.miningMultiplier, announcements: settings.announcements });
});

app.post('/api/admin/add-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $push: { announcements: req.body.text } });
    const s = await Settings.findOne();
    res.json({ success: true, announcements: s.announcements });
});

app.post('/api/admin/delete-announcement', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    await Settings.updateOne({}, { $pull: { announcements: req.body.text } });
    const s = await Settings.findOne();
    res.json({ success: true, announcements: s.announcements });
});

app.post('/api/admin/user-manage', async (req, res) => {
    if (req.body.adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    const { targetId, action, amount } = req.body;
    const targetUser = await User.findOne({ telegramId: targetId });
    if (!targetUser) return res.json({ success: false, message: "Kullanıcı bulunamadı." });
    if (action === 'add') targetUser.points += parseInt(amount);
    if (action === 'set') targetUser.points = parseInt(amount);
    await targetUser.save();
    res.json({ success: true, newPoints: targetUser.points });
});

app.post('/api/admin/add-task', (req, res) => {
    const { adminId, task } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    if (TASKS.find(t => t.taskId === task.taskId)) return res.status(400).json({ success: false, message: "Bu ID ile zaten bir görev var." });
    TASKS.push(task);
    res.json({ success: true, tasks: TASKS });
});

app.post('/api/admin/delete-task', (req, res) => {
    const { adminId, taskId } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    TASKS = TASKS.filter(t => t.taskId !== taskId);
    res.json({ success: true, tasks: TASKS });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
