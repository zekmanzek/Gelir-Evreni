require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');

// 1. MODÜLLER VE VERİTABANI
const models = require('./models');
const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

const app = express();
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;

// PATRON ID'Sİ KİLİTLENDİ (TANRI MODU)
const ADMIN_ID = "1469411131"; 
const WEBHOOK_URL = "https://gelir-evreni.onrender.com"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const bot = new TelegramBot(TOKEN);
bot.setWebHook(`${WEBHOOK_URL}/webhook`);

// --- DİNAMİK EKONOMİ VE SİSTEM TABLOSU (GAME CONFIG) ---
const gameConfigSchema = new mongoose.Schema({
    gepcozReward: { type: Number, default: 25000 },
    spinCost: { type: Number, default: 5000 },
    predictCost: { type: Number, default: 1000 },
    lootbox1Cost: { type: Number, default: 1000 },
    lootbox2Cost: { type: Number, default: 5000 },
    lootbox3Cost: { type: Number, default: 25000 },
    airdropCost: { type: Number, default: 1000000 },
    refReward: { type: Number, default: 10000 },
    isLocked: { type: Boolean, default: false }, // Panik Butonu Kilidi
    boostMultiplier: { type: Number, default: 1 }, // Happy Hour Çarpanı
    boostEndTime: { type: Date, default: null } // Happy Hour Bitiş Zamanı
});
const GameConfig = mongoose.models.GameConfig || mongoose.model('GameConfig', gameConfigSchema);

mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Gelir Evreni v10.3 - CRASH MOTORU BUG FIX'Lİ AKTİF"))
    .catch((err) => console.error("❌ MongoDB Hatası:", err));

