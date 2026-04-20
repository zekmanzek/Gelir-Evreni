require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const ADMIN_ID = process.env.ADMIN_ID || "1469411131";
const WEBHOOK_URL = "https://gelir-evreni.onrender.com"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/webhook`);

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Gelir Evreni v3.0 - Sistem Aktif (Webhook Mode)"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// --- SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    telegramId: { type: String, unique: true, index: true },
    username: { type: String, default: '', index: true }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    dailyPoints: { type: Number, default: 0 }, // YENİ: Günlük kazanılan puan
    lastPointDate: { type: Date, default: Date.now }, // YENİ: Son puan kazanma tarihi (sıfırlama için)
    completedTasks: { type: [String], default: [] },
    lastMining: { type: Date, default: new Date(0) },
    lastCheckin: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    level: { type: String, default: 'Bronz' },
    isBanned: { type: Boolean, default: false },
    miningLevel: { type: Number, default: 1 } 
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: { type: String, unique: true },
    title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
    announcements: [String],
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 500 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' }
}));

// YENİ HELPER FONKSİYON: Puan eklerken günlük puanı da sıfırlar veya üstüne ekler
function addPoints(user, amount) {
    const now = new Date();
    // Eğer kullanıcının son puan kazandığı tarih bugün değilse, günlük puanı sıfırla
    if (user.lastPointDate.toDateString() !== now.toDateString()) {
        user.dailyPoints = 0;
    }
    user.points += amount;
    user.dailyPoints += amount;
    user.lastPointDate = now;
}

// --- API ROTALARI ---

app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName, referrerId } = req.body;
    
    try {
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({ 
                telegramId, 
                username: (username || '').toLowerCase(), 
                firstName,
                points: 0, // Aşağıda 1000 eklenecek
                dailyPoints: 0
            });
            addPoints(user, 1000); // Başlangıç puanı günlük puana da işler

            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) {
                    addPoints(referrer, 2500); // Davet edene ekle
                    referrer.referralCount += 1;
                    await referrer.save();
                    addPoints(user, 1000); // Davet edilene ekle
                }
            }
        } else {
            if (username) user.username = username.toLowerCase();
            if (firstName) user.firstName = firstName;
        }
        
        await user.save();
        let settings = await Settings.findOne() || await Settings.create({});
        
        res.json({ 
            success: true, 
            user, 
            botUsername: settings.botUsername, 
            isAdmin: String(telegramId) === String(ADMIN_ID), 
            announcements: settings.announcements 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/daily-reward', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    
    const now = new Date();
    const lastCheckin = new Date(user.lastCheckin);
    const diffHours = (now - lastCheckin) / (1000 * 60 * 60);

    if (diffHours < 24) {
        return res.json({ success: false, message: "Ödülünüzü zaten aldınız, 24 saat bekleyin." });
    }

    if (diffHours >= 48) {
        user.streak = 1;
    } else {
        user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    }

    const reward = 100 * Math.pow(2, user.streak - 1);
    addPoints(user, reward);
    user.lastCheckin = now;
    await user.save();
    
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/adsgram-reward', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    const settings = await Settings.findOne() || { adsgramReward: 500 };
    addPoints(user, settings.adsgramReward);
    await user.save();
    res.json({ success: true, points: user.points });
});

app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500);
        addPoints(user, reward);
        user.lastMining = now;
        await user.save();
        return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false, message: "Maden hazır değil." });
});

app.post('/api/upgrade-mine', async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });

    const upgradeCost = user.miningLevel * 10000;

    if (user.points >= upgradeCost) {
        user.points -= upgradeCost; // Harcama günlük kazanılanı (dailyPoints) düşürmez, genelden düşer
        user.miningLevel += 1;
        await user.save();
        res.json({ success: true, points: user.points, newLevel: user.miningLevel, newReward: 1000 + ((user.miningLevel - 1) * 500) });
    } else {
        res.json({ success: false, message: `Yetersiz Bakiye! Gerekli: ${upgradeCost.toLocaleString()} GEP` });
    }
});

app.post('/api/tasks/complete', async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = await Task.findOne({ taskId });
    if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false });
    addPoints(user, task.reward);
    user.completedTasks.push(taskId);
    await user.save();
    res.json({ success: true, points: user.points });
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });

// GÜNCELLENDİ: Hem genel hem günlük liderlik tablosunu yollar
app.get('/api/leaderboard', async (req, res) => { 
    // Genel Top 100
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    
    // Günlük Top 100 (Sadece bugün puan kazanmış olanlar)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daily = await User.find({ lastPointDate: { $gte: today } }).sort({ dailyPoints: -1 }).limit(100);

    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: daily }); 
});

// --- ADMIN API ---
app.post('/api/admin/stats', async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    const settings = await Settings.findOne() || { announcements: [] };
    res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() });
});

app.post('/api/admin/add-task', async (req, res) => {
    await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target });
    res.json({ success: true });
});

app.post('/api/admin/delete-task', async (req, res) => {
    await Task.deleteOne({ taskId: req.body.taskId });
    res.json({ success: true });
});

app.post('/api/admin/announcement', async (req, res) => {
    const s = await Settings.findOne() || await Settings.create({});
    if(req.body.action === 'add') s.announcements.push(req.body.text);
    else s.announcements.splice(req.body.index, 1);
    await s.save();
    res.json({ success: true });
});

app.post('/api/admin/user-manage', async (req, res) => {
    const { targetId, action, amount } = req.body;
    const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] });
    if (!user) return res.json({ success: false });
    if (action === 'add') addPoints(user, Number(amount));
    if (action === 'set') user.points = Number(amount);
    if (action === 'ban') user.isBanned = true;
    if (action === 'unban') user.isBanned = false;
    await user.save();
    res.json({ success: true });
});

bot.onText(/\/start(?:\s+(.*))?/, (msg, match) => {
    const refId = match[1] ? match[1].trim() : '';
    const appUrl = refId ? `${WEBHOOK_URL}?tgWebAppStartParam=${refId}` : WEBHOOK_URL;
    
    bot.sendMessage(msg.chat.id, "🌟 **Gelir Evreni'ne Hoş Geldin!**\n\nHemen maden kazmaya ve görevleri tamamlamaya başla.", {
        parse_mode: 'Markdown',
        reply_markup: { 
            inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: appUrl } }]] 
        } 
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} üzerinde aktif.`));
