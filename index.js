const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

// ZORUNLU: Önbelleği tamamen kapatan ayar
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// DB Bağlantısı
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 DB Bağlandı"));

const User = mongoose.model('User', new mongoose.Schema({
    userId: { type: String, unique: true },
    username: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    lastMined: { type: Date, default: null }
}));

const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ userId: req.params.id });
    if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
    const speed = 50 + (user.refCount * 25);
    res.json({ ...user._doc, speed, balanceUsd: (user.balance * 0.0001).toFixed(2) });
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(10);
    res.json(top);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const reward = (50 + (user.refCount * 25)) * 8;
    user.balance += reward;
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true });
});

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id.toString();
    const name = msg.from.first_name || "Avcı";
    const refId = match[1];
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username: name });
        if (refId && refId !== userId) {
            const r = await User.findOne({ userId: refId });
            if (r) { r.balance += 1000; r.refCount += 1; await r.save(); }
        }
        await user.save();
    }
    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin!**`, {
        reply_markup: { inline_keyboard: [[{ text: "🚀 İmparatorluğa Gir", web_app: { url: `https://gelir-evreni.onrender.com/?v=${Date.now()}&userid=${userId}` } }]] }
    });
});

app.listen(process.env.PORT || 10000);
