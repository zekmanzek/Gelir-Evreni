const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Render Environment Variables
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

// Veritabanı Bağlantısı
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Premium DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));

// Kullanıcı Modeli (Gelişmiş)
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 }
});
const User = mongoose.model('User', UserSchema);

// --- SENİN 100 GEP'LİK GÖREVLERİN (Geri Getirildi!) ---
const TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' },
    { taskId: 'task_4', title: 'Kripto Tayfa Sohbet Katıl', reward: 100, target: 'https://t.me/kriptotayfa' },
    { taskId: 'task_5', title: 'Referans Grubuna Katıl', reward: 100, target: 'https://t.me/referanslinkim' },
    { taskId: 'task_6', title: 'X (Twitter) Takip Et', reward: 100, target: 'https://x.com/kriptotayfa' }
];

// BOT KOMUTLARI & REFERANS SİSTEMİ
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const referrerId = match[1];
    let user = await User.findOne({ telegramId: chatId });
    if (!user) {
        user = new User({ telegramId: chatId, referredBy: referrerId });
        await user.save();
        // Referans verene ödül
        await User.findOneAndUpdate({ telegramId: referrerId }, { $inc: { points: 500, referralCount: 1 } });
    }
    sendWelcomeMessage(chatId);
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id.toString();
    let user = await User.findOne({ telegramId: chatId });
    if (!user) { user = new User({ telegramId: chatId }); await user.save(); }
    sendWelcomeMessage(chatId);
});

function sendWelcomeMessage(chatId) {
    bot.sendMessage(chatId, "🚀 Gelir Evreni'ne Hoş Geldin!\n\nAlttaki butona tıklayarak kazanmaya başlayabilirsin.", {
        reply_markup: {
            inline_keyboard: [[
                { text: "Uygulamayı Aç 📱", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` } }
            ]]
        }
    });
}

// --- API ENDPOINTLERİ ---

// Kullanıcı Kayıt/Giriş
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        const botInfo = await bot.getMe();
        res.json({ success: true, user, botUsername: botInfo.username });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Görev Listesi
app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

// Görev Tamamlama
app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = TASKS.find(t => t.taskId === taskId);
    if (user && task && !user.completedTasks.includes(taskId)) {
        user.points += task.reward;
        user.completedTasks.push(taskId);
        await user.save();
        return res.json({ success: true, points: user.points });
    }
    res.json({ success: false, error: "Zaten yapıldı." });
});

// Çark Sistemi (24 Saat)
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - new Date(user.lastSpin)) > 24 * 60 * 60 * 1000) {
        const prize = Math.floor(Math.random() * (500 - 50 + 1)) + 50;
        user.points += prize;
        user.lastSpin = now;
        await user.save();
        return res.json({ success: true, prize, points: user.points });
    }
    res.json({ success: false, message: "Bugün zaten çevirdin! Yarın tekrar gel." });
});

// Madencilik (8 Saat)
app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 8 * 60 * 60 * 1000) {
        user.points += 500;
        user.lastMining = now;
        await user.save();
        return res.json({ success: true, points: user.points });
    }
    res.json({ success: false, message: "Maden henüz dolmadı!" });
});

// Ödeme Talebi
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && user.points >= 500000) {
        user.points -= 500000;
        await user.save();
        bot.sendMessage(ADMIN_ID, `💰 **ÇEKİM TALEBİ**\n👤 ID: ${telegramId}\n💳 Cüzdan: ${wallet}\n💎 Miktar: 5 USDT`);
        return res.json({ success: true });
    }
    res.json({ success: false });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Premium Server Active on ${PORT}`));
