const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Dosyaların public klasöründe olduğunu sunucuya zorla öğretiyoruz
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });
const ADMIN_ID = 1469411131;

let users = {};

// Ana dizine gelindiğinde index.html'i gönder
app.get('/', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;
    if (!users[userId]) {
        users[userId] = { balance: 0, refCount: 0, tasks: [], refs: [], wallet: '', baseSpeed: 50 };
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
        if (isMember && (!users[userId].tasks || !users[userId].tasks.includes(channelId))) {
            if(!users[userId].tasks) users[userId].tasks = [];
            users[userId].balance += 500;
            users[userId].tasks.push(channelId);
            res.json({ success: true, balance: users[userId].balance });
        } else {
            res.json({ success: false, error: 'Katılım bulunamadı.' });
        }
    } catch (e) { res.json({ success: false }); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
