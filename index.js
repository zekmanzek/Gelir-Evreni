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
    .then(() => console.log("✅ Gelir Evreni v6.6 - Grup Etkileşim Yaması Aktif"))
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
    adTickets: { type: Number, default: 0 },
    lastLootbox1: { type: Date, default: new Date(0) },
    lastLootbox2: { type: Date, default: new Date(0) },
    lastLootbox3: { type: Date, default: new Date(0) }
}));

const PromoCode = mongoose.model('PromoCode', new mongoose.Schema({
    code: { type: String, unique: true }, reward: Number, maxUsage: Number, usedBy: { type: [String], default: [] }, isActive: { type: Boolean, default: true }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: { type: String, unique: true }, title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const YesterdayWinner = mongoose.model('YesterdayWinner', new mongoose.Schema({
    rank: Number, username: String, firstName: String, points: Number, date: { type: Date, default: Date.now }
}));

const Settings = mongoose.model('Settings', new mongoose.Schema({
    announcements: [String],
    miningMultiplier: { type: Number, default: 1 },
    adsgramReward: { type: Number, default: 5000 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' },
    mainGroupId: { type: String, default: "" }
}));

const AirdropLink = mongoose.model('AirdropLink', new mongoose.Schema({
    telegramId: { type: String, unique: true }, 
    username: String,
    title: String,
    description: String,
    url: String,
    joinedUsers: { type: [String], default: [] },
    updatedAt: { type: Date, default: Date.now } 
}));

function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) { user.dailyPoints = 0; }
    user.points += amount; user.dailyPoints += amount; user.lastPointDate = now;
}

// --- GRUP ETKİLEŞİM DEĞİŞKENLERİ ---
const chatCooldowns = new Map(); // Mesaj madenciliği için
let activeDrop = null; // Aktif drop etkinliği için

const morningMsgs = ["☀️ Günaydın Siber Ağ! Madenleri toplamayı unutmayın.", "🌅 Günaydın! Yeni bir gün, yeni GEP'ler...", "☕ Günaydın Gelir Evreni ailesi!"];
const nightMsgs = ["🌙 İyi geceler millet! Bırakın sistem uyurken de sizin için çalışsın.", "🌌 Herkese iyi geceler. Yarın daha çok kazanacağız..."];
const randomMsgs = ["🚀 Piyasalar bugün hareketli. Sence BTC ne olacak?", "💎 Unutmayın, panik yapan kaybeder, sabreden GEP kazanır.", "🎁 Buralarda bir yerlerde yakında yeni bir Promo Kod düşebilir..."];

setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        
        // Klasik Grup Mesajları
        if (utcHour === 6 && utcMin === 0) { bot.sendMessage(s.mainGroupId, morningMsgs[Math.floor(Math.random() * morningMsgs.length)]); }
        else if (utcHour === 20 && utcMin === 30) { bot.sendMessage(s.mainGroupId, nightMsgs[Math.floor(Math.random() * nightMsgs.length)]); }
        
        // RASTGELE DROP SİSTEMİ (Her saat başı %10 ihtimalle)
        if (utcMin === 0 && Math.random() < 0.10) {
            activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nAğda sahipsiz bir veri paketi bulundu. Aşağıdaki butona ilk tıklayan **25.000 GEP** kazanır!", {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] }
            });
        }
    } catch (e) { console.error("Interval Hatası:", e); }
}, 60000);

// Liderlik Arşivi (23:58)
async function archiveDailyLeaderboard() {
    try {
        const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const existing = await YesterdayWinner.findOne({ date: { $gte: today } }); if (existing) return;
        const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);
        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            const archiveData = winners.map((u, i) => ({ rank: i + 1, username: u.username, firstName: u.firstName, points: u.dailyPoints, date: new Date() }));
            await YesterdayWinner.insertMany(archiveData); await User.updateMany({}, { $set: { dailyPoints: 0 } });
        }
    } catch (err) { }
}
setInterval(() => { const now = new Date(); if (now.getHours() === 23 && now.getMinutes() === 58) archiveDailyLeaderboard(); }, 60000);

// InitData Doğrulama
function getTelegramUserFromInitData(telegramInitData) {
    try {
        if (!telegramInitData) return null;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); const authDate = initData.get('auth_date');
        if (!hash || !authDate) return null;
        const now = Math.floor(Date.now() / 1000); if (now - parseInt(authDate) > 86400) return null;
        initData.delete('hash'); const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        if (calculatedHash !== hash) return null;
        return JSON.parse(initData.get('user')).id.toString(); 
    } catch (error) { return null; }
}

