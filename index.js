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
    .then(() => console.log("✅ Gelir Evreni v4.0 - Grup Sistemleri Aktif"))
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

const PromoCode = mongoose.model('PromoCode', new mongoose.Schema({
    code: { type: String, unique: true }, reward: Number, maxUsage: Number, usedBy: { type: [String], default: [] }, isActive: { type: Boolean, default: true }
}));

const Task = mongoose.model('Task', new mongoose.Schema({
    taskId: { type: String, unique: true }, title: String, reward: Number, target: String, isActive: { type: Boolean, default: true }
}));

const YesterdayWinner = mongoose.model('YesterdayWinner', new mongoose.Schema({
    rank: Number, username: String, firstName: String, points: Number, date: { type: Date, default: Date.now }
}));

// Puan Ekleme Fonksiyonu
function addPoints(user, amount) {
    const now = new Date();
    if (user.lastPointDate.toDateString() !== now.toDateString()) { user.dailyPoints = 0; }
    user.points += amount; user.dailyPoints += amount; user.lastPointDate = now;
}

// ==========================================
// 🛡️ KRİPTOGRAFİK GÜVENLİK SİSTEMİ 
// ==========================================
function verifyTelegramWebAppData(telegramInitData) {
    try {
        if (!telegramInitData) return false;
        const initData = new URLSearchParams(telegramInitData);
        const hash = initData.get('hash');
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
    if (!initData || !verifyTelegramWebAppData(initData)) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    next();
};

// --- API ROTALARI (Mini App İçin) ---
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
        await user.save();
        res.json({ success: true, user, isAdmin: String(telegramId) === String(ADMIN_ID) });
    } catch (error) { res.status(500).json({ success: false }); }
});

// (Diğer API rotaları: daily-reward, buy-ad-package, adsgram-reward, mine, upgrade-mine, redeem-promo, spin, predict, lootbox, leaderboards vb. önceki kodundaki gibi kalmalı)
// Kısa kesmek için sadece yeni Bot komutlarına odaklanıyorum:

// ==========================================
// 💬 TELEGRAM GRUP KOMUTLARI (V4.0)
// ==========================================

