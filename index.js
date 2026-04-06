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
mongoose.connect(MONGO_URI).then(() => console.log("DB Bağlandı"));

const User = mongoose.model('User', new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    wallet: { type: String, default: '' },
    baseSpeed: { type: Number, default: 50 },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
}));

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

// API: Kullanıcıyı Bul veya Oluştur (Kritik nokta burası)
app.get('/api/user/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        if (!userId || userId === "undefined" || userId === "null") {
            return res.status(400).json({ error: "Geçersiz ID" });
        }
        let user = await User.findOne({ userId: userId });
        if (!user) {
            user = new User({ userId: userId });
            await user.save();
        }
        const currentSpeed = user.baseSpeed + (user.refCount * 50);
        res.json({ ...user._doc, currentSpeed });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(10);
    res.json(top);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const reward = (user.baseSpeed + (user.refCount * 50)) * 8;
    user.balance += reward;
    user.lastMined = new Date();
    await user.save();
    res.json({ success: true });
});

app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const win = [100, 250, 500, 1000][Math.floor(Math.random() * 4)];
    user.balance += win;
    user.lastSpin = new Date();
    await user.save();
    res.json({ success: true, win });
});

// BOT: /start ve Referans İşleme
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const userId = msg.from.id.toString();
    const startParam = match[1];

    let user = await User.findOne({ userId });
    if (!user) {
        if (startParam && startParam !== userId) {
            const refUser = await User.findOne({ userId: startParam });
            if (refUser) {
                refUser.balance += 500;
                refUser.refCount += 1;
                await refUser.save();
                bot.sendMessage(startParam, "🔔 Bir referans kazandın! +500 GEP.");
            }
        }
        user = new User({ userId });
        await user.save();
    }

    bot.sendMessage(msg.chat.id, "🦅 Gelir Evreni'ne Hoş Geldin!", {
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 Başlat", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