app.post('/webhook', (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// ORTAK FONKSİYONLAR VE RADAR SİSTEMİ
const sharedState = { activeDrop: null };
const activePredictions = new Map();
const activeCrashSessions = new Map(); // YENİ: CRASH OYUNU İÇİN OTURUM YÖNETİMİ

const radarLogs = [];
function addRadarLog(action) {
    const time = new Date().toLocaleTimeString('tr-TR', { hour12: false, timeZone: 'Europe/Istanbul' });
    radarLogs.unshift(`[${time}] ${action}`);
    if (radarLogs.length > 20) radarLogs.pop(); // Son 20 işlemi tutar
}

function addPoints(user, amount) {
    const now = new Date();
    user.points += amount; 
    user.dailyPoints += amount; 
    user.lastPointDate = now;
}

async function broadcastBigWin(username, firstName, gameName, prize) {
    try {
        const s = await Settings.findOne();
        if (!s || !s.mainGroupId) return;
        const displayName = username ? `@${username}` : firstName;
        const msg = `🎉 **BÜYÜK VURGUN!**\n\n${displayName}, **${gameName}** oyunundan tam **${prize.toLocaleString()} GEP** kazandı! 🤑\n\nSen de şansını denemek için hemen aşağıdaki butona tıkla! 🚀`;
        bot.sendMessage(s.mainGroupId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Sen De Kazan", web_app: { url: WEBHOOK_URL } }]] } });
    } catch (err) { console.error("Duyuru hatası:", err); }
}

const botConfig = { ADMIN_ID, WEBHOOK_URL };
require('./botCommands')(bot, models, botConfig, addPoints, sharedState);

// =====================================================================
// 🛡️ SİBER KOMUTA MERKEZİ (TÜM BOT KOMUTLARI EKSİKSİZ) 🛡️
// =====================================================================
bot.on('message', async (msg) => {
    if (!msg.text) return;
    if (msg.from.id.toString() !== ADMIN_ID) return;

    const args = msg.text.split(' ');
    const cmd = args[0].toLowerCase();

    try {
        // --- 1. KOMUT REHBERİ ---
        if (cmd === '/admin') {
            const adminText = `🛡️ **SİBER KOMUTA MERKEZİ (MASTER)**\n\n` +
            `🚨 *ACİL DURUM KONTROLLERİ:*\n` +
            `\`/kilit aktif\` | \`/kilit kapat\`\n\n` +
            `💸 *EKONOMİ & PROMOSYON:*\n` +
            `\`/boost Çarpan Dakika\` (Örn: /boost 2 60)\n` +
            `\`/ayar [oyun] [fiyat]\` (Örn: /ayar cark 10000)\n` +
            `\`/promo KOD Ödül Limit\`\n\n` +
            `📢 *İLETİŞİM & SİSTEM GÖREVLERİ:*\n` +
            `\`/yayin Mesaj\` (Tüm ağa butonlu mesaj)\n` +
            `\`/duyuru ekle/sil/liste\` (Kayan Yazı)\n` +
            `\`/gorev ekle/sil/liste\` (Görev Merkezi)\n\n` +
            `👤 *İSTİHBARAT, CEZA VE ÖDEME:*\n` +
            `\`/radar\` (Ağdaki son 20 canlı işlem)\n` +
            `\`/bilgi @user\` (Temel İstihbarat)\n` +
            `\`/canta @user\` (Derin Röntgen / Loglar)\n` +
            `\`/bakiye @user Miktar\` (GEP Ekle/Sil)\n` +
            `\`/ceza @user\` (Bakiyeyi Sıfırla)\n` +
            `\`/ban @user\` | \`/unban @user\`\n` +
            `\`/odemelist\` (Kazanan Cüzdanlar)\n\n` +
            `📊 \`/rapor\` (Genel Sistem Durumu)`;
            return bot.sendMessage(ADMIN_ID, adminText, { parse_mode: 'Markdown' });
        }

        // --- 2. ACİL DURUM (PANİK BUTONU) ---
        if (cmd === '/kilit') {
            let config = await GameConfig.findOne() || await GameConfig.create({});
            if (args[1] === 'aktif') { 
                config.isLocked = true; await config.save(); 
                return bot.sendMessage(ADMIN_ID, `🚨 **SİSTEM KİLİTLENDİ!** Oyuncuların ekranı karartıldı.`); 
            }
            if (args[1] === 'kapat') { 
                config.isLocked = false; await config.save(); 
                return bot.sendMessage(ADMIN_ID, `✅ **KİLİT AÇILDI!** Sistem normale döndü.`); 
            }
        }

        // --- 3. HAPPY HOUR (KÜRESEL ÇARPAN) ---
        if (cmd === '/boost') {
            const mult = parseFloat(args[1]); const mins = parseInt(args[2]);
            if (!mult || isNaN(mins)) return bot.sendMessage(ADMIN_ID, "❌ Format: /boost [Çarpan] [Dakika]");
            let config = await GameConfig.findOne() || await GameConfig.create({});
            config.boostMultiplier = mult; 
            config.boostEndTime = new Date(Date.now() + mins * 60000); 
            await config.save();
            bot.sendMessage(ADMIN_ID, `🔥 **HAPPY HOUR AKTİF!** Çarpan: ${mult}x | Süre: ${mins} Dk`);
            
            const users = await User.find({ telegramId: { $exists: true } });
            users.forEach(u => { 
                bot.sendMessage(u.telegramId, `🔥 **SİBER ETKİNLİK BAŞLADI!**\n\nÖnümüzdeki ${mins} dakika boyunca sistemdeki maden, görev ve Gepçöz kazançları tam **${mult} KATINA** çıkarıldı! Fırsatı kaçırma! 👇`, { reply_markup: { inline_keyboard: [[{ text: "🚀 2X KAZAN", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}); 
            });
            return;
        }

        // --- 4. CANLI RADAR ---
        if (cmd === '/radar') {
            if (radarLogs.length === 0) return bot.sendMessage(ADMIN_ID, "📡 Radar şu an boş. Hareket yok.");
            return bot.sendMessage(ADMIN_ID, `📡 **CANLI SİBER RADAR (Son 20 İşlem)**\n\n` + radarLogs.join('\n'));
        }

        // --- 5. İSTİHBARAT: BİLGİ & ÇANTA ---
        if (cmd === '/bilgi') {
            const target = args[1]?.replace('@', '');
            if (!target) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı adı girin.");
            const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            return bot.sendMessage(ADMIN_ID, `👤 **İstihbarat:** @${u.username || "Yok"} (ID: ${u.telegramId})\n💰 **Bakiye:** ${u.points.toLocaleString()} GEP\n🏆 **Davet:** ${u.referralCount || 0} Kişi\n⚠️ **Ban Durumu:** ${u.isBanned ? 'Evet' : 'Hayır'}\n👛 **Cüzdan:** ${u.walletAddress ? 'Bağlı' : 'Bağlı Değil'}`, { parse_mode: 'Markdown' });
        }

        if (cmd === '/canta') {
            const target = args[1]?.replace('@', '');
            if (!target) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı adı girin.");
            const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            const info = `🩻 **DERİN X-RAY:** @${u.username || "Gizli"} (${u.telegramId})\n\n` +
            `💰 **Bakiye:** ${u.points.toLocaleString()}\n` +
            `📈 **Günlük Seri:** ${u.streak} Gün (Son: ${new Date(u.lastCheckin).toLocaleString('tr-TR')})\n` +
            `⛏️ **Son Maden:** ${new Date(u.lastMining).toLocaleString('tr-TR')}\n` +
            `📦 **Kutu 1:** ${new Date(u.lastLootbox1 || 0).toLocaleString('tr-TR')}\n` +
            `📦 **Kutu 2:** ${new Date(u.lastLootbox2 || 0).toLocaleString('tr-TR')}\n` +
            `📦 **Kutu 3:** ${new Date(u.lastLootbox3 || 0).toLocaleString('tr-TR')}\n` +
            `👛 **Cüzdan:** \`${u.walletAddress || 'Yok'}\``;
            return bot.sendMessage(ADMIN_ID, info, { parse_mode: 'Markdown' });
        }

        // --- 6. BAKİYE VE CEZA (İNFAZ) ---
        if (cmd === '/bakiye') {
            const target = args[1]?.replace('@', ''); const amount = parseInt(args[2]);
            if (!target || isNaN(amount)) return bot.sendMessage(ADMIN_ID, "❌ Format: /bakiye @kullaniciadi miktar");
            const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            addPoints(u, amount); await u.save();
            return bot.sendMessage(ADMIN_ID, `✅ @${u.username} hesabına müdahale edildi. Yeni Bakiye: ${u.points.toLocaleString()} GEP`);
        }

        if (cmd === '/ceza') {
            const target = args[1]?.replace('@', '');
            if (!target) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı adı girin.");
            const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            const oldBalance = u.points; u.points = 0; u.streak = 1; await u.save();
            addRadarLog(`⚡ DİKKAT: @${u.username} yöneticiler tarafından infaz edildi. (-${oldBalance} GEP)`);
            return bot.sendMessage(ADMIN_ID, `⚡ **İNFAZ BAŞARILI!** @${u.username} adlı kullanıcının ${oldBalance.toLocaleString()} GEP bakiyesi SIFIRLANDI.`);
        }

        if (cmd === '/ban') {
            const u = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: true });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            return bot.sendMessage(ADMIN_ID, `🚫 @${u.username} sistemden uzaklaştırıldı.`);
        }

        if (cmd === '/unban') {
            const u = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: false });
            if (!u) return bot.sendMessage(ADMIN_ID, "❌ Kullanıcı bulunamadı.");
            return bot.sendMessage(ADMIN_ID, `✅ @${u.username} yasağı kaldırıldı.`);
        }

        // --- 7. EKONOMİ (AYAR) VE PROMOSYON KODU ---
        if (cmd === '/ayar') {
            const game = args[1]?.toLowerCase(); const newPrice = parseInt(args[2]);
            if (!game || isNaN(newPrice)) return bot.sendMessage(ADMIN_ID, "❌ Format: /ayar [oyun] [fiyat]");
            let config = await GameConfig.findOne() || await GameConfig.create({});
            let fieldMap = { 'gepcoz': 'gepcozReward', 'cark': 'spinCost', 'tahmin': 'predictCost', 'kapsul1': 'lootbox1Cost', 'kapsul2': 'lootbox2Cost', 'kapsul3': 'lootbox3Cost', 'airdrop': 'airdropCost', 'referans': 'refReward' };
            if (!fieldMap[game]) return bot.sendMessage(ADMIN_ID, "❌ Hatalı oyun adı.");
            config[fieldMap[game]] = newPrice; await config.save();
            return bot.sendMessage(ADMIN_ID, `⚙️ Başarılı! ${game.toUpperCase()} yeni değeri: ${newPrice.toLocaleString()} GEP`);
        }

        if (cmd === '/promo') {
            const code = args[1]; const reward = parseInt(args[2]); const maxUsage = parseInt(args[3]);
            if (!code || isNaN(reward) || isNaN(maxUsage)) return bot.sendMessage(ADMIN_ID, "❌ Format: /promo KOD Ödül Kişi");
            await PromoCode.create({ code: code.toUpperCase(), reward, maxUsage });
            return bot.sendMessage(ADMIN_ID, `✅ Kod Üretildi:\n🎁 ${code.toUpperCase()} | 💰 ${reward} GEP | 👥 ${maxUsage} Kişi`);
        }

        // --- 8. DUYURU YÖNETİMİ ---
        if (cmd === '/duyuru') {
            const action = args[1]; const text = msg.text.replace(`/duyuru ${action} `, '');
            const s = await Settings.findOne() || await Settings.create({});
            if (action === 'ekle') { s.announcements.push(text); await s.save(); return bot.sendMessage(ADMIN_ID, "✅ Kayan duyuru eklendi."); }
            if (action === 'liste') { return bot.sendMessage(ADMIN_ID, `📢 **Kayan Duyurular:**\n` + s.announcements.map((a,i) => `${i+1}. ${a}`).join('\n') || "Duyuru Yok"); }
            if (action === 'sil') { s.announcements.splice(parseInt(args[2])-1, 1); await s.save(); return bot.sendMessage(ADMIN_ID, "✅ Duyuru silindi."); }
        }

        // --- 9. GÖREV YÖNETİMİ ---
        if (cmd === '/gorev') {
            const action = args[1];
            if (action === 'liste') { 
                const tasks = await Task.find(); 
                return bot.sendMessage(ADMIN_ID, `🎯 **Sistemdeki Görevler:**\n` + tasks.map(t => `ID: ${t.taskId} | ${t.title} | ${t.reward} GEP`).join('\n') || "Görev Yok"); 
            }
            if (action === 'ekle') { 
                await Task.create({ taskId: Date.now().toString(), title: args[2].replace(/_/g, ' '), reward: parseInt(args[3]), target: args[4] }); 
                return bot.sendMessage(ADMIN_ID, "✅ Görev Eklendi. (Not: Başlıktaki '_' işaretleri boşluğa çevrilir)"); 
            }
            if (action === 'sil') { 
                await Task.deleteOne({ taskId: args[2] }); 
                return bot.sendMessage(ADMIN_ID, "✅ Görev Silindi."); 
            }
        }

        // --- 10. KÜRESEL YAYIN (BUTONLU) VE RAPOR ---
        if (cmd === '/yayin') {
            const message = msg.text.replace('/yayin ', '');
            if (!message || message === '/yayin') return bot.sendMessage(ADMIN_ID, "❌ Mesaj girmediniz.");
            const users = await User.find({ telegramId: { $exists: true } });
            bot.sendMessage(ADMIN_ID, `⏳ Yayın başladı...`);
            for (let u of users) { 
                try { 
                    await bot.sendMessage(u.telegramId, `📢 **SİBER AĞ DUYURUSU**\n\n${message}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 HEMEN OYNA", web_app: { url: WEBHOOK_URL } }]] } }); 
                } catch (e) {} 
            }
            return bot.sendMessage(ADMIN_ID, `✅ Yayın tamamlandı!`);
        }

        if (cmd === '/rapor') {
            const userCount = await User.countDocuments();
            const totalGep = (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0;
            const config = await GameConfig.findOne() || await GameConfig.create({});
            const isBoost = config.boostEndTime && config.boostEndTime > new Date();
            const report = `📊 **SİBER AĞ DURUM RAPORU** 📊\n\n` +
                           `👥 **Toplam Oyuncu:** ${userCount.toLocaleString()}\n` +
                           `💎 **Dolaşımdaki GEP:** ${totalGep.toLocaleString()}\n` +
                           `🔥 **Happy Hour:** ${isBoost ? 'Aktif (' + config.boostMultiplier + 'x)' : 'Kapalı'}\n` +
                           `🚨 **Sistem Kilidi:** ${config.isLocked ? 'KİLİTLİ' : 'Açık'}\n\n` +
                           `⚙️ **Güncel Fiyatlar:**\n` +
                           `Gepçöz Ödülü: ${config.gepcozReward} | Ref Ödülü: ${config.refReward}\n` +
                           `Çark Bedeli: ${config.spinCost} | Tahmin: ${config.predictCost}`;
            return bot.sendMessage(ADMIN_ID, report, { parse_mode: 'Markdown' });
        }

        // --- 11. ÖDEME LİSTESİ (CÜZDANLAR) ---
        if (cmd === '/odemelist') {
            const topWinners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
            if (topWinners.length === 0) return bot.sendMessage(ADMIN_ID, "⚠️ Liderlik tablosu şu an boş.");
            let msgText = `💰 **HAFTALIK ÖDEME LİSTESİ (TOP 5)** 💰\n\n`;
            
            topWinners.forEach((u, i) => {
                msgText += `${i+1}. @${u.username || u.firstName} - ${u.dailyPoints.toLocaleString()} GEP\n`;
                msgText += `📍 Adres: \`${u.walletAddress || 'Bağlamamış'}\`\n`;
                msgText += `------------------------\n`;
            });
            
            return bot.sendMessage(ADMIN_ID, msgText, { parse_mode: 'Markdown' });
        }

    } catch (error) { bot.sendMessage(ADMIN_ID, `❌ Sistem Hatası: ${error.message}`); }
});
// =====================================================================

// --- OTOMATİK GÖREVLER (CRON JOBS) ---
setInterval(async () => {
    try {
        const s = await Settings.findOne(); if (!s || !s.mainGroupId) return;
        const now = new Date(); const utcHour = now.getUTCHours(); const utcMin = now.getUTCMinutes();
        if (utcHour === 6 && utcMin === 0) bot.sendMessage(s.mainGroupId, "☀️ Günaydın Siber Ağ!");
        else if (utcHour === 20 && utcMin === 30) bot.sendMessage(s.mainGroupId, "🌙 İyi geceler millet!");
        if (utcMin === 0 && Math.random() < 0.10) {
            sharedState.activeDrop = { reward: 25000, claimed: false };
            bot.sendMessage(s.mainGroupId, "🎁 **DİKKAT: SİBER DROP TESPİT EDİLDİ!**\n\nİlk tıklayan kazanır!", { reply_markup: { inline_keyboard: [[{ text: "💎 ÖDÜLÜ KAP", callback_data: "claim_drop" }]] } });
        }
    } catch (e) { }
}, 60000);

// HAFTALIK LİDERLİK SIFIRLAMA
setInterval(async () => {
    const now = new Date(); if (now.getDay() === 0 && now.getHours() === 23 && now.getMinutes() === 58) {
        const winners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100);
        if (winners.length > 0) {
            await YesterdayWinner.deleteMany({}); 
            await YesterdayWinner.insertMany(winners.map((u, i) => ({ rank: i + 1, username: u.username, firstName: u.firstName, points: u.dailyPoints, date: new Date() }))); 
            await User.updateMany({}, { $set: { dailyPoints: 0 } });
        }
    } 
}, 60000);

// --- GÜVENLİK VE ROUTE'LAR ---
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

const secureRoute = async (req, res, next) => {
    const initData = req.body.initData || req.query.initData;
    const realId = getTelegramUserFromInitData(initData);
    if (!realId) return res.status(403).json({ success: false, message: "⚠️ Güvenlik Hatası!" });
    
    // PANİK BUTONU KONTROLÜ
    const config = await GameConfig.findOne() || await GameConfig.create({});
    if (config.isLocked && realId !== ADMIN_ID) {
        return res.json({ success: false, isLocked: true, message: "SİSTEM BAKIMDA" });
    }
    
    // ÇARPAN KONTROLÜ
    req.boostMult = (config.boostEndTime && config.boostEndTime > new Date()) ? config.boostMultiplier : 1;
    req.realTelegramId = realId; 
    next();
};

app.post('/api/user/save-wallet', secureRoute, async (req, res) => {
    try {
        const { walletAddress } = req.body;
        const user = await User.findOneAndUpdate(
            { telegramId: req.realTelegramId },
            { walletAddress: walletAddress },
            { new: true }
        );
        if (user) addRadarLog(`👛 @${user.username} cüzdanını bağladı.`);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/user/auth', secureRoute, async (req, res) => {
    const { username, firstName, referrerId } = req.body;
    const telegramId = req.realTelegramId;
    const config = await GameConfig.findOne() || await GameConfig.create({});
    
    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username: (username || '').toLowerCase(), firstName, points: 1000 });
            if (referrerId && String(referrerId) !== String(telegramId)) {
                const referrer = await User.findOne({ telegramId: referrerId });
                if (referrer) { 
                    addPoints(referrer, config.refReward); referrer.referralCount += 1; await referrer.save(); 
                    addPoints(user, config.refReward); 
                    addRadarLog(`👥 @${user.username || 'Yeni'} ağa katıldı. (Ref: @${referrer.username})`);
                }
            }
        } else { if (username) user.username = username.toLowerCase(); if (firstName) user.firstName = firstName; }
        await user.save(); let settings = await Settings.findOne() || await Settings.create({});
        
        const isBoostActive = config.boostEndTime && config.boostEndTime > new Date();
        res.json({ success: true, user, botUsername: settings.botUsername, isAdmin: String(telegramId) === String(ADMIN_ID), announcements: settings.announcements, isBoostActive, boostMultiplier: config.boostMultiplier });
    } catch (error) { res.status(500).json({ success: false }); }
});

