const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

/**
 * Gelir Evreni - Premium Backend Infrastructure
 * Webhook uyumlu Telegram bot + API
 */

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Environment Variables from Render
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = 1469411131; // Admin Telegram ID for notifications

// --- Telegram Bot (Webhook Mode) ---
const bot = new TelegramBot(token);
bot.setWebHook(`${process.env.RENDER_EXTERNAL_URL}/bot${token}`);

app.post(`/bot${token}`, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
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

// Authenticate user
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

// Lucky Wheel spin logic
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

// Task list
app.get('/api/tasks', (req, res) => {
    const tasks = [
        { taskId: 't1', title: 'Resmi Kanala Katıl', reward: 5000, category: 'Topluluğumuz', target: 'https://t.me/gelirevreni' },
        { taskId: 't2', title: 'X (Twitter) Takip Et', reward: 3000, category: 'Topluluğumuz', target: 'https://x.com/kriptotayfa' },
        { taskId: 't3', title: 'Chat Grubuna Katıl', reward: 2000, category: 'Topluluğumuz', target: 'https://t.me/gelirevreni_chat' }
    ];
    res.json({ tasks });
});

// Withdrawal request
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && user.points >= 500000) {
        user.points -= 500000;
        await user.save();
        bot.sendMessage(ADMIN_ID, `💰 **PREMIUM ÖDEME TALEBİ**\n\n👤 Kullanıcı: ${telegramId}\n💳 Cüzdan: ${wallet}\n💎 Miktar: 500.000 GEP (5$)`, { parse_mode: 'Markdown' });
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

// Serve frontend
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Premium Server is active on port ${PORT}`));
