const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI).then(() => console.log("✅ DB Bağlı"));

const userSchema = new mongoose.Schema({
    telegramId: String,
    points: { type: Number, default: 1200 },
    lastSpin: Date,
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// --- API BÖLÜMLERİ (HTML BURAYLA KONUŞACAK) ---

// 1. Kullanıcıyı Tanıma ve Kayıt
app.post('/api/user/auth', async (req, res) => {
    const { initData } = req.body; // Telegram'dan gelen güvenli veri
    // Test için veya initData yoksa varsayılan id (Mehmet için)
    const telegramId = "6814040940"; 
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1200 });
        await user.save();
    }
    res.json({ user });
});

// 2. Şans Çarkı Döndürme
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId: "6814040940" });
    
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

// 3. Görevleri Listele (Şimdilik Boş)
app.get('/api/tasks', (req, res) => {
    res.json({ tasks: [] });
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 Gelir Evreni'ne Hoş Geldin!`, {
        reply_markup: {
            inline_keyboard: [[{ text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }]]
        }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Sistem Aktif`));