app.post('/api/daily-reward', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); const diffHours = (now - new Date(user.lastCheckin)) / (1000 * 60 * 60);
    if (diffHours < 24) return res.json({ success: false, message: "24 saat bekleyin." });
    if (diffHours >= 48) user.streak = 1; else user.streak = user.streak >= 7 ? 1 : user.streak + 1;
    const baseReward = 1000 * Math.pow(2, user.streak - 1); 
    const finalReward = baseReward * req.boostMult;
    
    addPoints(user, finalReward); user.lastCheckin = now; await user.save();
    addRadarLog(`🎁 @${user.username} Günlük Ödül aldı. (+${finalReward})`);
    res.json({ success: true, points: user.points, streak: user.streak, reward: finalReward });
});

app.post('/api/buy-ad-package', secureRoute, async (req, res) => {
    const { packageId } = req.body; let cost = packageId === 1 ? 10000 : (packageId === 2 ? 50000 : 100000); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost, adTickets: (packageId === 1 ? 10 : (packageId === 2 ? 50 : 100)) } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    addRadarLog(`🎟️ @${user.username} Reklam Paketi satın aldı.`);
    res.json({ success: true, points: user.points, adTickets: user.adTickets });
});

app.post('/api/adsgram-reward', secureRoute, async (req, res) => {
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, adTickets: { $gt: 0 } }, { $inc: { adTickets: -1 } }, { new: true });
    if (!user) return res.json({ success: false });
    const finalReward = 5000 * req.boostMult; 
    addPoints(user, finalReward); await user.save();
    addRadarLog(`📺 @${user.username} Reklam izledi. (+${finalReward})`);
    res.json({ success: true, points: user.points, adTickets: user.adTickets, reward: finalReward });
});

