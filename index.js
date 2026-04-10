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

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v2 Connected"));

// --- GÜNCELLENMİŞ KULLANICI MODELİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: { type: String, default: '' }, // Kullanıcı adı (@)
    firstName: { type: String, default: 'Kullanıcı' }, // Görünür isim
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

// --- YARDIMCI FONKSİYON: Kullanıcı Güncelle/Kaydet ---
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

// --- TELEGRAM BOT MANTIĞI (/start KOMUTU) ---
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

        const botInfo = await bot.getMe();
        res.json({ success: true, user, botUsername: botInfo.username, isAdmin: telegramId === ADMIN_ID });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find()
            .sort({ points: -1 })
            .limit(10)
            .select('telegramId points level username firstName');
        res.json({ success: true, leaderboard: topUsers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const cooldown = 8 * 60 * 60 * 1000;
        if (user && (now - new Date(user.lastMining)) > cooldown) {
            let baseReward = 500;
            if (user.level === 'Gümüş') baseReward += 100;
            if (user.level === 'Altın') baseReward += 250;
            if (user.level === 'Platin') baseReward += 500;
            if (user.level === 'Elmas') baseReward += 1000;

            user.points += baseReward;
            user.lastMining = now;
            await user.save();
            return res.json({ success: true, points: user.points, reward: baseReward });
        }
        res.json({ success: false, message: "Maden henüz hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

app.post('/api/admin/add-task', (req, res) => {
    const { adminId, task } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    TASKS.push(task);
    res.json({ success: true, tasks: TASKS });
});

app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
