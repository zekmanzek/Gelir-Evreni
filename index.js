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
const ADMIN_ID = 1469411131;

const bot = new TelegramBot(token, { polling: true });

bot.on('polling_error', (error) => {
    if (error.code !== 'ETELEGRAM' || !error.message.includes('409 Conflict')) {
        console.log("Bot Hatası:", error.code);
    }
});

mongoose.connect(mongoURI).then(() => console.log("✅ DB Bağlı"));

const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 0 },
    lastSpin: Date,
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// --- API ---

app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "ID Gerekli" });
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1200 });
        await user.save();
    }
    res.json({ user });
});

app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user.lastSpin && now - user.lastSpin < 24 * 60 * 60 * 1000) {
        return res.json({ success: false, error: "Günde 1 kez çevirebilirsin!" });
    }
    const rewards = [50, 100, 150, 200, 250, 500];
    const winIndex = Math.floor(Math.random() * rewards.length);
    user.points += rewards[winIndex];
    user.lastSpin = now;
    await user.save();
    res.json({ success: true, winIndex, reward: rewards[winIndex] });
});

app.get('/api/tasks', (req, res) => {
    const tasks = [
        { taskId: 't1', title: 'Kanala Katıl', reward: 5000, category: 'Topluluğumuz', target: 'https://t.me/gelirevreni' },
        { taskId: 't2', title: 'X Takip', reward: 3000, category: 'Topluluğumuz', target: 'https://x.com/kriptotayfa' }
    ];
    res.json({ tasks });
});

app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && user.points >= 500000) {
        user.points -= 500000;
        await user.save();
        bot.sendMessage(ADMIN_ID, `💰 ÖDEME: ${telegramId}\n💳 Cüzdan: ${wallet}\n💎 500k GEP`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Yetersiz bakiye!" });
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 Gelir Evreni'ne Hoş Geldin!`, {
        reply_markup: { inline_keyboard: [[{ text: "📱 Uygulamayı Aç", web_app: { url: "https://gelir-evreni.onrender.com" } }]] }
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 10000, () => console.log(`🚀 Sistem Aktif`));
