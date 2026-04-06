const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Evrenin Kalbi Atıyor!"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    username: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
});
const User = mongoose.model('User', UserSchema);

const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

app.get('/api/user/:id', async (req, res) => {
    let user = await User.findOne({ userId: req.params.id });
    if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
    const speed = 50 + (user.refCount * 25);
    res.json({ ...user._doc, speed });
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(10);
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

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id.toString();
    const name = msg.from.first_name || "Avcı";
    const refId = match[1];

    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, username: name });
        if (refId && refId !== userId) {
            const refUser = await User.findOne({ userId: refId });
            if (refUser) {
                refUser.balance += 1000;
                refUser.refCount += 1;
                await refUser.save();
                bot.sendMessage(refId, `🚀 **Ekibin Büyüyor!** +1000 GEP kazandın!`);
            }
        }
        await user.save();
    }
    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin ${name}!**`, {
        reply_markup: { inline_keyboard: [[{ text: "🚀 İmparatorluğa Gir", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]] }
    });
});

app.listen(process.env.PORT || 10000);
