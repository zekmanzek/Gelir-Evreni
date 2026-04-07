const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Veritabanı Bağlandı"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    username: { type: String },
    fullName: { type: String, default: "Paydaş" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    isRegistered: { type: Boolean, default: false },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }, // Günlük çark takibi için
    completedTasks: { type: [String], default: [] }
});

const User = mongoose.model('User', UserSchema);

const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

// Kullanıcı Bilgisi Getir
app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Kayıt İşlemi
app.post('/api/register', async (req, res) => {
    const { userId, username, fullName, referredBy } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (!user) user = new User({ userId });
        if (referredBy === "MZY2026") {
            user.isRegistered = true; user.username = username; user.fullName = fullName;
            await user.save(); return res.json({ success: true });
        }
        const inviter = await User.findOne({ username: referredBy });
        if (inviter) { inviter.balance += 1000; inviter.refCount += 1; await inviter.save(); }
        user.isRegistered = true; user.username = username; user.fullName = fullName; user.referredBy = referredBy;
        await user.save(); res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Madencilik (8 Saat Sınırı)
app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    try {
        let user = await User.findOne({ userId });
        const now = new Date();
        
        // 8 saat kontrolü (8 * 60 * 60 * 1000 ms)
        if (user.lastMined && (now - user.lastMined < 8 * 60 * 60 * 1000)) {
            const diff = 8 * 60 * 60 * 1000 - (now - user.lastMined);
            return res.status(400).json({ error: "Kilitli", timeLeft: diff });
        }

        user.balance += (50 + (user.refCount * 25)) * 8;
        user.lastMined = now; 
        await user.save();
        res.json({ success: true, balance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Günlük Şans Çarkı (24 Saat Sınırı)
app.post('/api/spin', async (req, res) => {
    const { userId, winAmount } = req.body;
    try {
        let user = await User.findOne({ userId });
        const now = new Date();

        if (user.lastSpin && (now - user.lastSpin < 24 * 60 * 60 * 1000)) {
            return res.status(400).json({ error: "Günde sadece 1 kez çevirebilirsin!" });
        }

        user.balance += winAmount;
        user.lastSpin = now;
        await user.save();
        res.json({ success: true, balance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Para Çekme Talebi (50.000 GEP Limiti)
app.post('/api/withdraw', async (req, res) => {
    const { userId, walletAddress } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (user.balance < 50000) {
            return res.status(400).json({ error: "Minimum 50.000 GEP ($5) gereklidir." });
        }

        // Talebi Telegram'dan sana bildirir
        bot.sendMessage('644464525', `💰 **Ödeme Talebi!**\n\nKullanıcı: ${user.fullName} (@${user.username})\nBakiye: ${user.balance} GEP\nCüzdan: ${walletAddress}`);
        
        // İsteğe bağlı: user.balance -= user.balance; // Bakiyeyi sıfırlamak istersen ekle
        // await user.save();

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard/:id', async (req, res) => {
    try {
        const allUsers = await User.find().sort({ balance: -1 });
        const userRank = allUsers.findIndex(u => u.userId === req.params.id) + 1;
        res.json({ top50: allUsers.slice(0, 50), userRank: userRank || "--" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/complete-single-task', async (req, res) => {
    const { userId, taskId } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (user && !user.completedTasks.includes(taskId)) {
            user.balance += 1000; user.completedTasks.push(taskId); await user.save();
            return res.json({ success: true });
        }
        res.status(400).json({ error: "Zaten alındı" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 **Gelir Evreni Aktif!**`, {
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç", web_app: { url: `https://gelir-evreni.onrender.com/` } }]] }
    });
});

app.listen(process.env.PORT || 10000);