app.post('/api/mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); const now = new Date();
    if (user && (now - new Date(user.lastMining)) > 4 * 60 * 60 * 1000) {
        const baseReward = 1000 + ((user.miningLevel - 1) * 500); 
        const finalReward = baseReward * req.boostMult;
        addPoints(user, finalReward); user.lastMining = now; user.isMiningNotified = false; await user.save(); 
        addRadarLog(`⛏️ @${user.username} Maden topladı. (+${finalReward})`);
        return res.json({ success: true, points: user.points, reward: finalReward });
    }
    res.json({ success: false });
});

app.post('/api/upgrade-mine', secureRoute, async (req, res) => {
    const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const upgradeCost = user.miningLevel * 10000;
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: upgradeCost } }, { $inc: { points: -upgradeCost, miningLevel: 1 } }, { new: true });
    if (updatedUser) { 
        addRadarLog(`⚙️ @${updatedUser.username} Motorunu Seviye ${updatedUser.miningLevel} yaptı.`);
        res.json({ success: true, points: updatedUser.points, newLevel: updatedUser.miningLevel }); 
    } else { res.json({ success: false }); }
});

app.post('/api/redeem-promo', secureRoute, async (req, res) => {
    const { code } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user || !code) return res.json({ success: false });
    const promo = await PromoCode.findOne({ code: code.toUpperCase(), isActive: true }); if (!promo) return res.json({ success: false, message: "Geçersiz!" });
    if (promo.usedBy.includes(req.realTelegramId)) return res.json({ success: false, message: "Zaten kullandın!" });
    if (promo.usedBy.length >= promo.maxUsage) { promo.isActive = false; await promo.save(); return res.json({ success: false, message: "Sınır doldu!" }); }
    promo.usedBy.push(req.realTelegramId); if (promo.usedBy.length >= promo.maxUsage) promo.isActive = false; await promo.save();
    addPoints(user, promo.reward); await user.save(); 
    addRadarLog(`🎫 @${user.username} [${code}] promosunu kullandı.`);
    res.json({ success: true, reward: promo.reward, points: user.points });
});

