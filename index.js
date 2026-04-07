const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

// Statik dosyaları (HTML/CSS) sun
app.use(express.static(path.join(__dirname, 'public')));

// Veritabanı Bağlantısı
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 MongoDB Bağlantısı Başarılı")).catch(err => console.log("❌ DB Hatası:", err));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    fullName: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    lastMined: { type: Date, default: null },
    completedTasks: { type: [String], default: [] },
    pendingTasks: [{ taskId: String, clickedAt: Date }]
});

const User = mongoose.model('User', UserSchema);
const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

// API: Kullanıcı Verisi (Otomatik Onay Kontrolü Dahil)
app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) {
            user = new User({ userId: req.params.id });
            await user.save();
        }

        // 1 Saatlik Bekleme Süresini Kontrol Et
        const now = new Date();
        let isChanged = false;
        if (user.pendingTasks && user.pendingTasks.length > 0) {
            user.pendingTasks = user.pendingTasks.filter(task => {
                const diff = now - new Date(task.clickedAt);
                if (diff >= 3600000) { // 1 saat dolmuşsa
                    if (!user.completedTasks.includes(task.taskId)) {
                        user.balance += 500;
                        user.completedTasks.push(task.taskId);
                        isChanged = true;
                    }
                    return false;
                }
                return true;
            });
        }
        if (isChanged) await user.save();
        res.json(user);
    } catch (e) {
        res.status(500).json({ balance: 0, completedTasks: [], pendingTasks: [] });
    }
});

// API: Madencilik
app.post('/api/mine', async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findOne({ userId });
        const now = new Date();
        if (user.lastMined && (now - user.lastMined < 28800000)) return res.status(400).send("Kilitli");
        
        user.balance += (50 + (user.refCount * 25)) * 8;
        user.lastMined = now;
        await user.save();
        res.json({ success: true, balance: user.balance });
    } catch (e) { res.status(500).send(e.message); }
});

// API: Görev Başlat
app.post('/api/start-task', async (req, res) => {
    try {
        const { userId, taskId } = req.body;
        const user = await User.findOne({ userId });
        if (!user.pendingTasks.find(t => t.taskId === taskId) && !user.completedTasks.includes(taskId)) {
            user.pendingTasks.push({ taskId, clickedAt: new Date() });
            await user.save();
        }
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); }
});

// API: Liderler
app.get('/api/leaderboard/:id', async (req, res) => {
    try {
        const top = await User.find().sort({ balance: -1 }).limit(15);
        const all = await User.find().sort({ balance: -1 });
        const rank = all.findIndex(u => u.userId === req.params.id) + 1;
        res.json({ top, userRank: rank || "-" });
    } catch (e) { res.status(500).send(e.message); }
});

bot.onText(/\/start/, (msg) => {
    const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${msg.from.id}`;
    bot.sendMessage(msg.chat.id, `🚀 **Gelir Evreni'ne Hoş Geldin!**`, {
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç 🚀", web_app: { url: webAppUrl } }]] }
    });
});

app.listen(process.env.PORT || 10000);
