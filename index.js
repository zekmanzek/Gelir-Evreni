const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// KRİTİK: Görsel arayüzün olduğu klasörü dışarı açar
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI)
  .then(() => console.log("✅ Veritabanı Bağlantısı Başarılı"))
  .catch(err => console.error("❌ Veritabanı Hatası:", err));

// Kullanıcı Şeması
const userSchema = new mongoose.Schema({
    telegramId: String,
    points: { type: Number, default: 1200 },
    lastSpin: Date
});
const User = mongoose.model('User', userSchema);

// PUAN GÜNCELLEME API (Çark durduğunda burası çalışacak)
app.post('/api/update-points', async (req, res) => {
    const { telegramId, points } = req.body;
    try {
        const user = await User.findOneAndUpdate(
            { telegramId: telegramId.toString() },
            { $set: { points: points } },
            { new: true, upsert: true }
        );
        res.json({ success: true, points: user.points });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Telegram Mesajı
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `🚀 Gelir Evreni'ne Hoş Geldin Mehmet!\n\nSistemin hazır, hemen GEP toplamaya başlayabilirsin.`, {
        reply_markup: {
            inline_keyboard: [[
                { text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }
            ]]
        }
    });
});

// Beyaz ekranı bitiren yönlendirme
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu Aktif`));
