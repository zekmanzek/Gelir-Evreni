const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- DB BAĞLANTISI ---
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Evrenin Kalbi Atıyor!"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    username: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null },
    level: { type: Number, default: 1 }
});
const User = mongoose.model('User', UserSchema);

const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

// --- API ---
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ userId: req.params.id });
    if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
    const speed = 50 + (user.refCount * 25);
    res.json({ ...user._doc, speed });
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(15);
    res.json(top);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const speed = 50 + (user.refCount * 25);
    user.balance += (speed * 8);
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const now = new Date();
    if (user.lastSpin && (now - user.lastSpin) < 24*60*60*1000) return res.json({ success: false });
    const prizes = [100, 500, 1000, 5000];
    const win = prizes[Math.floor(Math.random() * prizes.length)];
    user.balance += win;
    user.lastSpin = now;
    await user.save();
    res.json({ success: true, win });
});

// --- BOT ---
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id.toString();
    const first_name = msg.from.first_name || "Avcı";
    const refId = match[1];

    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username: first_name });
        if (refId && refId !== userId) {
            const refUser = await User.findOne({ userId: refId });
            if (refUser) {
                refUser.balance += 1000; // Davet ödülü artırıldı
                refUser.refCount += 1;
                await refUser.save();
                bot.sendMessage(refId, `🚀 **Ekibin Büyüyor!**\nReferansınla gelen yeni avcı sayesinde **+1000 GEP** kazandın!`, { parse_mode: 'Markdown' });
            }
        }
        await user.save();
    }

    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin ${first_name}!**\n\nFinansal imparatorluğunu kurmaya hazır mısın? Madenleri işlet, çarkı çevir ve zirveye tırman!`, {
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 İmparatorluğa Gir", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
