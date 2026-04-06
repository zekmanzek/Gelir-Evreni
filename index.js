const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
// Polling hatasını önlemek için botu temiz başlatıyoruz
const bot = new TelegramBot(token, { polling: true });
const ADMIN_ID = 1469411131;

let users = {}; 

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;

    if (!users[userId]) {
        users[userId] = { 
            balance: 0, 
            refCount: 0, 
            tasks: [], 
            wallet: '', 
            baseSpeed: 50,
            lastMined: null 
        };
        if (referrerId && users[referrerId] && referrerId !== userId) {
            users[referrerId].balance += 500;
            users[referrerId].refCount += 1;
        }
    }
    users[userId].currentSpeed = users[userId].baseSpeed + (users[userId].refCount * 50);
    res.json(users[userId]);
});

app.post('/api/check-task', async (req, res) => {
    const { userId, channelId } = req.body;
    try {
        const member = await bot.getChatMember(channelId, userId);
        const isMember = ['member', 'administrator', 'creator'].includes(member.status);
        
        if (isMember && !users[userId].tasks.includes(channelId)) {
            users[userId].balance += 500;
            users[userId].tasks.push(channelId);
            res.json({ success: true, balance: users[userId].balance });
        } else {
            res.json({ success: false, error: 'Zaten yapıldı veya katılım yok.' });
        }
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/mine', (req, res) => {
    const { userId } = req.body;
    const now = Date.now();
    if (users[userId]) {
        users[userId].balance += 500;
        users[userId].lastMined = now;
        res.json({ success: true, balance: users[userId].balance, lastMined: now });
    } else {
        res.status(404).json({ success: false });
    }
});

bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/start')) {
        const userId = msg.from.id;
        const parts = msg.text.split(' ');
        const refId = parts.length > 1 ? parts[1] : null;
        const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}${refId ? '&ref=' + refId : ''}`;
        bot.sendMessage(msg.chat.id, `🦅 Gelir Evreni'ne Hoş Geldin!\n\nAlt Sınır: 50.000 GEP (5$)\nRef Başı: +50 Hız\n\nRef Linkin: https://t.me/gelir_evreni_bot?start=${userId}`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }]] }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
