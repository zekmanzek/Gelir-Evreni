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
mongoose.connect(MONGO_URI).then(() => console.log("DB Bağlandı"));

const User = mongoose.model('User', new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
}));

// --- BOT ---
const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

// --- API ---
app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ userId: req.params.id });
    if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
    res.json(user);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    user.balance += 500; 
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const wins = [100, 200, 500];
    const win = wins[Math.floor(Math.random() * wins.length)];
    user.balance += win;
    user.lastSpin = new Date();
    await user.save();
    res.json({ success: true, win });
});

// BOT START (Referanssız, En Sade Hal)
bot.on('message', (msg) => {
    if (msg.text === '/start') {
        const userId = msg.from.id.toString();
        bot.sendMessage(msg.chat.id, "🦅 **Gelir Evreni'ne Hoş Geldin!**\n\nSistem stabilize edildi. Madenciliğe başlamak için butona tıkla!", {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 İmparatorluğu Aç", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]]
            }
        });
    }
});

app.listen(process.env.PORT || 10000);
