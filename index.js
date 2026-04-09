const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());

// KRİTİK: Beyaz ekranı bitiren satır. public klasörünü dışarı açar.
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI)
  .then(() => console.log("✅ Veritabanı Bağlantısı Başarılı"))
  .catch(err => console.error("❌ Veritabanı Hatası:", err));

const userSchema = new mongoose.Schema({
    telegramId: String,
    points: { type: Number, default: 1200 },
    lastSpin: Date,
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// PUANLARI VERİTABANINA KAYDEDEN YENİ BÖLÜM (API)
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
        res.status(500).json({ success: false, error: err.message });
    }
});

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1200 });
        await user.save();
    }

    bot.sendMessage(chatId, `🚀 Gelir Evreni'ne Hoş Geldin Mehmet!\n\nSenin için dükkanın yorgunluğunu alacak sistemi kurduk. Aşağıdaki butona basarak hemen GEP toplamaya başlayabilirsin.`, {
        reply_markup: {
            inline_keyboard: [[
                { text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }
            ]]
        }
    });
});

// Sunucuya direkt girildiğinde de sistemi gösterir
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda aktif`));
