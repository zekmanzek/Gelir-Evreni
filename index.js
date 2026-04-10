const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- UYGULAMA AYARLARI ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

// --- VERİTABANI BAĞLANTISI ---
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Premium DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));

// --- KULLANICI MODELİ ---
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

// --- GÖREV TANIMLARI ---
const TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' },
    { taskId: 'task_4', title: 'Kripto Tayfa Sohbet Katıl', reward: 100, target: 'https://t.me/kriptotayfa' },
    { taskId: 'task_5', title: 'Referans Grubuna Katıl', reward: 100, target: 'https://t.me/referanslinkim' },
    { taskId: 'task_6', title: 'X (Twitter) Takip Et', reward: 100, target: 'https://x.com/kriptotayfa' }
];

// --- TELEGRAM BOT KOMUTLARI ---
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id.toString();
    const referrerId = match[1];
    let user = await User.findOne({ telegramId: chatId });
    
    if (!user) {
        user = new User({ telegramId: chatId, referredBy: referrerId });
        await user.save();
        // Referans veren kişiye ödül ver
        await User.findOneAndUpdate({ telegramId: referrerId }, { $inc: { points: 500, referralCount: 1 } });
    }
    sendWelcome(chatId);
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id.toString();
    let user = await User.findOne({ telegramId: chatId });
    if (!user) { 
        user = new User({ telegramId: chatId }); 
        await user.save(); 
    }
    sendWelcome(chatId);
});

function sendWelcome(chatId) {
    bot.sendMessage(chatId, "🚀 **Gelir Evreni'ne Hoş Geldin!**\n\nBurada görevleri yaparak, maden kazarak ve çarkı çevirerek GEP puanları toplayabilirsin.", {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [[{ 
                text: "Uygulamayı Aç 📱", 
                web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` } 
            }]]
        }
    });
}

// --- API ENDPOINTLERİ ---

// Kullanıcı Giriş & Bilgi Çekme
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        const botInfo = await bot.getMe();
        res.json({ success: true, user, botUsername: botInfo.username });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Görev Listesini Getir
app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

// Görev Tamamlama
app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const task = TASKS.find(t => t.taskId === taskId);
        
        if (user && task && !user.completedTasks.includes(taskId)) {
            user.points += task.reward;
            user.completedTasks.push(taskId);
            await user.save();
            return res.json({ success: true, points: user.points });
        }
        res.json({ success: false, message: "Görev zaten tamamlanmış veya bulunamadı." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Şans Çarkı (24 Saat Beklemeli)
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000;

        if (user && (now - new Date(user.lastSpin)) > cooldown) {
            const prize = Math.floor(Math.random() * 451) + 50; // 50-500 arası
            user.points += prize;
            user.lastSpin = now;
            await user.save();
            return res.json({ success: true, prize, points: user.points });
        }
        res.json({ success: false, message: "Yarın tekrar gel!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Madencilik (8 Saat Beklemeli)
app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const cooldown = 8 * 60 * 60 * 1000;

        if (user && (now - new Date(user.lastMining)) > cooldown) {
            user.points += 500;
            user.lastMining = now;
            await user.save();
            return res.json({ success: true, points: user.points, lastMining: user.lastMining });
        }
        res.json({ success: false, message: "Henüz maden hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Para Çekme Talebi
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const minWithdraw = 500000;

        if (user && user.points >= minWithdraw) {
            user.points -= minWithdraw;
            await user.save();
            
            // Yöneticiye bildirim gönder
            bot.sendMessage(ADMIN_ID, `💰 **YENİ ÇEKİM TALEBİ**\n\n👤 **Kullanıcı:** ${telegramId}\n🏦 **Cüzdan:** \`${wallet}\`\n💵 **Miktar:** 5 USDT (500k GEP)`, { parse_mode: "Markdown" });
            
            return res.json({ success: true });
        }
        res.json({ success: false, message: "Yetersiz bakiye." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// SPA (Single Page Application) Desteği
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Sunucuyu Başlat
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
