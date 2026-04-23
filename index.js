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
    dailyPoints: { type: Number, default: 0 }, 
    lastPointDate: { type: Date, default: Date.now }, 
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

const YesterdayWinner = mongoose.model('YesterdayWinner', new mongoose.Schema({
    rank: Number,
    username: String,
    firstName: String,
    points: Number,
    date: { type: Date, default: Date.now }
}));

function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) {
        user.dailyPoints = 0;
    }
    user.points += amount;
    user.dailyPoints += amount;
    user.lastPointDate = now;
}

async function archiveDailyLeaderboard() {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const existing = await YesterdayWinner.findOne({ date: { $gte: today } });
        if (existing) return;

        const winners = await User.find({ dailyPoints: { $gt: 0 } })
            .sort({ dailyPoints: -1 })
            .limit(100);

        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            
            const archiveData = winners.map((u, i) => ({
                rank: i + 1,
                username: u.username,
                firstName: u.firstName,
                points: u.dailyPoints,
                date: new Date()
            }));
            await YesterdayWinner.insertMany(archiveData);
            
            await User.updateMany({}, { $set: { dailyPoints: 0 } });
            console.log("✅ Günlük sıralama arşive eklendi ve sıfırlandı.");
        } else {
            await YesterdayWinner.create({ rank: 0, username: 'sistem', firstName: 'sistem', points: 0, date: new Date() });
        }
    } catch (err) {
        console.error("Arşivleme Hatası:", err);
    }
}

setInterval(() => {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 58) {
        archiveDailyLeaderboard();
    }
}, 60000);


// ==========================================
// 🛡️ YENİ: KRİPTOGRAFİK GÜVENLİK SİSTEMİ 🛡️
// ==========================================

// 1. Telegram Kimlik Kartı Doğrulayıcı
function verifyTelegramWebAppData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash');
        const authDate = initData.get('auth_date');
        
        if (!hash || !authDate) return false;

        // İstek 24 saatten eskiyse reddet (Hackerların eski veriyi kopyalamasını engeller)
        const now = Math.floor(Date.now() / 1000);
        if (now - parseInt(authDate) > 86400) return false;

        initData.delete('hash');
        const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        
        return calculatedHash === hash;
    } catch (error) {
        return false;
    }
}

// 2. Güvenlik Duvarı (Middleware)
const secureRoute = (req, res, next) => {
    const initData = req.body.initData; 
    const reqId = req.body.telegramId || req.body.adminId;

    if (!initData) {
        return res.status(403).json({ success: false, message: "⚠️ Güvenlik Kilidi Eksik! Uygulamayı kapatıp tekrar açın." });
    }

    if (!verifyTelegramWebAppData(initData)) {
        return res.status(403).json({ success: false, message: "⚠️ Geçersiz veya sahte kimlik tespiti!" });
    }

    try {
        const params = new URLSearchParams(initData);
        const userData = JSON.parse(params.get('user'));
        
        // Dışarıdan biri senin veya başkasının ID'sini yazıp istek atmaya çalışırsa engelle!
        if (reqId && String(reqId) !== String(userData.id)) {
            return res.status(403).json({ success: false, message: "⚠️ Kimlik hırsızlığı engellendi!" });
        }
        
        next();
    } catch (e) {
        return res.status(403).json({ success: false, message: "Veri okuma hatası!" });
    }
};
// ==========================================


// --- API ROTALARI (GÜVENLİK DUVARI EKLENDİ) ---

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { telegramId, username, firstName, referrerId } = req.body;
    
    try {
        let user = await User.findOne({ telegramId });
        
        if (!user) {
            user = new User({ 
                telegramId, 
                username: (username || '').toLowerCase(), 
                firstName,
                points: 0, 
                dailyPoints: 0
            });
            addPoints(user, 1000); 

            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) {
                    addPoints(referrer, 2500); 
                    referrer.referralCount += 1;
                    await referrer.save();
                    addPoints(user, 1000); 
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

app.post('/api/daily-reward', secureRoute, async (req, res) => {
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

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    const settings = await Settings.findOne() || { adsgramReward: 500 };
    addPoints(user, settings.adsgramReward);
    await user.save();
    res.json({ success: true, points: user.points });
});

app.post('/api/mine', secureRoute, async (req, res) => {
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

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });

    const upgradeCost = user.miningLevel * 10000;

    if (user.points >= upgradeCost) {
        user.points -= upgradeCost; 
        user.miningLevel += 1;
        await user.save();
        res.json({ success: true, points: user.points, newLevel: user.miningLevel, newReward: 1000 + ((user.miningLevel - 1) * 500) });
    } else {
        res.json({ success: false, message: `Yetersiz Bakiye! Gerekli: ${upgradeCost.toLocaleString()} GEP` });
    }
});

app.post('/api/tasks/complete', secureRoute, async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = await Task.findOne({ taskId });
    if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false });
    addPoints(user, task.reward);
    user.completedTasks.push(taskId);
    await user.save();
    res.json({ success: true, points: user.points });
});

// GET rotalarına güvenlik kilidi gerekmez, çünkü buralar sadece "okuma" (liste çekme) işlemleridir. Veri manipüle edilemez.
app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });

app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daily = await User.find({ lastPointDate: { $gte: today } }).sort({ dailyPoints: -1 }).limit(100);

    const yesterday = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 });

    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: daily, yesterdayLeaderboard: yesterday }); 
});

// --- ADMIN API (GÜVENLİK DUVARI EKLENDİ) ---
app.post('/api/admin/stats', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    const settings = await Settings.findOne() || { announcements: [] };
    res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() });
});

app.post('/api/admin/add-task', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target });
    res.json({ success: true });
});

app.post('/api/admin/delete-task', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    await Task.deleteOne({ taskId: req.body.taskId });
    res.json({ success: true });
});

app.post('/api/admin/announcement', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
    const s = await Settings.findOne() || await Settings.create({});
    if(req.body.action === 'add') s.announcements.push(req.body.text);
    else s.announcements.splice(req.body.index, 1);
    await s.save();
    res.json({ success: true });
});

app.post('/api/admin/user-manage', secureRoute, async (req, res) => {
    if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz");
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