const secureRoute = (req, res, next) => {
    const initData = req.body.initData;
    const realId = getTelegramUserFromInitData(initData);
    if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    req.realTelegramId = realId; 
    next();
};

// API ROTALARI
app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    const telegramId = req.realTelegramId;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { addPoints(referrer, 10000); referrer.referralCount += 1; await referrer.save(); addPoints(user, 10000); }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    const reward = 100 * Math.pow(2, user.streak - 1); addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { packageId } = req.body; let cost = pid === 1 ? 10000 : (pid === 2 ? 50000 : 100000); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost, adTickets: (packageId === 1 ? 10 : (packageId === 2 ? 50 : 100)) } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, adTickets: { $gt: 0 } }, { $inc: { adTickets: -1 } }, { new: true });
    if (!user) return res.json({ success: false });
    addPoints(user, 5000); await user.save();
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); user.lastMining = now; await user.save(); return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: upgradeCost } }, { $inc: { points: -upgradeCost, miningLevel: 1 } }, { new: true });
    if (updatedUser) { res.json({ success: true, points: updatedUser.points, newLevel: updatedUser.miningLevel }); } else { res.json({ success: false }); }
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { code } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz!" });
    if (promo.usedBy.includes(req.realTelegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    promo.usedBy.push(req.realTelegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const cost = 500; const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false }); 
    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (rand <= 40) prize = 0; else if (rand <= 75) prize = 250; else if (rand <= 92) prize = 500; else if (rand <= 99) prize = 1000; else prize = 5000;
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/predict', secureRoute, async (req, res) => {
    const { guess } = req.body; const cost = 1000; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false });
    try {
        const r1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); const d1 = await r1.json(); const p1 = parseFloat(d1.price);
        await new Promise(r => setTimeout(r, 10000));
        const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); const d2 = await r2.json(); const p2 = parseFloat(d2.price);
        let won = false; if ((guess === 'UP' && p2 > p1) || (guess === 'DOWN' && p2 < p1)) won = true;
        if (won) { addPoints(user, 2000); await user.save(); }
        res.json({ success: true, won, price1: p1, price2: p2, points: user.points });
    } catch (e) { await User.updateOne({ telegramId: req.realTelegramId }, { $inc: { points: cost } }); res.json({ success: false }); }
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const { boxType } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); let lastOpenDate;
    if (boxType === 1) lastOpenDate = user.lastLootbox1; else if (boxType === 2) lastOpenDate = user.lastLootbox2; else if (boxType === 3) lastOpenDate = user.lastLootbox3;
    if ((now - new Date(lastOpenDate || 0)) < 24 * 60 * 60 * 1000) return res.json({ success: false });
    let cost = boxType === 1 ? 1000 : (boxType === 2 ? 5000 : 25000);
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!updatedUser) return res.json({ success: false });
    if (boxType === 1) updatedUser.lastLootbox1 = now; else if (boxType === 2) updatedUser.lastLootbox2 = now; else updatedUser.lastLootbox3 = now;
    let prize = 0; const rand = Math.random() * 100;
    if (boxType === 1) prize = rand > 90 ? 10000 : 500; else if (boxType === 2) prize = rand > 90 ? 50000 : 3000; else prize = rand > 95 ? 250000 : 15000;
    addPoints(updatedUser, prize); await updatedUser.save();
    res.json({ success: true, prize, points: updatedUser.points });
});

app.post('/api/airdrop/list', secureRoute, async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links: links.map(l => ({ _id: l._id, username: l.username, title: l.title, description: l.description, url: l.url, hasJoined: l.joinedUsers.includes(req.realTelegramId), isOwner: l.telegramId === req.realTelegramId })) });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const { title, description, url } = req.body;
    const cost = 1000000; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if(!user) return res.json({success: false});
    let existing = await AirdropLink.findOne({ telegramId: req.realTelegramId });
    if (existing) { existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date(); await existing.save(); } 
    else { await AirdropLink.create({ telegramId: req.realTelegramId, username: user.username || user.firstName, title, description, url }); }
    res.json({success: true, points: user.points, message: "Pano güncellendi!"});
});

