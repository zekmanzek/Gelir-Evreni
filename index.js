const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// --- DOSYA YOLUNU GARANTİYE ALAN KISIM ---
const publicPath = path.resolve(__dirname); 
app.use(express.static(publicPath));

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';

// Polling hatasını engellemek için botu bu şekilde başlatıyoruz
const bot = new TelegramBot(token, { 
    polling: {
        autoStart: true,
        params: { timeout: 10 }
    } 
});

const ADMIN_ID = 1469411131; 
let users = {}; 

// Ana sayfa için her iki ihtimali de deniyoruz
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
        if (err) {
            // Eğer src içindeyse oradan dene
            res.sendFile(path.join(publicPath, 'src', 'index.html'), (err2) => {
                if (err2) res.status(404).send("index.html bulunamadı! Lütfen dosya adını kontrol et.");
            });
        }
    });
});

// API ve Kayıt fonksiyonların (Aynı kalıyor)
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;
    if (!users[userId]) {
        users[userId] = { balance: 0, refCount: 0, tasks: [], refs: [], wallet: '' };
        if (referrerId && users[referrerId] && referrerId !== userId) {
            users[referrerId].balance += 500;
            users[referrerId].refCount += 1;
            users[referrerId].refs.push(userId);
        }
    }
    res.json(users[userId]);
});

app.post('/api/save', (req, res) => {
    const { userId, amount, tasks, wallet, isRequest } = req.body;
    if (users[userId]) {
        if (amount !== undefined) users[userId].balance = amount;
        if (tasks !== undefined) users[userId].tasks = tasks;
        if (wallet !== undefined) users[userId].wallet = wallet;
        if (isRequest) {
            bot.sendMessage(ADMIN_ID, `💰 **YENİ ÖDEME TALEBİ!**\n\n👤 **Kullanıcı:** ${userId}\n💎 **Bakiye:** ${users[userId].balance}\n💳 **Cüzdan:** ${wallet}`, { parse_mode: 'Markdown' });
        }
        res.json({ success: true });
    } else {
        res.status(404).json({error: "User not found"});
    }
});

bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/start')) {
        const userId = msg.from.id;
        const parts = msg.text.split(' ');
        const referrerId = parts.length > 1 ? parts[1] : null;
        const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}${referrerId ? '&ref=' + referrerId : ''}`;
        bot.sendMessage(msg.chat.id, `🦅 Gelir Evreni'ne Hoş Geldin!\n\nRef Linkin: https://t.me/gelir_evreni_bot?start=${userId}`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }]] }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
