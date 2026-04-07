const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, 'public')));

const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("💎 DB Bağlandı"));

const UserSchema = new mongoose.Schema({
    userId: { type: String, unique: true, required: true },
    fullName: { type: String, default: "Avcı" },
    balance: { type: Number, default: 0 },
    refCount: { type: Number, default: 0 },
    lastMined: { type: Date, default: null },
    completedTasks: { type: [String], default: [] },
    pendingTasks: [{
        taskId: String,
        clickedAt: Date
    }]
});

const User = mongoose.model('User', UserSchema);
const bot = new TelegramBot('8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s', { polling: true });

app.get('/api/user/:id', async (req, res) => {
    try {
        let user = await User.findOne({ userId: req.params.id });
        if (!user) { user = new User({ userId: req.params.id }); await user.save(); }
        
        // --- OTOMATİK ONAY MANTIĞI ---
        const now = new Date();
        let changed = false;
        
        // 1 saati (3600000 ms) dolduran görevleri onayla
        user.pendingTasks = user.pendingTasks.filter(task => {
            if (now - new Date(task.clickedAt) >= 3600000) {
                if (!user.completedTasks.includes(task.taskId)) {
                    user.balance += 500;
                    user.completedTasks.push(task.taskId);
                    changed = true;
                }
                return false; // Beklemeden çıkar
            }
            return true; // Beklemede tut
        });

        if (changed) await user.save();
        res.json(user);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/start-task', async (req, res) => {
    const { userId, taskId } = req.body;
    try {
        let user = await User.findOne({ userId });
        if (user && !user.completedTasks.includes(taskId) && !user.pendingTasks.find(t => t.taskId === taskId)) {
            user.pendingTasks.push({ taskId, clickedAt: new Date() });
            await user.save();
            return res.json({ success: true });
        }
        res.status(400).json({ error: "Zaten başlatıldı veya bitti" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/mine', async (req, res) => {
    const { userId } = req.body;
    try {
        let user = await User.findOne({ userId });
        const now = new Date();
        if (user.lastMined && (now - user.lastMined < 8 * 60 * 60 * 1000)) return res.status(400).json({ error: "Kilitli" });
        user.balance += (50 + (user.refCount * 25)) * 8;
        user.lastMined = now;
        await user.save();
        res.json({ success: true, balance: user.balance });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/leaderboard/:id', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ balance: -1 }).limit(20);
        const allUsers = await User.find().sort({ balance: -1 });
        const userRank = allUsers.findIndex(u => u.userId === req.params.id) + 1;
        res.json({ top20: topUsers, userRank: userRank || "-" });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

bot.onText(/\/start/, (msg) => {
    const webAppUrl = `https://gelir-evreni.onrender.com/?userid=${msg.from.id}`;
    bot.sendMessage(msg.chat.id, `🎯 **Gelir Evreni Aktif!**`, {
        reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç 🚀", web_app: { url: webAppUrl } }]] }
    });
});

app.listen(process.env.PORT || 10000);