app.post('/api/airdrop/join', secureRoute, async (req, res) => {
    const { projectId } = req.body;
    try {
        const project = await AirdropLink.findById(projectId);
        if (!project || project.joinedUsers.includes(req.realTelegramId) || project.telegramId === req.realTelegramId) return res.json({ success: false });
        project.joinedUsers.push(req.realTelegramId); await project.save();
        const user = await User.findOne({ telegramId: req.realTelegramId });
        addPoints(user, 10000); await user.save();
        res.json({ success: true, points: user.points });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });
app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); const today = new Date(); today.setHours(0, 0, 0, 0); const daily = await User.find({ lastPointDate: { $gte: today } }).sort({ dailyPoints: -1 }).limit(100); const yesterday = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 }); res.json({ success: true, leaderboard: allTime, dailyLeaderboard: daily, yesterdayLeaderboard: yesterday }); 
});
app.post('/api/tasks/complete', secureRoute, async (req, res) => { 
    const { taskId } = req.body; const task = await Task.findOne({ taskId }); const user = await User.findOne({ telegramId: req.realTelegramId }); 
    if (!user || !task || user.completedTasks.includes(taskId)) return res.json({ success: false }); 
    addPoints(user, task.reward); user.completedTasks.push(taskId); await user.save(); res.json({ success: true, points: user.points }); 
});

// ADMİN ROTALARI
const adminCheck = (req, res, next) => { if (req.realTelegramId !== ADMIN_ID) return res.status(403).send("Yetkisiz"); next(); };
app.post('/api/admin/stats', secureRoute, adminCheck, async (req, res) => { const settings = await Settings.findOne() || { announcements: [] }; res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() }); });
app.post('/api/admin/add-task', secureRoute, adminCheck, async (req, res) => { await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target }); res.json({ success: true }); });
app.post('/api/admin/delete-task', secureRoute, adminCheck, async (req, res) => { await Task.deleteOne({ taskId: req.body.taskId }); res.json({ success: true }); });
app.post('/api/admin/create-promo', secureRoute, adminCheck, async (req, res) => { const { code, reward, maxUsage } = req.body; try { await PromoCode.create({ code: code.toUpperCase(), reward, maxUsage }); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/announcement', secureRoute, adminCheck, async (req, res) => { const s = await Settings.findOne() || await Settings.create({}); if(req.body.action === 'add') s.announcements.push(req.body.text); else s.announcements.splice(req.body.index, 1); await s.save(); res.json({ success: true }); });
app.post('/api/admin/user-manage', secureRoute, adminCheck, async (req, res) => { const { targetId, action, amount } = req.body; const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] }); if (!user) return res.json({ success: false }); if (action === 'add') addPoints(user, Number(amount)); if (action === 'set') user.points = Number(amount); if (action === 'ban') user.isBanned = true; if (action === 'unban') user.isBanned = false; await user.save(); res.json({ success: true }); });
app.post('/api/admin/delete-airdrop', secureRoute, adminCheck, async (req, res) => { await AirdropLink.findByIdAndDelete(req.body.id); res.json({ success: true }); });

// ==========================================
// 💬 TELEGRAM GRUP İÇİ ETKİLEŞİM MANTIĞI
// ==========================================

// 1. Karşılama Sistemi
bot.on('new_chat_members', async (msg) => {
    const s = await Settings.findOne();
    if (!s || msg.chat.id.toString() !== s.mainGroupId) return;
    
    msg.new_chat_members.forEach(newUser => {
        const name = newUser.first_name;
        bot.sendMessage(msg.chat.id, `🌟 **Siber Ağ'a Hoş Geldin ${name}!**\n\nGelir Evreni'nde yerin hazır. Hemen uygulamayı aç ve **Madenini** çalıştırarak kazanmaya başla!`, {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: WEBHOOK_URL } }]] }
        });
    });
});

// 2. Drop Yakalama Butonu (Callback)
bot.on('callback_query', async (query) => {
    if (query.data === 'claim_drop') {
        if (!activeDrop || activeDrop.claimed) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ Bu drop çoktan kapıldı!", show_alert: true });
        }
        
        const userId = query.from.id.toString();
        const user = await User.findOne({ telegramId: userId });
        
        if (!user) {
            return bot.answerCallbackQuery(query.id, { text: "⚠️ Önce botu başlatmalısın!", show_alert: true });
        }
        
        activeDrop.claimed = true;
        addPoints(user, activeDrop.reward);
        await user.save();
        
        bot.editMessageText(`🎉 **DROP KAPILDI!**\n\nVeri paketini hızlı davranan @${query.from.username || query.from.first_name} yakaladı ve **25.000 GEP** kazandı!`, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
        
        bot.answerCallbackQuery(query.id, { text: "Tebrikler! 25.000 GEP hesabına eklendi." });
        activeDrop = null;
    }
});

