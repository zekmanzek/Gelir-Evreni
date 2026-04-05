const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');

const app = express();
const token = '7911663080:AAH805W-H3mZ_fBscL0m_uS869BUn0vQ-yA'; // Senin tokenin
const bot = new TelegramBot(token, { polling: true });

// Web Sunucusu Ayarları
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda aktif.`);
});

// Bot Komutları
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🦅 Gelir Evreni'ne Hoş Geldin Avcı!\n\nSenin 10 yıllık piyasa tecrübenle harmanlanmış bu sistemde madenciliğe başlamak için aşağıdaki butona tıkla.", {
        reply_markup: {
            inline_keyboard: [[
                { text: "🚀 Madenciliği Aç", web_app: { url: 'https://' + msg.header + '.onrender.com' || 'https://gelir-evreni.onrender.com' } }
            ]]
        }
    });
});

console.log("Bot başarıyla başlatıldı!");
