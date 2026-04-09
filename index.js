const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AYARLAR
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = 1469411131; // Senin ID'n

// BOTU BAŞLAT (polling: true yerine hata yönetimi ekledik)
const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log("⚠️ Çakışma var: Diğer botun kapanması bekleniyor...");
    } else {
        console.log("Bot Hatası:", error.code);
    }
});

mongoose.connect(mongoURI).then(() => console.log("✅ DB Bağlı"));

// VERİTABANI ŞEMASI (Cüzdan eklendi)
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 0 },
    lastSpin: Date,
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// --- API BÖLÜMLERİ ---

// 1. Kullanıcıyı Tanıma (Statik ID kaldırıldı!)
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body; // HTML'den gelen ID
    if (!telegramId) return res.status(400).json({ error: "ID Gerekli" });

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1200 }); // Yeni kullanıcıya hoş geldin puanı
        await user.save();
    }
    res.json({ user });
});

// 2. Şans Çarkı
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if(!user) return res.json({ success: false, error: "Kullanıcı bulunamadı!" });

    const now = new Date();
    if (user.lastSpin && now - user.lastSpin < 24 * 60 * 60 * 1000) {
        return res.json({ success: false, error: "Günde sadece 1 kez çevirebilirsin!" });
    }

    const rewards = [50, 100, 150, 200, 250, 500];
    const winIndex = Math.floor(Math.random() * rewards.length);
    const winAmount = rewards[winIndex];

    user.points += winAmount;
    user.lastSpin = now;
    await user.save();

    res.json({ success: true, winIndex, reward: winAmount });
});

// 3. Ödeme Talebi API (YENİ!)
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    const user = await User.findOne({ telegramId });

    if (user && user.points >= 500000) {
        user.points -= 500000;
        await user.save();

        // Admin'e bildirim at
        bot.sendMessage(ADMIN_ID, 
            `💰 **ÖDEME TALEBİ GELDİ!**\n\n` +
            `👤 ID: ${telegramId}\n` +
            `💸 Miktar: 500.000 GEP ($5)\n` +
            `💳 Cüzdan: \`${wallet}\``,
            { parse_mode: 'Markdown' }
        );

        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Puanın yetersiz veya bakiye hatası!" });
    }
});

// BOT KOMUTLARI
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 Gelir Evreni'ne Hoş Geldin!`, {
        reply_markup: {
            inline_keyboard: [[{ text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }]]
        }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda aktif`));
