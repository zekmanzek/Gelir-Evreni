const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- VERİ TABANI BAĞLANTISI ---
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Hafıza merkezi bağlandı!"))
    .catch(err => console.log("Bağlantı hatası:", err));

// Kullanıcı Şeması
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    wallet: { type: String, default: '' },
    baseSpeed: { type: Number, default: 50 },
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
});

const User = mongoose.model('User', UserSchema);

// --- BOT AYARLARI ---
const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

// --- API KISIMLARI ---

app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    let user = await User.findOne({ userId });
    if (!user) { user = new User({ userId }); await user.save(); }
    const currentSpeed = user.baseSpeed + (user.refCount * 50);
    res.json({ ...user._doc, currentSpeed });
});

app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ balance: -1 }).limit(10);
        res.json(topUsers);
    } catch (e) { res.status(500).json({ error: "Sıralama yüklenemedi" }); }
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    if (!user) return res.json({ success: false });
    const now = new Date();
    const reward = (user.baseSpeed + (user.refCount * 50)) * 8;
    user.balance += reward;
    user.lastMined = now;
    await user.save();
    res.json({ success: true, balance: user.balance });
});

app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    const prizes = [100, 250, 500, 1000];
    const win = prizes[Math.floor(Math.random() * prizes.length)];
    user.balance += win;
    user.lastSpin = new Date();
    await user.save();
    res.json({ success: true, win, balance: user.balance });
});

app.post('/api/check-task', async (req, res) => {
    const { userId, channelId } = req.body;
    let user = await User.findOne({ userId });
    user.balance += 500;
    user.tasks.push(channelId);
    await user.save();
    res.json({ success: true, balance: user.balance });
});

// --- TELEGRAM KOMUTLARI (DEEP LINKING DESTEKLİ) ---
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const startParam = match[1];

    let user = await User.findOne({ userId });

    if (!user) {
        if (startParam && startParam !== userId) {
            const referrer = await User.findOne({ userId: startParam });
            if (referrer) {
                referrer.balance += 500;
                referrer.refCount += 1;
                await referrer.save();
                bot.sendMessage(startParam, `🎉 **Yeni bir avcı katıldı!**\n\nReferans ödülün: +500 GEP hesabına eklendi.`, { parse_mode: 'Markdown' });
            }
        }
        user = new User({ userId });
        await user.save();
    }

    const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}`;
    bot.sendMessage(chatId, `🦅 **Gelir Evreni'ne Hoş Geldin!**\n\nKendi imparatorluğunu kurmak için aşağıdaki butona tıkla!`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 İmparatorluğu Aç", web_app: { url: webAppUrl } }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
