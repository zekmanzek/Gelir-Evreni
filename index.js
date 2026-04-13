require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- AYARLAR ---
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";

if (!token || !mongoURI) {
    console.error("❌ HATA: BOT_TOKEN veya MONGODB_URI .env dosyasında tanımlı değil!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

// Veritabanı bağlantısı
mongoose.connect(mongoURI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
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

// --- YARDIMCI FONKSİYONLAR ---
const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

// --- TELEGRAM BOT KOMUTLARI ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || 'Kullanıcı';

    try {
        await bot.sendMessage(chatId, 
            `🌟 *Gelir Evreni'ne Hoş Geldin ${firstName}!*\n\n` +
            `💰 Maden kaz, günlük ödülünü al, görevleri tamamla ve puan biriktir!\n\n` +
            `🚀 Mini App'i açmak için aşağıdaki butona tıkla:`, 
            {
                parse_mode: "Markdown",
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "🎮 Mini App'i Aç", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'yourdomain.com'}` } }]
                    ]
                }
            }
        );
    } catch (err) {
        console.error("Start komutu hatası:", err);
    }
});

bot.on('message', (msg) => {
    // İleride daha fazla komut ekleyebiliriz
});

// --- API ROTLARI ---
const checkBan = async (req, res, next) => {
    const teleId = req.body.telegramId;
    if (teleId) {
        const user = await User.findOne({ telegramId: teleId });
        if (user?.isBanned) return res.status(403).json({ success: false, message: "Hesabınız yasaklanmıştır." });
    }
    next();
};

// Kullanıcı Giriş
app.post('/api/user/auth', checkBan, async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({ 
                telegramId, 
                username: (username || '').toLowerCase(), 
                firstName 
            });
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

// Diğer rotalar (günlük ödül, maden, görev vs.) aynı kalıyor, sadece ufak iyileştirmelerle...
app.post('/api/daily-checkin', checkBan, async (req, res) => { /* ... aynı kod ... */ });
app.post('/api/mine', checkBan, async (req, res) => { /* ... aynı kod ... */ });
app.post('/api/adsgram-reward', checkBan, async (req, res) => { /* ... aynı kod ... */ });
app.post('/api/tasks/com
