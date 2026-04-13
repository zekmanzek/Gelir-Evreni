require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";

if (!token || !mongoURI) {
    console.error("❌ HATA: .env dosyasında BOT_TOKEN veya MONGODB_URI eksik!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// MongoDB Bağlantısı
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
    .catch(err => console.error("❌ MongoDB Hatası:", err));

// ====================== MODELLER ======================
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

const TaskSchema = new mongoose.Schema({
    taskId: { type: String, unique: true },
    title: String,
    reward: Number,
    target: String,
    isActive: { type: Boolean, default: true }
});

const SettingsSchema = new mongoose.Schema({
    announcements: { type: [String], default: [] },
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 500 },
    botUsername: { type: String, default: 'gelirevreni_bot' }
});

const User = mongoose.model('User', UserSchema);
const Task = mongoose.model('Task', TaskSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ====================== YARDIMCI FONKSİYON ======================
const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

// ====================== TELEGRAM BOT ======================
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.from.first_name || 'Kullanıcı';

    bot.sendMessage(chatId, 
        `🌟 *Gelir Evreni'ne Hoş Geldin ${firstName}!*\n\n` +
        `💰 Maden kaz, günlük ödülünü al, görevleri tamamla!\n\n` +
        `Aşağıdaki butona tıklayarak Mini App'i açabilirsin 👇`,
        {
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: [[
                    { text: "🎮 Mini App'i Aç", web_app: { url: "https://gelirevreni.onrender.com" } }  // Burayı kendi domaininle değiştir
                ]]
            }
        }
    ).catch(err => console.log("Bot mesaj hatası:", err));
});

// ====================== API ROUTES ======================
const checkBan = async (req, res, next) => {
    const teleId = req.body.telegramId;
    if (teleId) {
        const user = await User.findOne({ telegramId: teleId });
        if (user && user.isBanned) {
            return res.status(403).json({ success: false, message: "Hesabınız yasaklanmıştır." });
        }
    }
    next();
};

// Auth
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
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Daily Check-in
app.post('/api/daily-checkin', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ success: false });

        const now = new Date();
        const last = new Date(user.lastCheckin);
        const diffInHours = (now - last) / (1000 * 60 * 60);

        if (diffInHours < 24) {
            return res.json({ success: false, message: "Bugün ödülünü zaten aldın!" });
        }

        if (diffInHours > 48) user.streak = 1;
        else user.streak = (user.streak % 7) + 1;

        const reward = user.streak * 500;
        user.points += reward;
        user.lastCheckin = now;
        user.level = calculateLevel(user.points);
        await user.save();

        res.json({ success: true, points: user.points, streak: user.streak, reward });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Mine
app.post('/api/mine', checkBan, async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const settings = await Settings.findOne() || {};
        const now = new Date();
        const cooldown = 4 * 60 * 60 * 1000;

        if ((now - new Date(user.lastMining)) > cooldown) {
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
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Diğer rotalar (kısaca)
app.post('/api/adsgram-reward', checkBan, async (req, res) => { /* aynı */ });
app.post('/api/tasks/complete', checkBan, async (req, res) => { /* aynı */ });
app.post('/api/admin/*', async (req, res) => { /* admin rotaları */ });

// ... (diğer admin rotalarını da buraya ekleyeceğim ama önce bunu dene)

app.get('/api/tasks', async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ tasks });
});

app.get('/api/leaderboard', async (req, res) => {
    const topUsers = await User.find().sort({ points: -1 }).limit(10);
    res.json({ success: true, leaderboard: topUsers });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Sunucuyu başlat
app.listen(PORT, () => {
    console.log(`🚀 Gelir Evreni v3.0 | Port: ${PORT} | Bot Aktif`);
});
