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
    .then(() => console.log("✅ Gelir Evreni v5.2 - Günlük Kapsül Sistemi Aktif"))
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
    lastLootboxOpen: { type: Date, default: new Date(0) } // YENİ: Son Kutu Açma Tarihi
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
    adsgramReward: { type: Number, default: 500 }, 
    botUsername: { type: String, default: 'gelirevreni_bot' },
    mainGroupId: { type: String, default: "" }
}));

function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) { user.dailyPoints = 0; }
    user.points += amount; user.dailyPoints += amount; user.lastPointDate = now;
}

// Otonom Mesajlar
const morningMsgs = ["☀️ Günaydın Siber Ağ! Madenleri toplamayı unutmayın.", "🌅 Günaydın! Yeni bir gün, yeni GEP'ler...", "☕ Günaydın Gelir Evreni ailesi!", "🌞 Herkese günaydın. Bugün BTC yönü sizce ne olur?"];
const nightMsgs = ["🌙 İyi geceler millet! Bırakın sistem uyurken de sizin için çalışsın.", "🌌 Herkese iyi geceler. Yarın daha çok kazanacağız...", "💤 Gece mesaisi bitenlere iyi uykular!", "🦉 İyi geceler Siber Kurtlar!"];
const randomMsgs = ["🚀 Piyasalar bugün hareketli. Sence BTC ne olacak?", "💎 Unutmayın, panik yapan kaybeder, sabreden GEP kazanır.", "🎁 Buralarda bir yerlerde yakında yeni bir Promo Kod düşebilir...", "⚔️ Cesareti olan yok mu? Düello atacak cengaver aranıyor!"];

setInterval(async () => {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        if (utcHour === 6 && utcMin === 0) { bot.sendMessage(s.mainGroupId, morningMsgs[Math.floor(Math.random() * morningMsgs.length)]); }
        else if (utcHour === 20 && utcMin === 30) { bot.sendMessage(s.mainGroupId, nightMsgs[Math.floor(Math.random() * nightMsgs.length)]); }
        else if (utcHour === 12 && utcMin === 0) { if (Math.random() > 0.3) bot.sendMessage(s.mainGroupId, randomMsgs[Math.floor(Math.random() * randomMsgs.length)]); }
    } catch (e) { }
}, 60000);