// 3. Mesaj Madenciliği & Akıllı Cevaplar
bot.on('message', async (msg) => {
    if (!msg.text || msg.chat.type === 'private') return;
    
    const s = await Settings.findOne();
    if (!s || msg.chat.id.toString() !== s.mainGroupId) return;
    
    const userId = msg.from.id.toString();
    const text = msg.text.toLowerCase();

    // A) Mesaj Madenciliği
    const now = Date.now();
    if (!chatCooldowns.has(userId) || (now - chatCooldowns.get(userId)) > 60000) {
        const user = await User.findOne({ telegramId: userId });
        if (user) {
            const reward = Math.floor(Math.random() * 9) + 2; // 2-10 GEP
            addPoints(user, reward);
            await user.save();
            chatCooldowns.set(userId, now);
        }
    }

    // B) Akıllı Cevaplar
    if (text.includes("günaydın") || text.includes("gunaydin")) {
        bot.sendMessage(msg.chat.id, "☀️ Günaydın! Siber madenler seni bekliyor.");
    } else if (text.includes("nasil kazanilir") || text.includes("nasıl kazanılır") || text.includes("gep nedir")) {
        bot.sendMessage(msg.chat.id, "💎 GEP kazanmak için uygulamadaki **Maden**'i çalıştırabilir, **Görevleri** yapabilir veya grupta aktif olabilirsin!");
    } else if (text.includes("bot bozuk") || text.includes("calismiyor") || text.includes("çalışmıyor")) {
        bot.sendMessage(msg.chat.id, "⚡ Sistemler %100 kapasiteyle çalışıyor. Lütfen internet bağlantınızı kontrol edin.");
    }
});

// Klasik Komutlar
bot.onText(/\/start(?:\s+(.*))?/, (msg, match) => {
    if (msg.chat.type !== 'private') return;
    const refId = match[1] ? match[1].trim() : ''; const appUrl = refId ? `${WEBHOOK_URL}?tgWebAppStartParam=${refId}` : WEBHOOK_URL;
    bot.sendMessage(msg.chat.id, "🌟 **Gelir Evreni'ne Hoş Geldin!**", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: appUrl } }]] } });
});

bot.onText(/\/grububagla/, async (msg) => { if (String(msg.from.id) !== String(ADMIN_ID)) return; if (msg.chat.type === 'private') return; const s = await Settings.findOne() || await Settings.create({}); s.mainGroupId = msg.chat.id.toString(); await s.save(); bot.sendMessage(msg.chat.id, "✅ **Sistem Entegre Edildi!**", { parse_mode: 'Markdown' }); });
bot.onText(/\/yardim/, (msg) => { bot.sendMessage(msg.chat.id, `🎮 **Grup Komutları**\n\n👤 \`/profil\`\n💸 \`/bahsis <miktar>\`\n🎲 \`/zar <miktar>\`\n🏆 \`/liderler\`\n⛏️ \`/maden\`\n⚔️ \`/duello <miktar>\``, { parse_mode: 'Markdown' }); });
bot.onText(/\/profil/, async (msg) => { const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user) return; bot.sendMessage(msg.chat.id, `👤 **${msg.from.first_name}**\n💰 Bakiye: **${Math.floor(user.points).toLocaleString()} GEP**`, { parse_mode: 'Markdown' }); });
bot.onText(/\/zar (\d+)/, async (msg, match) => { const amount = parseInt(match[1]); const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user || user.points < amount || amount < 100) return; user.points -= amount; await user.save(); const diceMsg = await bot.sendDice(msg.chat.id); setTimeout(async () => { if (diceMsg.dice.value >= 4) { const win = amount * 2; addPoints(user, win); await user.save(); bot.sendMessage(msg.chat.id, `🎉 **KAZANDIN!** +${win} GEP!`, { reply_to_message_id: diceMsg.message_id }); } else { bot.sendMessage(msg.chat.id, `💀 **KAYBETTİN...**`, { reply_to_message_id: diceMsg.message_id }); } }, 4000); });
bot.onText(/\/liderler/, async (msg) => { const topUsers = await User.find().sort({ points: -1 }).limit(5); let text = "🏆 **EN ZENGİN 5 OYUNCU**\n\n"; topUsers.forEach((u, i) => { text += `${i+1}. ${u.firstName} - **${Math.floor(u.points).toLocaleString()} GEP**\n`; }); bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }); });
bot.onText(/\/maden/, async (msg) => { const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user) return; const diff = new Date().getTime() - new Date(user.lastMining).getTime(); const cooldown = 4 * 60 * 60 * 1000; if (diff >= cooldown) { bot.sendMessage(msg.chat.id, "⛏️ **Madenin Hazır!**\nUygulamaya gir ve ödülünü topla. 🔥"); } else { const remaining = Math.ceil((cooldown - diff) / (60 * 1000)); bot.sendMessage(msg.chat.id, `⛏️ Maden üretimde...\n⏳ **${remaining} dakika** sonra hazır.`); } });

