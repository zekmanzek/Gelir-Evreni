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

// DB Bağlantısı
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Gelir Evreni DB Aktif"));

// Gelişmiş Kullanıcı Şeması
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    username: { type: String, unique: true }, // Davet kodu olarak kullanılacak
    fullName: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    referredBy: { type: String, default: null }, // Kim davet etti?
    isRegistered: { type: Boolean, default: false }, // Giriş kapısını geçti mi?
    lastMined: { type: Date, default: null },
    level: { type: Number, default: 1 }
});

const User = mongoose.model('User', UserSchema);

// Bot Ayarı
const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

// KULLANICI VERİSİ ÇEKME
app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) {
            // Hiç yoksa taslak oluştur ama isRegistered: false kalsın
            user = new User({ userId: req.params.id });
            await user.save();
        }
        const speed = 50 + (user.refCount * 25);
        res.json({ ...user._doc, speed });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// YENİ KAYIT VE DAVET KODU DOĞRULAMA
app.post('/api/register', async (req, res) => {
    const { userId, username, fullName, referredBy } = req.body;
    
    try {
        let user = await User.findOne({ userId });
        if (!user) user = new User({ userId });

        // MASTER KEY KONTROLÜ (Senin girişin için)
        if (referredBy === "MZY2026") {
            user.isRegistered = true;
            user.username = username;
            user.fullName = fullName;
            await user.save();
            return res.json({ success: true, message: "Kurucu Girişi Başarılı" });
        }

        // Normal Davet Kodu Kontrolü
        const inviter = await User.findOne({ username: referredBy });
        if (!inviter && referredBy !== "MZY2026") {
            return res.status(400).json({ error: "Geçersiz Davet Kodu" });
        }

        // Davet edene ödül ver
        if (inviter) {
            inviter.balance += 1000;
            inviter.refCount += 1;
            await inviter.save();
        }

        user.isRegistered = true;
        user.username = username;
        user.fullName = fullName;
        user.referredBy = referredBy;
        await user.save();

        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// MADENCİLİK
app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    if (!user) return res.status(404).send();

    const reward = (50 + (user.refCount * 25)) * 8;
    user.balance += reward;
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true });
});

// BOT START KOMUTU
bot.onText(/\/start/, async (msg) => {
    const userId = msg.from.id.toString();
    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin!**\n\nSistem seni bekliyor Komutan. Giriş yapmak için aşağıdaki butonu kullan.`, {
        reply_markup: {
            inline_keyboard: [[{ 
                text: "🚀 Operasyon Merkezin", 
                web_app: { url: `https://gelir-evreni.onrender.com/?v=${Date.now()}` } 
            }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
