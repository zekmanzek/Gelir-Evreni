const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

let users = {}; 

app.use(express.static(__dirname));

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;
    if (!users[userId]) {
        users[userId] = { balance: 0, refCount: 0, tasks: [], refs: [] };
        if (referrerId && users[referrerId] && referrerId !== userId) {
            users[referrerId].balance += 500;
            users[referrerId].refCount += 1;
            users[referrerId].refs.push(userId); // Referans listesine ekle
        }
    }
    res.json(users[userId]);
});

app.post('/api/save', (req, res) => {
    const { userId, amount, tasks } = req.body;
    if (users[userId]) {
        if (amount !== undefined) users[userId].balance = amount;
        if (tasks !== undefined) users[userId].tasks = tasks;
        res.json({ success: true });
    } else {
        res.status(404).send();
    }
});

app.get('/', (req, res) => { res.sendFile(path.resolve(__dirname, 'index.html')); });

bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/start')) {
        const userId = msg.from.id;
        const parts = msg.text.split(' ');
        const referrerId = parts.length > 1 ? parts[1] : null;
        const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${userId}${referrerId ? '&ref=' + referrerId : ''}`;
        bot.sendMessage(msg.chat.id, `🦅 Gelir Evreni'ne Hoş Geldin Avcı!\n\nRef Linkin: https://t.me/gelir_evreni_bot?start=${userId}\n\nHer ref: 500 GEP +10 Hız!`, {
            reply_markup: { inline_keyboard: [[{ text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }]] }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
