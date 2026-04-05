const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const path = require('path');

const bot = new Telegraf(process.env.BOT_TOKEN);
const app = express();

// Statik dosyalar için
app.use(express.static('public'));

// Mini App yolu
app.get('/api/miniapp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Bot başlangıç komutu
bot.start((ctx) => {
  ctx.reply('Gelir Evreni V2\'ye Hoş Geldiniz! 🚀', 
    Markup.inlineKeyboard([
      Markup.button.webApp('Madenciliğe Başla', `https://${process.env.KOYEB_APP_NAME}.koyeb.app/api/miniapp`)
    ])
  );
});

// Sunucuyu başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda aktif.`);
  bot.launch();
});
