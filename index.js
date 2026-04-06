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

// Kullanıcı Şeması (lastSpin eklendi)
const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    tasks: [String],
    wallet: { type: String, default: '' },
    baseSpeed: { type: Number, default: 50 },
    lastMined: { type: Number, default: null },
    lastSpin: { type: Date, default: null } // Son çark çevirme zamanı
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

// --- TELEGRAM KOMUTLARI ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    if (msg.text && msg.text.startsWith('/start')) {
        const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}`;
        
        bot.sendMessage(chatId, `🦅 Gelir Evreni'ne Hoş Geldin!\n\nGünlük çarkını çevirmeyi unutma!`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }],
                    [{ text: "🎡 Şans Çarkı (Günlük)", callback_data: 'spin_wheel' }]
                ]
            }
        });
    }
});

// --- ÇARK ÇEVİRME MANTIĞI ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();

    if (query.data === 'spin_wheel') {
        let user = await User.findOne({ userId });
        if (!user) user = new User({ userId });

        const now = new Date();
        const oneDay = 24 * 60 * 60 * 1000;

        if (user.lastSpin && (now - user.lastSpin) < oneDay) {
            const remaining = new Date(user.lastSpin.getTime() + oneDay) - now;
            const hours = Math.floor(remaining / (1000 * 60 * 60));
            const minutes = Math.floor((remaining / (1000 * 60)) % 60);
            
            return bot.answerCallbackQuery(query.id, {
                text: `Sabırlı ol dostum! Tekrar çevirmek için ${hours} saat ${minutes} dakika beklemen lazım. ⏳`,
                show_alert: true
            });
        }

        // Ödül Belirleme (100, 250, 500, 1000 GEP)
        const prizes = [100, 100, 100, 250, 250, 500, 1000];
        const win = prizes[Math.floor(Math.random() * prizes.length)];

        user.balance += win;
        user.lastSpin = now;
        await user.save();

        bot.editMessageText(`🎡 Çark dönüyor... \n\n🎉 TEBRİKLER! **${win} GEP** kazandın! \n\nYeni bakiyen: ${user.balance} GEP`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            reply_markup: {
                inline_keyboard: [[{ text: "🚀 Madenciliğe Dön", web_app: { url: `https://gelir-evreni.onrender.com/?userid=${userId}` } }]]
            }
        });
    }
});

app.listen(process.env.PORT || 10000);
