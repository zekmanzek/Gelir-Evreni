const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

/**
 * Gelir Evreni - Premium Backend Infrastructure
 * This file handles database connections, user authentication, 
 * point logic, and Telegram bot notifications.
 */

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment Variables from Render
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = 1469411131; // Admin Telegram ID for notifications

const bot = new TelegramBot(token, { polling: true });

// Avoid logging 409 Conflict errors during polling
bot.on('polling_error', (error) => {
    if (error.code !== 'ETELEGRAM' || !error.message.includes('409 Conflict')) {
        console.log("Bot Error:", error.code);
    }
});

// MongoDB Connection
mongoose.connect(mongoURI).then(() => console.log("✅ Premium DB Connected Successfully"));

// User Schema Definition
const userSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 0 },
    lastSpin: Date,
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// --- API ENDPOINTS ---

/**
 * Authenticates user and creates record if new
 */
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "ID Required" });
    
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, points: 1250 }); // Starter bonus
        await user.save();
    }
    res.json({ user });
});

/**
 * Handles the Lucky Wheel spin logic with 24h cooldown
 */
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = new Date();
    if (user.lastSpin && now - user.lastSpin < 24 * 60 * 60 * 1000) {
        return res.json({ success: false, error: "Günde sadece 1 kez çevirebilirsin!" });
    }

    const rewards = [50, 100, 150, 200, 250, 500];
    const winIndex = Math.floor(Math.random() * rewards.length);
    user.points += rewards[winIndex];
    user.lastSpin = now;
    await user.save();
    res.json({ success: true, winIndex, reward: rewards[winIndex] });
});

/**
 * Returns static task list
 */
app.get('/api/tasks', (req, res) => {
    const tasks = [
        { taskId: 't1', title: 'Resmi Kanala Katıl', reward: 5000, category: 'Topluluğumuz', target: 'https://t.me/gelirevreni' },
        { taskId: 't2', title: 'X (Twitter) Takip Et', reward: 3000, category: 'Topluluğumuz', target: 'https://x.com/kriptotayfa' },
        { taskId: 't3', title: 'Chat Grubuna Katıl', reward: 2000, category: 'Topluluğumuz', target: 'https://t.me/gelirevreni_chat' }
    ];
    res.json({ tasks });
});

/**
 * Processes withdrawal requests and notifies Admin
 */
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && user.points >= 500000) {
        user.points -= 500000;
        await user.save();
        bot.sendMessage(ADMIN_ID, `💰 **PREMIUM ÖDEME TALEBİ**\n\n👤 Kullanıcı: ${telegramId}\n💳 Cüzdan: ${wallet}\n💎 Miktar: 500.000 GEP (5$)`);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Yetersiz bakiye (Min: 500k GEP)" });
    }
});

// Bot Start Command
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, `🚀 **Gelir Evreni'ne Hoş Geldin!**\n\nPremium deneyim seni bekliyor. Uygulamayı başlat ve kazanmaya başla!`, {
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 Evreni Başlat", web_app: { url: "https://gelir-evreni.onrender.com" } }]
            ]
        },
        parse_mode: 'Markdown'
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Premium Server is active on port ${PORT}`));
