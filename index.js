require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Bağlantısı Başarılı"))
    .catch(err => console.error("❌ MongoDB Hatası:", err));

// --- KULLANICI MODELİ ---
const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    username: String,
    firstName: String,
    points: { type: Number, default: 0 },
    referredBy: String,
    role: { type: String, default: 'USER' }, // ADMIN veya USER
    lastMining: Date,
    lastDaily: Date,
    lastSpin: Date, // Çark için yeni alan
    tasksCompleted: [String]
});

const User = mongoose.model('User', userSchema);

// --- TELEGRAM BOT AYARLARI ---
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// Bot üzerinden kayıt ve referans sistemi
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1];
    // Kayıt işlemleri burada yapılacak
});

// --- API UÇLARI (FRONTEND İÇİN) ---

// 1. Kullanıcı Doğrulama ve Kayıt
app.post('/api/user/auth', async (req, res) => {
    try {
        const { telegramId, username, firstName } = req.body;
        let user = await User.findOne({ telegramId });

        if (!user) {
            user = new User({ telegramId, username, firstName });
            await user.save();
        }

        res.json({ 
            success: true, 
            user, 
            botUsername: process.env.BOT_USERNAME 
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// 2. Madencilik Başlatma/Kontrol
app.post('/api/user/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });

    const now = new Date();
    if (user.lastMining && (now - user.lastMining < 8 * 60 * 60 * 1000)) {
        return res.json({ success: false, message: "Maden henüz dolmadı." });
    }

    user.points += 500; // Örnek maden ödülü
    user.lastMining = now;
    await user.save();
    res.json({ success: true, newPoints: user.points });
});

// 3. Admin Paneli: Kullanıcıları Listele
app.get('/api/admin/users', async (req, res) => {
    const { adminId } = req.query;
    const admin = await User.findOne({ telegramId: adminId, role: 'ADMIN' });
    if (!admin) return res.status(403).json({ success: false, message: "Yetkisiz erişim!" });

    const users = await User.find().sort({ points: -1 });
    res.json({ success: true, users });
});

// 4. Puan Güncelleme (Çark, Reklam veya Görev Sonucu)
app.post('/api/user/update-points', async (req, res) => {
    try {
        const { telegramId, amount, type } = req.body;
        const user = await User.findOne({ telegramId });
        if (!user) return res.json({ success: false });

        // Eğer çark ise günlük kontrolü backend'de de yapalım
        if (type === 'spin') {
            const today = new Date().toDateString();
            if (user.lastSpin && user.lastSpin.toDateString() === today) {
                return res.json({ success: false, message: "Bugün zaten çevirdiniz." });
            }
            user.lastSpin = new Date();
        }

        user.points += parseInt(amount);
        await user.save();
        res.json({ success: true, newPoints: user.points });
    } catch (error) {
        res.json({ success: false });
    }
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Sunucu ${PORT} portunda yayında.`);
});