app.post('/api/arcade/zarzara', secureRoute, async (req, res) => {
    const { bet } = req.body; const amount = parseInt(bet);
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP." });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    const diceValue = Math.floor(Math.random() * 6) + 1; let winAmount = 0;
    if (diceValue >= 4) { winAmount = amount * 2; addPoints(user, winAmount); await user.save(); }
    addRadarLog(`🎲 @${user.username} Zarzara oynadı. Sonuç: ${diceValue >= 4 ? 'KAZANDI (+'+winAmount+')' : 'KAYBETTİ'}`);
    res.json({ success: true, diceValue, winAmount, points: user.points });
});

app.post('/api/arcade/spin', secureRoute, async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const cost = config.spinCost;
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" }); 
    const rand = Math.random() * 100; let prize = 0; let msg = "BOŞ";
    if (rand <= 40) { prize = 0; msg = "Şansını Dene"; } 
    else if (rand <= 75) { prize = 2500; msg = "Yarım Teselli"; } 
    else if (rand <= 92) { prize = 5000; msg = "Amorti!"; } 
    else if (rand <= 99) { prize = 10000; msg = "İKİYE KATLADIN!"; } 
    else { prize = 50000; msg = "💥 JACKPOT! 💥"; }
    
    addRadarLog(`🎰 @${user.username} Çark çevirdi. Ödül: ${prize}`);
    if (prize === 50000) broadcastBigWin(user.username, user.firstName, "Gelir Çarkı", prize);
    if (prize > 0) { addPoints(user, prize); await user.save(); }
    res.json({ success: true, prize, msg, points: user.points });
});