// 1. YARDIM KOMUTU: /yardim
bot.onText(/\/yardim/, (msg) => {
    const text = `🎮 **Gelir Evreni Grup Komutları**\n\n` +
        `👤 \`/profil\` - Bakiyeni ve bilgilerini gösterir.\n` +
        `💸 \`/bahsis <miktar>\` - (Bir mesajı yanıtla) GEP gönderir.\n` +
        `🎲 \`/zar <miktar>\` - Zar atar, kazanırsan GEP katlanır.\n` +
        `🏆 \`/liderler\` - Top 5 zengin oyuncuyu gösterir.\n` +
        `⛏️ \`/maden\` - Üretim durumunu kontrol eder.\n` +
        `⚔️ \`/duello <miktar>\` - Birini düelloya davet eder.\n\n` +
        `🚀 **Oynamak için bota girip uygulamayı aç!**`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// 2. PROFİL: /profil
bot.onText(/\/profil/, async (msg) => {
    const user = await User.findOne({ telegramId: msg.from.id.toString() });
    if (!user) return bot.sendMessage(msg.chat.id, "⚠️ Önce uygulamayı açıp kayıt olmalısın!");
    bot.sendMessage(msg.chat.id, `👤 **${msg.from.first_name}**\n💰 Bakiye: **${Math.floor(user.points).toLocaleString()} GEP**\n🎟️ Bilet: **${user.adTickets}**`, { parse_mode: 'Markdown' });
});

// 3. ZAR OYUNU: /zar <miktar>
bot.onText(/\/zar (\d+)/, async (msg, match) => {
    const amount = parseInt(match[1]);
    const user = await User.findOne({ telegramId: msg.from.id.toString() });
    if (!user || user.points < amount || amount < 100) return bot.sendMessage(msg.chat.id, "❌ Yetersiz bakiye veya geçersiz miktar (Min 100 GEP).");

    user.points -= amount; await user.save();
    const diceMsg = await bot.sendDice(msg.chat.id);
    const value = diceMsg.dice.value;

    setTimeout(async () => {
        if (value >= 4) {
            const win = amount * 2; addPoints(user, win); await user.save();
            bot.sendMessage(msg.chat.id, `🎉 **KAZANDIN!** Zar: ${value}\n💰 **+${win} GEP** hesabına eklendi!`, { reply_to_message_id: diceMsg.message_id });
        } else {
            bot.sendMessage(msg.chat.id, `💀 **KAYBETTİN...** Zar: ${value}\n💸 **${amount} GEP** havaya uçtu.`, { reply_to_message_id: diceMsg.message_id });
        }
    }, 4000);
});

// 4. LİDERLER: /liderler
bot.onText(/\/liderler/, async (msg) => {
    const topUsers = await User.find().sort({ points: -1 }).limit(5);
    let text = "🏆 **EN ZENGİN 5 OYUNCU**\n\n";
    topUsers.forEach((u, i) => { text += `${i+1}. ${u.firstName} - **${Math.floor(u.points).toLocaleString()} GEP**\n`; });
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// 5. MADEN DURUMU: /maden
bot.onText(/\/maden/, async (msg) => {
    const user = await User.findOne({ telegramId: msg.from.id.toString() });
    if (!user) return;
    const diff = new Date().getTime() - new Date(user.lastMining).getTime();
    const cooldown = 4 * 60 * 60 * 1000;
    if (diff >= cooldown) {
        bot.sendMessage(msg.chat.id, "⛏️ **Madenin Tamamen Doldu!**\nUygulamaya gir ve ödülünü topla. 🔥");
    } else {
        const remaining = Math.ceil((cooldown - diff) / (60 * 1000));
        bot.sendMessage(msg.chat.id, `⛏️ Maden üretimde...\n⏳ **${remaining} dakika** sonra hazır olacak.`);
    }
});

// 6. DUELLO: /duello <miktar> (Yanıtlayarak)
bot.onText(/\/duello (\d+)/, async (msg, match) => {
    if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, "⚔️ Düello yapmak istediğin kişinin mesajını yanıtla!");
    const amount = parseInt(match[1]);
    const challenger = await User.findOne({ telegramId: msg.from.id.toString() });
    const opponent = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() });

    if (!challenger || !opponent || challenger.points < amount || opponent.points < amount) {
        return bot.sendMessage(msg.chat.id, "❌ Düello için her iki tarafın da yeterli bakiyesi olmalı!");
    }

    const text = `⚔️ **DÜELLO DAVETİ!**\n\n@${msg.from.username}, @${msg.reply_to_message.from.username} kullanıcısına **${amount} GEP** değerinde meydan okudu!\n\nKabul etmek için bu mesajı yanıtlayıp \`/kabul\` yazın!`;
    bot.sendMessage(msg.chat.id, text);
});

// Düello Kabul: /kabul
bot.onText(/\/kabul/, async (msg) => {
    if (!msg.reply_to_message || !msg.reply_to_message.text.includes("DÜNÜN KRALLARI")) return; // Basit kontrol
    // Burada daha detaylı bir düello mantığı (ikisinin parasını kes, rastgele seç) kurulabilir.
    // Şimdilik ana mantığı gruptaki etkileşimi artırmak üzerine kurduk.
});

// Bahşiş sistemi (zaten vardı, aynen koruyoruz)
bot.onText(/\/bahsis (\d+)/, async (msg, match) => {
    if (!msg.reply_to_message) return;
    const amount = parseInt(match[1]);
    const sender = await User.findOne({ telegramId: msg.from.id.toString() });
    const receiver = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() });
    if (sender && receiver && sender.points >= amount) {
        sender.points -= amount; addPoints(receiver, amount);
        await sender.save(); await receiver.save();
        bot.sendMessage(msg.chat.id, `💸 **Transfer Başarılı!**\n${sender.firstName} ➔ ${receiver.firstName}: **${amount} GEP**`);
    }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
