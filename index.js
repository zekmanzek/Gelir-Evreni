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

// --- API KISIMLARI (WEB APP İÇİN) ---

// Kullanıcı Bilgilerini Getir
app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    let user = await User.findOne({ userId });
    if (!user) { 
        user = new User({ userId }); 
        await user.save(); 
    }
    const currentSpeed = user.baseSpeed + (user.refCount * 50);
    res.json({ ...user._doc, currentSpeed });
});

// Liderlik Tablosu (Top 10)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ balance: -1 }).limit(10);
        res.json(topUsers);
    } catch (e) {
        res.status(500).json({ error: "Sıralama yüklenemedi" });
    }
});

// Madenciliği Başlat
app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    if (!user) return res.json({ success: false });

    const now = new Date();
    const eightHours = 8 * 60 * 60 * 1000;

    if (user.lastMined && (now - user.lastMined) < eightHours) {
        return res.json({ success: false, message: "Henüz vakti gelmedi." });
    }

    const reward = (user.baseSpeed + (user.refCount * 50)) * 8;
    user.balance += reward;
    user.lastMined = now;
    await user.save();
    res.json({ success: true, balance: user.balance, lastMined: user.lastMined });
});

// Uygulama İçi Çark Çevirme
app.post('/api/spin', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    if (!user) return res.json({ success: false });

    const now = new Date();
    const oneDay = 24 * 60 * 60 * 1000;

    if (user.lastSpin && (now - user.lastSpin) < oneDay) {
        return res.json({ success: false, message: "Yarın tekrar gel!" });
    }

    const prizes = [100, 250, 500, 1000];
    const win = prizes[Math.floor(Math.random() * prizes.length)];

    user.balance += win;
    user.lastSpin = now;
    await user.save();
    res.json({ success: true, win, balance: user.balance });
});

// Görev Kontrolü
app.post('/api/check-task', async (req, res) => {
    const { userId, channelId } = req.body;
    let user = await User.findOne({ userId });
    if (!user || user.tasks.includes(channelId)) return res.json({ success: false });

    try {
        if (!channelId.startsWith('@')) {
            user.balance += 500;
            user.tasks.push(channelId);
            await user.save();
            return res.json({ success: true, balance: user.balance });
        }

        const member = await bot.getChatMember(channelId, userId);
        const isValid = ['member', 'administrator', 'creator'].includes(member.status);

        if (isValid) {
            user.balance += 500;
            user.tasks.push(channelId);
            await user.save();
            return res.json({ success: true, balance: user.balance });
        }
        res.json({ success: false });
    } catch (e) {
        user.balance += 500;
        user.tasks.push(channelId);
        await user.save();
        res.json({ success: true, balance: user.balance });
    }
});

// Cüzdan Kaydetme
app.post('/api/save-wallet', async (req, res) => {
    const { userId, wallet } = req.body;
    await User.findOneAndUpdate({ userId }, { wallet });
    res.json({ success: true });
});

// --- TELEGRAM KOMUTLARI (REFERANS SİSTEMİ GÜNCELLENDİ) ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString().trim();
    const text = msg.text || "";

    let user = await User.findOne({ userId });

    // Eğer kullanıcı tamamen yeniyse
    if (!user) {
        user = new User({ userId });
        
        // Referans linkiyle mi geldi? (/start 12345678)
        const parts = text.split(' ');
        if (parts.length > 1 && parts[0] === '/start') {
            const refId = parts[1].trim();
            
            // Kendi linkine tıklamadıysa ve refId doluysa
            if (refId !== userId && refId !== "") {
                const referrer = await User.findOne({ userId: refId });
                if (referrer) {
                    referrer.balance += 500;
                    referrer.refCount += 1;
                    await referrer.save();
                    
                    // Referans sahibine müjdeyi gönder
                    bot.sendMessage(refId, `🔔 **TEBRİKLER!**\n\nEkibine yeni bir avcı katıldı. Hesabına **+500 GEP** eklendi!`, { parse_mode: 'Markdown' });
                }
            }
        }
        await user.save();
    }

    const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}`;
    bot.sendMessage(chatId, `🦅 **Gelir Evreni'ne Hoş Geldin!**\n\nKendi imparatorluğunu kurmak ve madenciliğe başlamak için aşağıdaki butona dokun!`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: "🚀 İmparatorluğu Aç", web_app: { url: webAppUrl } }]]
        }
    });
});

app.listen(process.env.PORT || 10000);
