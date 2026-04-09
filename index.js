const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api'); // Telegram kütüphanesini ekledik
const app = express();

app.use(cors());
app.use(express.json());

// RENDER'DAN GELEN DEĞİŞKENLER
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;

// TELEGRAM BOTUNU BAŞLAT
const bot = new TelegramBot(token, { polling: true });

// MONGODB BAĞLANTISI
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

// --- TELEGRAM MESAJLARINI KARŞILAMA ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1200 });
        await user.save();
    }

    bot.sendMessage(chatId, `🚀 Gelir Evreni'ne Hoş Geldin Mehmet!\n\nSenin için dükkanın yorgunluğunu alacak bir sistem kurduk. Aşağıdaki butona basarak hemen GEP toplamaya başlayabilirsin.`, {
        reply_markup: {
            inline_keyboard: [[
                { text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }
            ]]
        }
    });
});

// TEST İÇİN ANA SAYFA
app.get("/", (req, res) => res.send("Gelir Evreni Sunucusu Aktif ve Telegram'ı Dinliyor!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sunucu ${PORT} portunda yayında`));
