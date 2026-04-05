const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const app = express();
const token = '7911663080:AAH805W-H3mZ_fBscL0m_uS869BUn0vQ-yA';
const bot = new TelegramBot(token, { polling: true });

// Web Arayüzü - Dosya nerede olursa olsun bulur
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        }
    });
});

// Bot Cevabı
bot.on('message', (msg) => {
    if (msg.text === '/start') {
        bot.sendMessage(msg.chat.id, "🦅 Gelir Evreni'ne Hoş Geldin Avcı!\n\nMadenciliği başlatmak için tıkla:", {
            reply_markup: {
                inline_keyboard: [[
                    { text: "🚀 Madenciliği Aç", web_app: { url: 'https://gelir-evreni.onrender.com' } }
                ]]
            }
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
