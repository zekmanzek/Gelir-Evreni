const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const token = '8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s';
const bot = new TelegramBot(token, { polling: true });

// GEÇİCİ VERİTABANI (Gerçek bir DB'ye geçene kadar verileri burada tutar)
// Not: Render sunucusu tamamen sıfırlanırsa bu liste boşalır, kalıcı çözüm için MongoDB şarttır.
let users = {}; 

// Web Arayüzü Dosyaları
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// API: Kullanıcı Verilerini Getir veya Yeni Kullanıcı Oluştur
app.get('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const referrerId = req.query.ref; // Eğer ref linkiyle geldiyse

    if (!users[userId]) {
        users[userId] = {
            balance: 0,
            refCount: 0,
            lastMiningStart: null
        };
        
        // EĞER BİRİ DAVET ETTİYSE
        if (referrerId && users[referrerId] && referrerId !== userId) {
            users[referrerId].balance += 500; // Davet edene 500 GEP
            users[referrerId].refCount += 1;  // Davet edenin hızı artsın
            console.log(`${referrerId} kullanıcısına referans ödülü verildi!`);
        }
    }
    res.json(users[userId]);
});

// API: Puan Güncelle (Kazanç Toplandığında)
app.post('/api/save', (req, res) => {
    const { userId, amount } = req.body;
    if (users[userId]) {
        users[userId].balance = amount;
        res.json({ success: true, newBalance: users[userId].balance });
    } else {
        res.status(404).json({ error: "Kullanıcı bulunamadı" });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Bot Mesajı ve Referans Linki Oluşturma
bot.on('message', (msg) => {
    if (msg.text && msg.text.startsWith('/start')) {
        const userId = msg.from.id;
        const parts = msg.text.split(' ');
        const referrerId = parts.length > 1 ? parts[1] : null;

        // WebApp URL'ine ref parametresini ekliyoruz
        const webAppUrl = `https://gelir-evreni.onrender.com?userid=${userId}${referrerId ? '&ref=' + referrerId : ''}`;

        bot.sendMessage(msg.chat.id, `🦅 Gelir Evreni'ne Hoş Geldin Avcı!\n\nSenin Referans Linkin:\nhttps://t.me/gelir_evreni_bot?start=${userId}\n\nHer davet için 500 GEP ve +10 Hız kazanırsın!`, {
            reply_markup: {
                inline_keyboard: [[
                    { text: "🚀 Madenciliği Aç", web_app: { url: webAppUrl } }
                ]]
            }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
