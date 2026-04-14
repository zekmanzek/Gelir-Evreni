require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 10000;

// --- ARA YAZILIMLAR (MIDDLEWARE) ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- AYARLAR VE BAĞLANTILAR ---
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";

// Bot Çakışmasını (409) önlemek için polling ayarlarını optimize ediyoruz
const bot = new TelegramBot(token, { 
    polling: {
        autoStart: true,
        params: {
            timeout: 10
        }
    } 
});

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Gelir Evreni v3.0 - Sistem Aktif"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

// --- VERİTABANI MODELLERİ ---
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
    try {
        const teleId = req.body.telegramId;
        if (teleId) {
            const user = await User.findOne({ telegramId: teleId });
            if (user && user.isBanned) return res.status(403).json({ success: false, message: "Hesabınız yasaklanmıştır." });
        }
        next();
    } catch (err) {
        next();
    }
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

        let settings = await Settings.findOne();
        if(!settings) settings = await Settings.create({});

        res.json({ 
            success: true, 
            user, 
            botUsername: settings.botUsername, 
            isAdmin: String(telegramId) === String(ADMIN_ID),
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
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    const totalUsers = await User.countDocuments();
    const totalPointsRes = await User.aggregate([{ $group: { _id: null, total: { $sum: "$points" } } }]);
    const settings = await Settings.findOne() || { announcements: [] };
    const tasks = await Task.find();
    res.json({ totalUsers, totalPoints: totalPointsRes[0]?.total || 0, announcements: settings.announcements, tasks });
});

// --- BOT KOMUTLARI ---
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🌟 **Gelir Evreni'ne Hoş Geldiniz!**\n\nAlttaki butona tıklayarak uygulamayı başlatabilirsiniz.", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: "🚀 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }
            ]]
        }
    });
});

// --- ANA DOSYA VE PORT SUNUMU ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu ${PORT} üzerinde aktif.`);
});

// Bot hata yönetimi
bot.on('polling_error', (error) => {
    if (error.code === 'EFATAL' || error.message.includes('409')) {
        console.log("⚠️ Bot Çakışması Algılandı: Diğer aktif botun kapanması bekleniyor.");
    } else {
        console.log("Bot Polling Hatası:", error.message);
    }
});
