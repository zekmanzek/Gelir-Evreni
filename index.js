const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });
const ADMIN_ID = 1469411131;

let users = {}; 

app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref;
    if (!users[userId]) {
        users[userId] = { balance: 0, refCount: 0, tasks: [], wallet: '', baseSpeed: 50, lastMined: null, refs: [] };
        if (referrerId && users[referrerId] && referrerId !== userId) {
            users[referrerId].balance += 500;
            users[referrerId].refCount += 1;
            users[referrerId].refs.push(userId);
        }
    }
    users[userId].currentSpeed = users[userId].baseSpeed + (users[userId].refCount * 50);
    res.json(users[userId]);
});

app.post('/api/check-task', async (req, res) => {
    const { userId, channelId } = req.body;
    try {
        if(channelId.startsWith('x_')) { // X görevleri için manuel onay
            if(!users[userId].tasks.includes(channelId)) {
                users[userId].balance += 500;
                users[userId].tasks.push(channelId);
                return res.json({ success: true });
            }
        }
        const member = await bot.getChatMember(channelId, userId);
        const isMember = ['member', 'administrator', 'creator'].includes(member.status);
        if (isMember && !users[userId].tasks.includes(channelId)) {
            users[userId].balance += 500;
            users[userId].tasks.push(channelId);
            res.json({ success: true });
        } else { res.json({ success: false }); }
    } catch (e) { res.json({ success: false }); }
});

app.post('/api/mine', (req, res) => {
    const { userId } = req.body;
    const now = Date.now();
    users[userId].balance += (users[userId].baseSpeed + (users[userId].refCount * 50)) * 8; // 8 saatlik kazancı ekle
    users[userId].lastMined = now;
    res.json({ success: true, balance: users[userId].balance, lastMined: now });
});

app.post('/api/save-wallet', (req, res) => {
    const { userId, wallet } = req.body;
    if(users[userId]) { users[userId].wallet = wallet; res.json({success:true}); }
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
