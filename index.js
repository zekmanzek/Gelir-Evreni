const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- VERİ TABANI ---
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("Hafıza Merkezi Bağlandı!"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    baseSpeed: { type: Number, default: 50 },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
});
const User = mongoose.model('User', UserSchema);

// --- BOT ---
const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

// --- API KISIMLARI ---

app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) {
            user = new User({ userId: req.params.id });
            await user.save();
        }
        const currentSpeed = user.baseSpeed + (user.refCount * 50);
        res.json({ ...user._doc, currentSpeed });
    } catch (e) { res.status(500).json({ error: "DB Hatası" }); }
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(10);
    res.json(top);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    if (!user) return res.json({ success: false });
    const reward = (user.baseSpeed + (user.refCount * 50)) * 8;
    user.balance += reward;
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true, balance: user.balance });
});

app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const now = new Date();
    if (user.lastSpin && (now - user.lastSpin) < 24*60*60*1000) return res.json({ success: false });
    const win = [100, 250, 500, 1000][Math.floor(Math.random() * 4)];
    user.balance += win;
    user.lastSpin = now;
    await user.save();
    res.json({ success: true, win });
});

// --- REFERANS VE START ---
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id.toString();
    const startParam = match[1];
    let user = await User.findOne({ userId });

    if (!user) {
        user = new User({ userId });
        if (startParam && startParam !== userId) {
            const referrer = await User.findOne({ userId: startParam });
            if (referrer) {
                referrer.balance += 500;
                referrer.refCount += 1;
                await referrer.save();
                bot.sendMessage(startParam, "🎉 Tebrikler! Bir referans kazandın: +500 GEP");
            }
        }
        await user.save();
    }

    bot.sendMessage(msg.chat.id, "🦅 **Gelir Evreni'ne Hoş Geldin!**", {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 İmparatorluğu Aç", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
