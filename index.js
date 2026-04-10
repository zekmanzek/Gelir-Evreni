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
    .then(() => console.log("✅ Gelir Evreni DB Connected"))
    .catch(err => console.error("❌ DB Error:", err));

// --- KULLANICI MODELİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referredBy: { type: String, default: null },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) }
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
        // Kendini davet etmeyi engelle ve davet edene ödül ver
        if (referrerId !== chatId) {
            await User.findOneAndUpdate(
                { telegramId: referrerId }, 
                { $inc: { points: 500, referralCount: 1 } }
            );
        }
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
    bot.sendMessage(chatId, "🚀 **Gelir Evreni'ye Hoş Geldin!**\n\nBurada görevleri yaparak ve arkadaşatını davet ederek GEP toplayabilirsin.", {
        parse_mode: "Markdown",
        reply_markup: {
            inline_keyboard: [[{ 
                text: "Uygulamayı Aç 📱", 
                web_app: { url: `https://gelir-evreni.onrender.com` } 
            }]]
        }
    });
}

// --- API ENDPOINTLERİ ---

// Kullanıcı Giriş & Veri Getirme
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        
        const botInfo = await bot.getMe();
        res.json({ success: true, user, botUsername: botInfo.username });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

// Şans Çarkı
app.post('/api/spin', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const cooldown = 24 * 60 * 60 * 1000;

        if (user && (now - new Date(user.lastSpin)) > cooldown) {
            const prizes = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];
            const prize = prizes[Math.floor(Math.random() * prizes.length)];
            user.points += prize;
            user.lastSpin = now;
            await user.save();
            return res.json({ success: true, prize, points: user.points });
        }
        res.json({ success: false, message: "Yarın tekrar gel!" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// GÜNLÜK GİRİŞ (CHECK-IN)
app.post('/api/daily-checkin', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (!user) return res.json({ success: false, message: "Kullanıcı bulunamadı." });

        const now = new Date();
        const lastDate = new Date(user.lastCheckin);
        
        // Sadece gün bazında karşılaştırma
        const today = new Date().setHours(0,0,0,0);
        const last = new Date(user.lastCheckin).setHours(0,0,0,0);

        if (today === last) {
            return res.json({ success: false, message: "Bugün zaten ödülünü aldın!" });
        }

        // Seri kontrolü
        const oneDayMs = 24 * 60 * 60 * 1000;
        if (today - last > oneDayMs) {
            user.streak = 1; // Ara verilmişse sıfırla
        } else {
            user.streak = (user.streak % 7) + 1;
        }

        const rewards = [0, 100, 200, 300, 400, 500, 600, 1000];
        const currentReward = rewards[user.streak];

        user.points += currentReward;
        user.lastCheckin = now;
        await user.save();

        res.json({ 
            success: true, 
            streak: user.streak, 
            reward: currentReward, 
            points: user.points 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Madencilik
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

// Para Çekme
app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const minWithdraw = 500000;
        if (user && user.points >= minWithdraw) {
            user.points -= minWithdraw;
            await user.save();
            bot.sendMessage(ADMIN_ID, `💰 **YENİ ÇEKİM TALEBİ**\n\n👤 **ID:** ${telegramId}\n🏦 **Cüzdan:** \`${wallet}\`\n💵 **Miktar:** 5 USDT`, { parse_mode: "Markdown" });
            return res.json({ success: true });
        }
        res.json({ success: false, message: "Yetersiz bakiye (Min: 500.000 GEP)." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Frontend Dosyasını Sunma
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Gelir Evreni Server running on port ${PORT}`);
});