// --- API ROTALARI ---
app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { telegramId, username, firstName, referrerId } = req.body;
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { addPoints(referrer, 2500); referrer.referralCount += 1; await referrer.save(); addPoints(user, 1000); }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); let settings = await Settings.findOne() || await Settings.create({});
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    const reward = 100 * Math.pow(2, user.streak - 1); addPoints(user, reward); user.lastCheckin = now; await user.save();
    res.json({ success: true, points: user.points, streak: user.streak, reward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { telegramId, packageId } = req.body; const user = await User.findOne({ telegramId }); if (!user) return res.json({ success: false });
    let cost = 0; let tickets = 0;
    if (packageId === 1) { cost = 1000; tickets = 10; } else if (packageId === 2) { cost = 5000; tickets = 50; } else if (packageId === 3) { cost = 10000; tickets = 100; } else return res.json({ success: false });
    if (user.points < cost) return res.json({ success: false, message: "Yetersiz GEP bakiye!" });
    user.points -= cost; user.adTickets += tickets; await user.save(); res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); if (!user) return res.json({ success: false });
    if (user.adTickets <= 0) return res.json({ success: false, message: "Hiç reklam biletiniz kalmadı!" });
    const settings = await Settings.findOne() || { adsgramReward: 500 };
    user.adTickets -= 1; addPoints(user, settings.adsgramReward); await user.save();
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const reward = 1000 + ((user.miningLevel - 1) * 500); addPoints(user, reward); user.lastMining = now; await user.save(); return res.json({ success: true, points: user.points, reward: reward });
    }
    res.json({ success: false, message: "Maden hazır değil." });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    if (user.points >= upgradeCost) { user.points -= upgradeCost; user.miningLevel += 1; await user.save(); res.json({ success: true, points: user.points, newLevel: user.miningLevel }); } 
    else { res.json({ success: false, message: "Yetersiz Bakiye!" }); }
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { telegramId, code } = req.body; const user = await User.findOne({ telegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz kod!" });
    if (promo.usedBy.includes(telegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    if (promo.usedBy.length >= promo.maxUsage) { promo.isActive = false; await promo.save(); return res.json({ success: false, message: "Sınır doldu!" }); }
    promo.usedBy.push(telegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const { telegramId } = req.body; const user = await User.findOne({ telegramId }); const cost = 500; 
    if (!user || user.points < cost) return res.json({ success: false, message: "Yetersiz GEP!" }); user.points -= cost; 
    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (rand <= 40) { prize = 0; msg = "Şansını Dene"; } else if (rand <= 75) { prize = 250; msg = "Yarım Teselli"; } else if (rand <= 92) { prize = 500; msg = "Amorti!"; } else if (rand <= 99) { prize = 1000; msg = "İKİYE KATLADIN!"; } else { prize = 5000; msg = "💥 JACKPOT! 💥"; } 
    if (prize > 0) addPoints(user, prize); await user.save(); res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/predict', secureRoute, async (req, res) => {
    const { telegramId, guess } = req.body; const user = await User.findOne({ telegramId }); const cost = 1000; 
    if (!user || user.points < cost) return res.json({ success: false, message: "Yetersiz GEP!" });
    try {
        const r1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); const d1 = await r1.json(); const p1 = parseFloat(d1.price);
        user.points -= cost; await user.save(); await new Promise(resolve => setTimeout(resolve, 10000));
        const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); const d2 = await r2.json(); const p2 = parseFloat(d2.price);
        let won = false; let reward = 0; if ((guess === 'UP' && p2 > p1) || (guess === 'DOWN' && p2 < p1)) { won = true; reward = 2000; addPoints(user, reward); await user.save(); }
        res.json({ success: true, won, price1: p1, price2: p2, reward, points: user.points });
    } catch (e) { user.points += cost; await user.save(); res.json({ success: false, message: "Hata. İade edildi." }); }
});

// GÜNCELLENDİ: GÜNLÜK 1 KUTU AÇMA SINIRI EKLENDİ
app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const { telegramId, boxType } = req.body; const user = await User.findOne({ telegramId }); 
    if (!user) return res.json({ success: false });

    // GÜNLÜK KONTROL (24 SAAT)
    const now = new Date();
    const diffHours = (now - new Date(user.lastLootboxOpen || 0)) / (1000 * 60 * 60);
    if (diffHours < 24) {
        const remaining = Math.ceil(24 - diffHours);
        return res.json({ success: false, message: `Bugün zaten bir kapsül açtın! Bir sonraki için ${remaining} saat bekle.` });
    }

    let cost = 0;
    if (boxType === 1) cost = 1000; else if (boxType === 2) cost = 5000; else if (boxType === 3) cost = 25000; else return res.json({ success: false });
    
    if (user.points < cost) return res.json({ success: false, message: "Yetersiz GEP!" });
    
    user.points -= cost; 
    user.lastLootboxOpen = now; // Saati güncelle

    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ KAPSÜL";
    if (boxType === 1) { 
        if (rand <= 40) { prize = 0; msg = "🗑️ Çöp Veri"; } else if (rand <= 70) { prize = 500; msg = "⚙️ Kırık Çip"; } else if (rand <= 90) { prize = 1500; msg = "🔋 Standart Veri"; } else if (rand <= 99) { prize = 5000; msg = "💎 Nadir Kod"; } else { prize = 10000; msg = "🔥 MEGA KAZANÇ 🔥"; } 
    } 
    else if (boxType === 2) { 
        if (rand <= 30) { prize = 0; msg = "🗑️ Çöp Veri"; } else if (rand <= 65) { prize = 3000; msg = "🔋 Kaliteli Veri"; } else if (rand <= 85) { prize = 7500; msg = "💎 Nadir Çip"; } else if (rand <= 95) { prize = 20000; msg = "🔥 Destansı Çekirdek"; } else { prize = 50000; msg = "👑 EFSANEVİ NODE 👑"; } 
    } 
    else if (boxType === 3) { 
        if (rand <= 20) { prize = 0; msg = "🗑️ Çöp Veri"; } else if (rand <= 50) { prize = 15000; msg = "💎 Parazitli Node"; } else if (rand <= 80) { prize = 40000; msg = "🔥 Saf Çekirdek"; } else if (rand <= 95) { prize = 100000; msg = "👑 EFSANEVİ KOD 👑"; } else { prize = 250000; msg = "🌌 UZAY BOŞLUĞU 🌌"; }
    }
    
    if (prize > 0) addPoints(user, prize); 
    await user.save(); 
    res.json({ success: true, prize, msg, points: user.points, lastLootboxOpen: user.lastLootboxOpen });
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });
app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); const today = new Date(); today.setHours(0, 0, 0, 0); const daily = await User.find({ lastPointDate: { $gte: today } }).sort({ dailyPoints: -1 }).limit(100); const yesterday = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 }); res.json({ success: true, leaderboard: allTime, dailyLeaderboard: daily, yesterdayLeaderboard: yesterday }); 
});

