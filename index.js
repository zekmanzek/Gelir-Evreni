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
    miningLevel: { type: Number, default: 1 },
    adTickets: { type: Number, default: 0 }
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
    rank: Number, username: String, firstName: String, points: Number, date: { type: Date, default: Date.now }
}));

function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) { user.dailyPoints = 0; }
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

        const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);

        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            const archiveData = winners.map((u, i) => ({ rank: i + 1, username: u.username, firstName: u.firstName, points: u.dailyPoints, date: new Date() }));
            await YesterdayWinner.insertMany(archiveData);
            await User.updateMany({}, { $set: { dailyPoints: 0 } });
        } else {
            await YesterdayWinner.create({ rank: 0, username: 'sistem', firstName: 'sistem', points: 0, date: new Date() });
        }
    } catch (err) { console.error("Arşivleme Hatası:", err); }
}

setInterval(() => {
    const now = new Date();
    if (now.getHours() === 23 && now.getMinutes() === 58) archiveDailyLeaderboard();
}, 60000);

// ==========================================
// 🛡️ KRİPTOGRAFİK GÜVENLİK SİSTEMİ 
// ==========================================
function verifyTelegramWebAppData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); const authDate = initData.get('auth_date');
        if (!hash || !authDate) return false;

        const now = Math.floor(Date.now() / 1000);
        if (now - parseInt(authDate) > 86400) return false;

        initData.delete('hash');
        const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        return calculatedHash === hash;
    } catch (error) { return false; }
}

const secureRoute = (req, res, next) => {
    const initData = req.body.initData; const reqId = req.body.telegramId || req.body.adminId;
    if (!initData) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Kilidi Eksik!" });
    if (!verifyTelegramWebAppData(initData)) return res.status(403).json({ success: false, message: "⚠️ Geçersiz kimlik tespiti!" });
    try {
        const params = new URLSearchParams(initData); const userData = JSON.parse(params.get('user'));
        if (reqId && String(reqId) !== String(userData.id)) { return res.status(403).json({ success: false, message: "⚠️ Kimlik hırsızlığı engellendi!" }); }
        next();
    } catch (e) { return res.status(403).json({ success: false, message: "Veri okuma hatası!" }); }
};

// --- API ROTALARI ---

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { telegramId, username, firstName, referrerId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 0, dailyPoints: 0 });
            addPoints(user, 1000); 

            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { addPoints(referrer, 2500); referrer.referralCount += 1; await referrer.save(); addPoints(user, 1000); }
            }
        } else {
            if (username) user.username = username.toLowerCase();
            if (firstName) user.firstName = firstName;
        }
        await user.save();
        let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    
    const now = new Date(); const lastCheckin = new Date(user.lastCheckin); const diffHours = (now - lastCheckin) / (1000 * 60 * 60);

    if (diffHours < 24) return res.json({ success: false, message: "Ödülünüzü zaten aldınız, 24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;

    const reward = 100 * Math.pow(2, user.streak - 1);
    addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { telegramId, packageId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });

    let cost = 0; let tickets = 0;
    if (packageId === 1) { cost = 1000; tickets = 10; }
    else if (packageId === 2) { cost = 5000; tickets = 50; }
    else if (packageId === 3) { cost = 10000; tickets = 100; }
    else return res.json({ success: false, message: "Geçersiz paket." });

    if (user.points < cost) return res.json({ success: false, message: "Yetersiz GEP bakiye!" });

    user.points -= cost;
    user.adTickets += tickets;
    await user.save();

    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    if (!user) return res.json({ success: false });
    
    if (user.adTickets <= 0) return res.json({ success: false, message: "Hiç reklam biletiniz kalmadı! Önce mağazadan bilet paketi satın alın." });
    
    const settings = await Settings.findOne() || { adsgramReward: 500 };
    user.adTickets -= 1; 
    addPoints(user, settings.adsgramReward); 
    await user.save();
    
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500);
        addPoints(user, reward); user.lastMining = now; await user.save();
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
        user.points -= upgradeCost; user.miningLevel += 1; await user.save();
        res.json({ success: true, points: user.points, newLevel: user.miningLevel });
    } else {
        res.json({ success: false, message: `Yetersiz Bakiye! Gerekli: ${upgradeCost.toLocaleString()} GEP` });
    }
});

app.post('/api/tasks/complete', secureRoute, async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = await Task.findOne({ taskId });
    if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false });
    addPoints(user, task.reward); user.completedTasks.push(taskId); await user.save();
    res.json({ success: true, points: user.points });
});

