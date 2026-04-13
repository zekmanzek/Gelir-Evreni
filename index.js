require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;

if (!token || !mongoURI) {
    console.error("ENV eksik!");
    process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB OK"))
    .catch(err => console.error(err));

app.get('/', (req, res) => {
    res.send("Server çalışıyor ✅");
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🚀 Bot ${PORT} portunda çalışıyor`);
});