app.post('/api/arcade/gepcoz', secureRoute, async (req, res) => {
    const { token } = req.body; const secret = process.env.HCAPTCHA_SECRET;
    if (!token || !secret) return res.json({ success: false, message: "Yapılandırma hatası." });
    try {
        const params = new URLSearchParams(); params.append('secret', secret); params.append('response', token);
        const verifyRes = await fetch('https://hcaptcha.com/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
        const data = await verifyRes.json();
        if (data.success) {
            const config = await GameConfig.findOne() || await GameConfig.create({});
            const user = await User.findOne({ telegramId: req.realTelegramId });
            const finalReward = config.gepcozReward * req.boostMult;
            addPoints(user, finalReward); await user.save();
            addRadarLog(`🔓 @${user.username} Gepçöz çözdü. (+${finalReward})`);
            res.json({ success: true, points: user.points, reward: finalReward });
        } else { res.json({ success: false, message: "Doğrulama başarısız." }); }
    } catch (e) { res.json({ success: false, message: "Sistem hatası." }); }
});

app.post('/api/arcade/predict/start', secureRoute, async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const { guess } = req.body; const cost = config.predictCost; 
    if (activePredictions.has(req.realTelegramId)) return res.json({ success: false, message: "Zaten devam eden tahminin var!" });
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP!" });
    try {
        const r1 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d1 = await r1.json(); const p1 = parseFloat(d1.price);
        activePredictions.set(req.realTelegramId, { guess, p1, startTime: Date.now() });
        res.json({ success: true, price1: p1, points: user.points });
    } catch (e) { 
        await User.updateOne({ telegramId: req.realTelegramId }, { $inc: { points: cost } }); 
        res.json({ success: false, message: "Fiyat alınamadı, iade edildi." }); 
    }
});

