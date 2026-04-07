const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

// Önbellek Kapatma
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı Bağlantısı
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Gelir Evreni Veritabanı Aktif"));

// Kullanıcı Şeması (Görevleri tek tek takip eder)
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    username: { type: String },
    fullName: { type: String, default: "Paydaş" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null },
    isRegistered: { type: Boolean, default: false },
    lastMined: { type: Date, default: null },
    completedTasks: { type: [String], default: [] } // Yapılan görevlerin ID'lerini tutar
});

const User = mongoose.model('User', UserSchema);

// Bot Ayarı
const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

// 1. KULLANICI VERİSİ
app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) {
            user = new User({ userId: req.params.id });
            await user.save();
        }
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 2. KAYIT SİSTEMİ
app.post('/api/register', async (req, res) => {
    const { userId, username, fullName, referredBy } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (!user) user = new User({ userId });

        if (referredBy === "MZY2026") {
            user.isRegistered = true;
            user.username = username;
            user.fullName = fullName;
            await user.save();
            return res.json({ success: true });
        }

        const inviter = await User.findOne({ username: referredBy });
        if (!inviter) return res.status(400).json({ error: "Geçersiz Davet Kodu" });

        inviter.balance += 1000;
        inviter.refCount += 1;
        await inviter.save();

        user.isRegistered = true;
        user.username = username;
        user.fullName = fullName;
        user.referredBy = referredBy;
        await user.save();

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 3. LİDERLİK TABLOSU
app.get('/api/leaderboard/:id', async (req, res) => {
    try {
        const allUsers = await User.find().sort({ balance: -1 });
        const userRank = allUsers.findIndex(u => u.userId === req.params.id) + 1;
        const top50 = allUsers.slice(0, 50);
        res.json({ top50, userRank: userRank || "--" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 4. MADENCİLİK
app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    try {
        let user = await User.findOne({ userId });
        const reward = (50 + (user.refCount * 25)) * 8;
        user.balance += reward;
        user.lastMined = new Date();
        await user.save();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// 5. TEKİL GÖREV ONAYLAMA (Her görev 1000 GEP)
app.post('/api/complete-single-task', async (req, res) => {
    const { userId, taskId } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        if (user.completedTasks.includes(taskId)) {
            return res.status(400).json({ error: "Bu ödül zaten alındı!" });
        }

        user.balance += 1000; // Görev başı 1000 GEP
        user.completedTasks.push(taskId);
        await user.save();
        res.json({ success: true, newBalance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

bot.onText(/\/start/, async (msg) => {
    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin!**`, {
        reply_markup: {
            inline_keyboard: [[{ 
                text: "🚀 Operasyon Merkezin", 
                web_app: { url: `https://gelir-evreni.onrender.com/?v=${Date.now()}` } 
            }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
