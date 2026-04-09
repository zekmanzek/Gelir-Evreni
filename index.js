const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Render Environment Variables üzerinden okunur
const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = 1469411131; 

const bot = new TelegramBot(token, { polling: true });

// Veritabanı Bağlantısı
mongoose.connect(mongoURI)
    .then(() => console.log("✅ Premium DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));

// Kullanıcı Modeli
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: Date
});
const User = mongoose.model('User', UserSchema);

// Senin 6 Görevin
const TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' },
    { taskId: 'task_4', title: 'Kripto Tayfa Sohbet Katıl', reward: 100, target: 'https://t.me/kriptotayfa' },
    { taskId: 'task_5', title: 'Referans Grubuna Katıl', reward: 100, target: 'https://t.me/referanslinkim' },
    { taskId: 'task_6', title: 'X (Twitter) Takip Et', reward: 100, target: 'https://x.com/kriptotayfa' }
];

// API Endpointleri
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

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
        res.json({ success: false, error: "Zaten yapıldı veya geçersiz." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/withdraw', async (req, res) => {
    const { telegramId, wallet } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        if (user && user.points >= 500000) {
            user.points -= 500000;
            await user.save();
            bot.sendMessage(ADMIN_ID, `💰 **YENİ ÇEKİM TALEBİ**\n👤 Kullanıcı: ${telegramId}\n💳 Cüzdan: ${wallet}\n💎 Miktar: 5 USDT (500k GEP)`);
            return res.json({ success: true });
        }
        res.json({ success: false, error: "Yetersiz bakiye." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Premium Server is active on port ${PORT}`));
