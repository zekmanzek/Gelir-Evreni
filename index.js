const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

// --- AYARLAR ---
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const token = process.env.BOT_TOKEN;
const mongoURI = process.env.MONGODB_URI;
const ADMIN_ID = "1469411131"; 

const bot = new TelegramBot(token, { polling: true });

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v2 Connected"));

// --- GÜNCELLENMİŞ KULLANICI MODELİ ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' } // Yeni: Seviye Sistemi
});
const User = mongoose.model('User', UserSchema);

// --- DİNAMİK GÖREVLER (Admin tarafından eklenebilir hale getirildi) ---
let TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' }
];

// --- SEVİYE HESAPLAMA MANTIĞI ---
const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

// --- API ENDPOINTLERİ ---

// Giriş ve Seviye Kontrolü
app.post('/api/user/auth', async (req, res) => {
    const { telegramId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı." });
        
        // Seviyeyi güncelle
        user.level = calculateLevel(user.points);
        await user.save();

        const botInfo = await bot.getMe();
        res.json({ success: true, user, botUsername: botInfo.username, isAdmin: telegramId === ADMIN_ID });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Liderlik Tablosu (En zengin 10 kişi)
app.get('/api/leaderboard', async (req, res) => {
    try {
        const topUsers = await User.find().sort({ points: -1 }).limit(10).select('telegramId points level');
        res.json({ success: true, leaderboard: topUsers });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin: Yeni Görev Ekle
app.post('/api/admin/add-task', (req, res) => {
    const { adminId, task } = req.body;
    if (adminId !== ADMIN_ID) return res.status(403).send("Yetkisiz");
    TASKS.push(task);
    res.json({ success: true, tasks: TASKS });
});

app.get('/api/tasks', (req, res) => res.json({ tasks: TASKS }));

// Madencilik (Seviyeye göre bonus ekledim!)
app.post('/api/mine', async (req, res) => {
    const { telegramId } = req.body;
    try {
        const user = await User.findOne({ telegramId });
        const now = new Date();
        const cooldown = 8 * 60 * 60 * 1000;
        if (user && (now - new Date(user.lastMining)) > cooldown) {
            let baseReward = 500;
            // Seviye Bonusu
            if (user.level === 'Gümüş') baseReward += 100;
            if (user.level === 'Altın') baseReward += 250;
            if (user.level === 'Platin') baseReward += 500;
            if (user.level === 'Elmas') baseReward += 1000;

            user.points += baseReward;
            user.lastMining = now;
            await user.save();
            return res.json({ success: true, points: user.points, reward: baseReward });
        }
        res.json({ success: false, message: "Maden henüz hazır değil." });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// Diğer endpointler (Spin, Check-in, Withdraw) aynı şekilde korunmalı...
// (Kodun geri kalanı v1 ile aynı mantıkta devam eder)

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(process.env.PORT || 10000);
