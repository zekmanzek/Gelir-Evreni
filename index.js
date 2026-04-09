const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = 1469411131; 

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI)
    .then(() => console.log("✅ Premium DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] }
});
const User = mongoose.model('User', UserSchema);

// BOT KOMUTLARI (Botun cevap vermesi için eklendi)
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "🚀 Gelir Evreni'ne Hoş Geldin!\n\nAlttaki butona tıklayarak kazanmaya başlayabilirsin.", {
        reply_markup: {
            inline_keyboard: [[
                { text: "Uygulamayı Aç 📱", web_app: { url: `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` } }
            ]]
        }
    });
});

const TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' },
    { taskId: 'task_4', title: 'Kripto Tayfa Sohbet Katıl', reward: 100, target: 'https://t.me/kriptotayfa' },
    { taskId: 'task_5', title: 'Referans Grubuna Katıl', reward: 100, target: 'https://t.me/referanslinkim' },
    { taskId: 'task_6', title: 'X (Twitter) Takip Et', reward: 100, target: 'https://x.com/kriptotayfa' }
];

app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) { user = new User({ telegramId }); await user.save(); }
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
        res.json({ success: false });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server active on ${PORT}`));