// ==========================================
// 🕹️ ARCADE OYUNLARI API 
// ==========================================
app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    const cost = 500; 
    if (!user || user.points < cost) return res.json({ success: false, message: "Yetersiz GEP Bakiye!" });

    user.points -= cost; 
    
    const rand = Math.random() * 100;
    let prize = 0; let msg = "BOŞ";

    if (rand <= 40) { prize = 0; msg = "Şansını Tekrar Dene"; } 
    else if (rand <= 75) { prize = 250; msg = "Yarım Teselli"; } 
    else if (rand <= 92) { prize = 500; msg = "Amorti!"; } 
    else if (rand <= 99) { prize = 1000; msg = "İKİYE KATLADIN!"; } 
    else { prize = 5000; msg = "💥 JACKPOT! 💥"; } 

    if (prize > 0) addPoints(user, prize);
    await user.save();
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/predict', secureRoute, async (req, res) => {
    const { telegramId, guess } = req.body; 
    const user = await User.findOne({ telegramId });
    const cost = 1000; 
    if (!user || user.points < cost) return res.json({ success: false, message: "Yetersiz GEP Bakiye!" });

    try {
        const response1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data1 = await response1.json(); const price1 = parseFloat(data1.price);

        user.points -= cost; await user.save();
        await new Promise(resolve => setTimeout(resolve, 10000));

        const response2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
        const data2 = await response2.json(); const price2 = parseFloat(data2.price);

        let won = false; let reward = 0;
        if ((guess === 'UP' && price2 > price1) || (guess === 'DOWN' && price2 < price1)) {
            won = true; reward = 2000; addPoints(user, reward); await user.save();
        }
        res.json({ success: true, won, price1, price2, reward, points: user.points });
    } catch (e) {
        user.points += cost; await user.save();
        res.json({ success: false, message: "Piyasa verisi çekilemedi. Bakiye iade edildi." });
    }
});

// GÜNCELLENDİ: 3 SEVİYELİ KAPSÜL SİSTEMİ (TIER 1, 2, 3)
app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const { telegramId, boxType } = req.body;
    const user = await User.findOne({ telegramId });
    
    let cost = 0;
    if (boxType === 1) cost = 1000;
    else if (boxType === 2) cost = 5000;
    else if (boxType === 3) cost = 25000;
    else return res.json({ success: false, message: "Geçersiz Kapsül Türü." });

    if (!user || user.points < cost) return res.json({ success: false, message: "Yetersiz GEP Bakiye!" });

    user.points -= cost; 
    
    // İhtimal Motoru
    const rand = Math.random() * 100;
    let prize = 0; let msg = "BOŞ KAPSÜL";

    if (boxType === 1) { // 1.000 GEP'lik Kutu
        if (rand <= 40) { prize = 0; msg = "🗑️ Çöp Veri (0 GEP)"; }
        else if (rand <= 70) { prize = 500; msg = "⚙️ Kırık Çip (500 GEP)"; }
        else if (rand <= 90) { prize = 1500; msg = "🔋 Standart Veri (1.5K GEP)"; }
        else if (rand <= 99) { prize = 5000; msg = "💎 Nadir Kod (5K GEP)"; }
        else { prize = 10000; msg = "🔥 MEGA KAZANÇ (10K GEP) 🔥"; }
    } else if (boxType === 2) { // 5.000 GEP'lik Kutu
        if (rand <= 30) { prize = 0; msg = "🗑️ Çöp Veri (0 GEP)"; }
        else if (rand <= 65) { prize = 3000; msg = "🔋 Kaliteli Veri (3K GEP)"; }
        else if (rand <= 85) { prize = 7500; msg = "💎 Nadir Çip (7.5K GEP)"; }
        else if (rand <= 95) { prize = 20000; msg = "🔥 Destansı Çekirdek (20K GEP)"; }
        else { prize = 50000; msg = "👑 EFSANEVİ NODE (50K GEP) 👑"; }
    } else if (boxType === 3) { // 25.000 GEP'lik Kutu
        if (rand <= 20) { prize = 0; msg = "🗑️ Çöp Veri (0 GEP)"; }
        else if (rand <= 50) { prize = 15000; msg = "💎 Parazitli Node (15K GEP)"; }
        else if (rand <= 80) { prize = 40000; msg = "🔥 Saf Çekirdek (40K GEP)"; }
        else if (rand <= 95) { prize = 100000; msg = "👑 EFSANEVİ KOD (100K GEP) 👑"; }
        else { prize = 500000; msg = "🌌 UZAY BOŞLUĞU (500K GEP) 🌌"; }
    }

    if (prize > 0) addPoints(user, prize);
    await user.save();
    
    res.json({ success: true, prize, msg, points: user.points });
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });

app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daily = await User.find({ lastPointDate: { $gte: today } }).sort({ dailyPoints: -1 }).limit(100);
    const yesterday = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 });
    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: daily, yesterdayLeaderboard: yesterday }); 
});

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
    bot.sendMessage(msg.chat.id, "🌟 **Gelir Evreni'ne Hoş Geldin!**", {
        parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: appUrl } }]] } 
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu ${PORT} üzerinde aktif.`));
