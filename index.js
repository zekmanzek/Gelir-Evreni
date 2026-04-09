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

mongoose.connect(mongoURI).then(() => console.log("✅ DB Connected"));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

// BOT KOMUTU & REF LİNKİ
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const referrerId = match[1];
    let user = await User.findOne({ telegramId: chatId.toString() });
    if (!user) {
        user = new User({ telegramId: chatId.toString(), referredBy: referrerId });
        await user.save();
        await User.findOneAndUpdate({ telegramId: referrerId }, { $inc: { points: 500, referralCount: 1 } });
    }
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🚀 Gelir Evreni'ne Hoş Geldin!", {
        reply_markup: {
            inline_keyboard: [[{ text: "Uygulamayı Aç 📱", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` } }]]
        }
    });
});

// API - ÇARK (Günde 1 Kez)
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - user.lastSpin) > 24 * 60 * 60 * 1000) {
        const prize = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
        user.points += prize;
        user.lastSpin = now;
        await user.save();
        return res.json({ success: true, prize, points: user.points });
    }
    res.json({ success: false, message: "Yarın tekrar gel!" });
});

// API - MADENCİLİK (8 Saatte Bir)
app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - user.lastMining) > 8 * 60 * 60 * 1000) {
        user.points += 500;
        user.lastMining = now;
        await user.save();
        return res.json({ success: true, points: user.points });
    }
    res.json({ success: false });
});

app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    let user = await User.findOne({ telegramId });
    if (!user) { user = new User({ telegramId }); await user.save(); }
    res.json({ success: true, user, botUsername: (await bot.getMe()).username });
});

app.listen(process.env.PORT || 10000);