app.post('/api/arcade/predict/result', secureRoute, async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const prediction = activePredictions.get(req.realTelegramId);
    if (!prediction) return res.json({ success: false, message: "Aktif tahmin yok." });
    if (Date.now() - prediction.startTime < 9000) return res.json({ success: false, message: "Süre dolmadı!" });
    activePredictions.delete(req.realTelegramId);
    try {
        const r2 = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT'); 
        const d2 = await r2.json(); const p2 = parseFloat(d2.price);
        let won = false; if ((prediction.guess === 'UP' && p2 > prediction.p1) || (prediction.guess === 'DOWN' && p2 < prediction.p1)) won = true;
        let user = await User.findOne({ telegramId: req.realTelegramId });
        if (won) { addPoints(user, config.predictReward || 2000); await user.save(); }
        addRadarLog(`📈 @${user.username} Kripto Tahmini: ${won ? 'BAŞARILI' : 'BAŞARISIZ'}`);
        res.json({ success: true, won, price1: prediction.p1, price2: p2, points: user.points });
    } catch (e) { 
        let user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: config.predictCost } }, { new: true });
        res.json({ success: false, message: "Bağlantı koptu, iade edildi.", points: user.points }); 
    }
});

app.post('/api/arcade/lootbox', secureRoute, async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const { boxType } = req.body; const user = await User.findOne({ telegramId: req.realTelegramId }); if (!user) return res.json({ success: false });
    const now = new Date(); let lastOpenDate;
    if (boxType === 1) lastOpenDate = user.lastLootbox1; else if (boxType === 2) lastOpenDate = user.lastLootbox2; else if (boxType === 3) lastOpenDate = user.lastLootbox3;
    if ((now - new Date(lastOpenDate || 0)) < 24 * 60 * 60 * 1000) return res.json({ success: false });
    let cost = boxType === 1 ? config.lootbox1Cost : (boxType === 2 ? config.lootbox2Cost : config.lootbox3Cost);
    const updatedUser = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if (!updatedUser) return res.json({ success: false });
    if (boxType === 1) updatedUser.lastLootbox1 = now; else if (boxType === 2) updatedUser.lastLootbox2 = now; else updatedUser.lastLootbox3 = now;
    let prize = 0; const rand = Math.random() * 100;
    if (boxType === 1) prize = rand > 90 ? 10000 : 500; else if (boxType === 2) prize = rand > 90 ? 50000 : 3000; else prize = rand > 95 ? 250000 : 15000;
    
    let boxName = boxType === 1 ? "Standart Kapsül" : (boxType === 2 ? "Nadir Kapsül" : "Efsanevi Kapsül");
    addRadarLog(`📦 @${updatedUser.username} ${boxName} açtı. Ödül: ${prize}`);
    if ((boxType === 1 && prize === 10000) || (boxType === 2 && prize === 50000) || (boxType === 3 && prize === 250000)) broadcastBigWin(updatedUser.username, updatedUser.firstName, boxName, prize);
    
    addPoints(updatedUser, prize); await updatedUser.save();
    res.json({ success: true, prize, points: updatedUser.points });
});

app.post('/api/airdrop/list', secureRoute, async (req, res) => {
    const links = await AirdropLink.find().sort({ updatedAt: -1 }).limit(30);
    res.json({ success: true, links: links.map(l => ({ _id: l._id, username: l.username, title: l.title, description: l.description, url: l.url, hasJoined: l.joinedUsers.includes(req.realTelegramId), isOwner: l.telegramId === req.realTelegramId })) });
});

app.post('/api/airdrop/share', secureRoute, async (req, res) => {
    const config = await GameConfig.findOne() || await GameConfig.create({});
    const { title, description, url } = req.body;
    const cost = config.airdropCost; 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: cost } }, { $inc: { points: -cost } }, { new: true });
    if(!user) return res.json({success: false});
    let existing = await AirdropLink.findOne({ telegramId: req.realTelegramId });
    if (existing) { existing.title = title; existing.description = description; existing.url = url; existing.updatedAt = new Date(); await existing.save(); } 
    else { await AirdropLink.create({ telegramId: req.realTelegramId, username: user.username || user.firstName, title, description, url }); }
    addRadarLog(`📢 @${user.username} VIP Panoya ilan verdi.`);
    res.json({success: true, points: user.points, message: "Pano güncellendi!"});
});

