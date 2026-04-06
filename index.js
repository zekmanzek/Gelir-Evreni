const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- VERİ TABANI BAĞLANTISI (HAFIZA MERKEZİ) ---
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log("Hafıza merkezi bağlandı!"))
    .catch(err => console.log("Bağlantı hatası:", err));

// Kullanıcı Şeması (Verilerin nasıl saklanacağı)
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    wallet: { type: String, default: '' },
    baseSpeed: { type: Number, default: 50 },
    lastMined: { type: Number, default: null }
});

const User = mongoose.model('User', UserSchema);

// --- BOT VE SUNUCU AYARLARI ---
const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

app.get('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;
    
    let user = await User.findOne({ userId });
    
    if (!user) {
        user = new User({ userId });
        await user.save();
        
        if (referrerId && referrerId !== userId) {
            const referrer = await User.findOne({ userId: referrerId });
            if (referrer) {
                referrer.balance += 500;
                referrer.refCount += 1;
                await referrer.save();
            }
        }
    }
    
    const currentSpeed = user.baseSpeed + (user.refCount * 50);
    res.json({ ...user._doc, currentSpeed });
});

app.post('/api/check-task', async (req, res) => {
    const { userId, channelId } = req.body;
    let user = await User.findOne({ userId });
    
    if (!user) return res.status(404).json({ success: false });

    try {
        if (channelId.startsWith('x_')) {
            if (!user.tasks.includes(channelId)) {
                user.balance += 500;
                user.tasks.push(channelId);
                await user.save();
                return res.json({ success: true });
            }
        } else {
            const member = await bot.getChatMember(channelId, userId);
            const isMember = ['member', 'administrator', 'creator'].includes(member.status);
            if (isMember && !user.tasks.includes(channelId)) {
                user.balance += 500;
                user.tasks.push(channelId);
                await user.save();
                return res.json({ success: true });
            }
        }
        res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    const now = Date.now();
    let user = await User.findOne({ userId });
    
    if (user) {
        const speed = user.baseSpeed + (user.refCount * 50);
        user.balance += speed * 8; // 8 saatlik kazanç
        user.lastMined = now;
        await user.save();
        res.json({ success: true, balance: user.balance, lastMined: now });
    }
});

app.post('/api/save-wallet', async (req, res) => {
    const { userId, wallet } = req.body;
    await User.findOneAndUpdate({ userId }, { wallet });
    res.json({ success: true });
});

bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/start')) {
        const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${msg.from.id}${msg.text.split(' ')[1] ? '&ref=' + msg.text.split(' ')[1] : ''}`;
        bot.sendMessage(msg.chat.id, `🦅 Gelir Evreni'ne Hoş Geldin!\n\nMadencilik yaparak GEP kazan!`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }]] }
        });
    }
});

app.listen(process.env.PORT || 10000);