const activeDuels = new Map(); 
bot.onText(/\/duello (\d+)/, async (msg, match) => { 
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, "Meydan okumak istediğin kişinin mesajını yanıtlayarak /duello <miktar> yazmalısın.");
    const amount = parseInt(match[1]); 
    const challenger = await User.findOne({ telegramId: msg.from.id.toString() }); 
    const opponent = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() }); 
    if (!challenger || !opponent) return;
    if (challenger.points < amount) return bot.sendMessage(msg.chat.id, "Bakiyen bu düello için yetersiz.");
    if (opponent.points < amount) return bot.sendMessage(msg.chat.id, "Karşı tarafın bakiyesi bu düello için yetersiz.");
    if (challenger.telegramId === opponent.telegramId) return bot.sendMessage(msg.chat.id, "Kendinle düello yapamazsın!");
    activeDuels.set(opponent.telegramId, { challengerId: challenger.telegramId, amount: amount, chatId: msg.chat.id });
    bot.sendMessage(msg.chat.id, `⚔️ **DÜELLO DAVETİ!**\n\n@${msg.from.username}, @${msg.reply_to_message.from.username} kullanıcısına **${amount} GEP** değerinde meydan okudu!\n\nKabul etmek için bu mesajı yanıtlayıp \`/kabul\` yazın!`); 
});
bot.onText(/\/kabul/, async (msg) => { 
    if (!msg.reply_to_message || !msg.reply_to_message.text.includes("DÜELLO DAVETİ!")) return; 
    const opponentId = msg.from.id.toString(); const duelData = activeDuels.get(opponentId);
    if (!duelData) return bot.sendMessage(msg.chat.id, "Geçerli bir düello davetin yok veya süresi geçmiş.");
    activeDuels.delete(opponentId); 
    const challenger = await User.findOne({ telegramId: duelData.challengerId }); const opponent = await User.findOne({ telegramId: opponentId });
    if (!challenger || !opponent || challenger.points < duelData.amount || opponent.points < duelData.amount) { return bot.sendMessage(msg.chat.id, "Taraflardan birinin bakiyesi yetersiz olduğu için düello iptal edildi."); }
    bot.sendMessage(msg.chat.id, "⚔️ Kılıçlar çekildi! Sistem bir kazanan belirliyor..."); 
    setTimeout(async () => { 
        const isChallengerWin = Math.random() > 0.5; let winner, loser;
        if (isChallengerWin) { winner = challenger; loser = opponent; } else { winner = opponent; loser = challenger; }
        winner.points += duelData.amount; loser.points -= duelData.amount;
        await winner.save(); await loser.save();
        bot.sendMessage(msg.chat.id, `🎉 **DÜELLO BİTTİ!**\n\nKazanan: **${winner.firstName}** (+${duelData.amount} GEP)\nKaybeden: **${loser.firstName}** (-${duelData.amount} GEP)`); 
    }, 3000); 
});

bot.onText(/\/bahsis (\d+)/, async (msg, match) => { if (!msg.reply_to_message) return; const amount = parseInt(match[1]); const sender = await User.findOne({ telegramId: msg.from.id.toString() }); const receiver = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() }); if (sender && receiver && sender.points >= amount && sender.telegramId !== receiver.telegramId) { sender.points -= amount; addPoints(receiver, amount); await sender.save(); await receiver.save(); bot.sendMessage(msg.chat.id, `💸 **Transfer Başarılı!**\n${sender.firstName} ➔ ${receiver.firstName}: **${amount} GEP**`); } });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