app.post('/api/airdrop/join', secureRoute, async (req, res) => {
    const { projectId } = req.body;
    try {
        const project = await AirdropLink.findOneAndUpdate({ _id: projectId, joinedUsers: { $ne: req.realTelegramId }, telegramId: { $ne: req.realTelegramId } }, { $addToSet: { joinedUsers: req.realTelegramId } }, { new: true });
        if (!project) return res.json({ success: false });
        const user = await User.findOne({ telegramId: req.realTelegramId });
        if (user) { addPoints(user, 10000); await user.save(); return res.json({ success: true, points: user.points }); }
        res.json({ success: false });
    } catch (e) { res.json({ success: false }); }
});

app.get('/api/tasks', async (req, res) => { res.json({ tasks: await Task.find({ isActive: true }) }); });
app.get('/api/leaderboard', async (req, res) => { 
    const allTime = await User.find().sort({ points: -1 }).limit(100); 
    const weekly = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(100); 
    const lastWeek = await YesterdayWinner.find({ rank: { $gt: 0 } }).sort({ rank: 1 }); 
    res.json({ success: true, leaderboard: allTime, dailyLeaderboard: weekly, yesterdayLeaderboard: lastWeek }); 
});

app.post('/api/tasks/complete', secureRoute, async (req, res) => { 
    const { taskId } = req.body; const task = await Task.findOne({ taskId }); if (!task) return res.json({ success: false }); 
    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, completedTasks: { $ne: taskId } }, { $addToSet: { completedTasks: taskId } }, { new: true });
    if (!user) return res.json({ success: false }); 
    const finalReward = task.reward * req.boostMult; 
    addPoints(user, finalReward); await user.save(); 
    addRadarLog(`🎯 @${user.username} Görev tamamladı: ${task.title}`);
    res.json({ success: true, points: user.points }); 
});

// --- SİBER ÇÖKÜŞ (CRASH) ROTASI ---
app.post('/api/arcade/crash/start', secureRoute, async (req, res) => {
    const { bet } = req.body; 
    const amount = parseInt(bet);
    if (!amount || isNaN(amount) || amount < 100) return res.json({ success: false, message: "Minimum bahis 100 GEP." });
    
    if (activeCrashSessions.has(req.realTelegramId)) {
        return res.json({ success: false, message: "Devam eden oyununuz var!" });
    }

    const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId, points: { $gte: amount } }, { $inc: { points: -amount } }, { new: true });
    if (!user) return res.json({ success: false, message: "Yetersiz GEP bakiye!" }); 
    
    let cPoint = 1.00;
    const rand = Math.random();
    
    // %5 İhtimalle anında patlar (Kasa kârı)
    if (rand < 0.05) {
        cPoint = 1.00;
    } else {
        // Crash Matematiği
        cPoint = (1.00 / (1.00 - (Math.random() * 0.99))).toFixed(2);
        if (cPoint > 50.00) cPoint = (15.00 + Math.random() * 20.00).toFixed(2); 
    }

    activeCrashSessions.set(req.realTelegramId, { bet: amount, crashPoint: parseFloat(cPoint) });
    
    addRadarLog(`🚀 @${user.username} Çöküş oyunu başlattı. (Bahis: ${amount})`);
    res.json({ success: true, points: user.points, crashPoint: cPoint });
});

app.post('/api/arcade/crash/cashout', secureRoute, async (req, res) => {
    const session = activeCrashSessions.get(req.realTelegramId);
    if (!session) return res.json({ success: false, message: "Aktif oyun bulunamadı." });
    
    const requestedMult = parseFloat(req.body.multiplier);
    activeCrashSessions.delete(req.realTelegramId);
    
    if (requestedMult <= session.crashPoint && requestedMult >= 1.00) {
        const winAmount = Math.floor(session.bet * requestedMult);
        const user = await User.findOneAndUpdate({ telegramId: req.realTelegramId }, { $inc: { points: winAmount } }, { new: true });
        
        addRadarLog(`🪂 @${user.username} Çöküşten çekildi! Kazanç: ${winAmount} GEP (${requestedMult}x)`);
        if (winAmount >= 50000) broadcastBigWin(user.username, user.firstName, "GEP Roketi", winAmount);
        
        return res.json({ success: true, winAmount, points: user.points });
    } else {
        return res.json({ success: false, message: "Roket zaten patladı!" });
    }
});

// 🔥 YENİ: KAYIP BİLDİRİMİ (BUG FIX) 🔥
app.post('/api/arcade/crash/notify-loss', secureRoute, async (req, res) => {
    // Roket patladığında frontend buraya istek atar, sunucu oturumu temizler.
    if (activeCrashSessions.has(req.realTelegramId)) {
        activeCrashSessions.delete(req.realTelegramId);
    }
    res.json({ success: true });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sunucu aktif.`));