function verifyTelegramWebAppData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash'); const authDate = initData.get('auth_date');
        if (!hash || !authDate) return false;
        const now = Math.floor(Date.now() / 1000); if (now - parseInt(authDate) > 86400) return false;
        initData.delete('hash'); const keys = Array.from(initData.keys()).sort();
        const dataCheckString = keys.map(key => `${key}=${initData.get(key)}`).join('\n');
        const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
        const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
        return calculatedHash === hash;
    } catch (error) { return false; }
}

const secureRoute = (req, res, next) => {
    const initData = req.body.initData; if (!initData || !verifyTelegramWebAppData(initData)) return res.status(403).json({ success: false });
    next();
};

bot.onText(/\/grububagla/, async (msg) => {
    if (String(msg.from.id) !== String(ADMIN_ID)) return; if (msg.chat.type === 'private') return;
    const s = await Settings.findOne() || await Settings.create({}); s.mainGroupId = msg.chat.id.toString(); await s.save();
    bot.sendMessage(msg.chat.id, "✅ **Sistem Entegre Edildi!**", { parse_mode: 'Markdown' });
});

bot.onText(/\/yardim/, (msg) => { bot.sendMessage(msg.chat.id, `🎮 **Grup Komutları**\n\n👤 \`/profil\`\n💸 \`/bahsis <miktar>\`\n🎲 \`/zar <miktar>\`\n🏆 \`/liderler\`\n⛏️ \`/maden\`\n⚔️ \`/duello <miktar>\``, { parse_mode: 'Markdown' }); });
bot.onText(/\/profil/, async (msg) => { const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user) return; bot.sendMessage(msg.chat.id, `👤 **${msg.from.first_name}**\n💰 Bakiye: **${Math.floor(user.points).toLocaleString()} GEP**`, { parse_mode: 'Markdown' }); });
bot.onText(/\/zar (\d+)/, async (msg, match) => { const amount = parseInt(match[1]); const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user || user.points < amount || amount < 100) return; user.points -= amount; await user.save(); const diceMsg = await bot.sendDice(msg.chat.id); setTimeout(async () => { if (diceMsg.dice.value >= 4) { const win = amount * 2; addPoints(user, win); await user.save(); bot.sendMessage(msg.chat.id, `🎉 **KAZANDIN!** +${win} GEP!`, { reply_to_message_id: diceMsg.message_id }); } else { bot.sendMessage(msg.chat.id, `💀 **KAYBETTİN...**`, { reply_to_message_id: diceMsg.message_id }); } }, 4000); });

app.post('/api/admin/create-promo', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); const { code, reward, maxUsage } = req.body; try { await PromoCode.create({ code: code.toUpperCase(), reward, maxUsage }); res.json({ success: true }); } catch(e) { res.json({ success: false }); } });
app.post('/api/admin/stats', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); const settings = await Settings.findOne() || { announcements: [] }; res.json({ totalUsers: await User.countDocuments(), totalPoints: (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0, announcements: settings.announcements, tasks: await Task.find() }); });
app.post('/api/admin/add-task', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); await Task.create({ taskId: Date.now().toString(), title: req.body.title, reward: req.body.reward, target: req.body.target }); res.json({ success: true }); });
app.post('/api/admin/delete-task', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); await Task.deleteOne({ taskId: req.body.taskId }); res.json({ success: true }); });
app.post('/api/admin/announcement', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); const s = await Settings.findOne() || await Settings.create({}); if(req.body.action === 'add') s.announcements.push(req.body.text); else s.announcements.splice(req.body.index, 1); await s.save(); res.json({ success: true }); });
app.post('/api/admin/user-manage', secureRoute, async (req, res) => { if (String(req.body.adminId) !== String(ADMIN_ID)) return res.status(403).send("Yetkisiz"); const { targetId, action, amount } = req.body; const user = await User.findOne({ $or: [{ telegramId: targetId }, { username: targetId }] }); if (!user) return res.json({ success: false }); if (action === 'add') addPoints(user, Number(amount)); if (action === 'set') user.points = Number(amount); if (action === 'ban') user.isBanned = true; if (action === 'unban') user.isBanned = false; await user.save(); res.json({ success: true }); });

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
