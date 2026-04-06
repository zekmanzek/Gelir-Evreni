const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

// CACHE BUSTER: Tarayıcının eski tasarımı göstermesini engellemek için zorunlu ayar
app.use(express.static(path.join(__dirname, 'public'), {
    etag: false,
    lastModified: false,
    setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    }
}));

// --- DB BAĞLANTISI ---
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 Evrenin Kalbi Atıyor!"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    username: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    level: { type: Number, default: 1 }, // Görseldeki seviye sistemi
    lastMined: { type: Date, default: null },
    lastSpin: { type: Date, default: null }
});
const User = mongoose.model('User', UserSchema);

// --- BOT AYARI ---
// polling_error çakışmasını önlemek için hata yakalayıcı eklendi
const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { 
    polling: true,
    filepath: false 
});

bot.on('polling_error', (error) => {
    if (error.code === 'ETELEGRAM' && error.message.includes('409 Conflict')) {
        console.log("⚠️ Bot başka bir yerde açık, çakışma önleniyor...");
    }
});

// --- API SİSTEMİ (Görseldeki verilere göre güncellendi) ---

app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) { 
            user = new User({ userId: req.params.id }); 
            await user.save(); 
        }
        
        // Görseldeki gibi hız hesaplama: Temel 50 + Referans başı 25 + Seviye bonusu
        const speed = 50 + (user.refCount * 25) + (user.level * 10);
        const usdRate = 0.0001; // 1 GEP = $0.0001 (Görseldeki yaklaşık değer)
        const balanceUsd = (user.balance * usdRate).toFixed(2);

        res.json({ 
            ...user._doc, 
            speed, 
            balanceUsd,
            nextLevelExp: user.level * 5000 // Seviye atlamak için gereken
        });
    } catch (err) {
        res.status(500).send(err);
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const top = await User.find().sort({ balance: -1 }).limit(10);
    res.json(top);
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    let user = await User.findOne({ userId });
    
    // Madencilik hızı ve ödül hesaplama (8 saatlik periyot)
    const speed = 50 + (user.refCount * 25) + (user.level * 10);
    const reward = speed * 8; 
    
    user.balance += reward;
    user.lastMined = new Date();
    
    // Otomatik seviye kontrolü
    if (user.balance > user.level * 5000) {
        user.level += 1;
    }
    
    await user.save();
    res.json({ success: true, reward });
});

// --- BOT KOMUTLARI ---
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
                refUser.balance += 1000; // Davet bonusu
                refUser.refCount += 1;
                await refUser.save();
                bot.sendMessage(refId, `🚀 **Yeni Bir Avcı Katıldı!**\nReferansınla gelen üye için **+1000 GEP** kazandın!`);
            }
        }
        await user.save();
    }
    
    bot.sendMessage(msg.chat.id, `🦅 **Gelir Evreni'ne Hoş Geldin ${name}!**\n\nFinansal imparatorluğunu kurmak için aşağıdaki butona tıkla.`, {
        reply_markup: { 
            inline_keyboard: [[{ 
                text: "🚀 İmparatorluğa Gir", 
                web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } 
            }]] 
        }
    });
});

app.listen(process.env.PORT || 10000, () => {
    console.log("🚀 Gelir Evreni Sunucusu 10000 portunda aktif!");
});
