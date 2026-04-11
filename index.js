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

mongoose.connect(mongoURI).then(() => console.log("✅ Gelir Evreni v2.5 Connected"));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
    telegramId: { type: String, unique: true },
    username: { type: String, default: '' }, 
    firstName: { type: String, default: 'Kullanıcı' }, 
    points: { type: Number, default: 1000 },
    completedTasks: { type: [String], default: [] },
    lastSpin: { type: Date, default: new Date(0) },
    lastMining: { type: Date, default: new Date(0) },
    referralCount: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastCheckin: { type: Date, default: new Date(0) },
    level: { type: String, default: 'Bronz' }
});
const User = mongoose.model('User', UserSchema);

const SettingsSchema = new mongoose.Schema({
    announcements: { type: [String], default: [] },
    miningMultiplier: { type: Number, default: 1 }
});
const Settings = mongoose.model('Settings', SettingsSchema);

async function initSettings() {
    let s = await Settings.findOne();
    if (!s) await new Settings().save();
}
initSettings();

// --- YARDIMCI FONKSİYONLAR ---
async function updateOrCreateUser(msg) {
    const telegramId = msg.from.id.toString();
    const username = msg.from.username || '';
    const firstName = msg.from.first_name || 'Kullanıcı';

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, username, firstName });
        await user.save();
        return { user, isNew: true };
    } else {
        if (user.username !== username || user.firstName !== firstName) {
            user.username = username;
            user.firstName = firstName;
            await user.save();
        }
        return { user, isNew: false };
    }
}

const calculateLevel = (points) => {
    if (points >= 1000000) return 'Elmas';
    if (points >= 500000) return 'Platin';
    if (points >= 100000) return 'Altın';
    if (points >= 25000) return 'Gümüş';
    return 'Bronz';
};

let TASKS = [
    { taskId: 'task_1', title: 'Gelir Evreni Proje Katıl', reward: 100, target: 'https://t.me/gelirevreniproje' },
    { taskId: 'task_2', title: 'Gelir Evreni Kanalına Katıl', reward: 100, target: 'https://t.me/gelirevreni' },
    { taskId: 'task_3', title: 'Kripto Tayfa Duyuru Katıl', reward: 100, target: 'https://t.me/kripto_tayfa' }
];

// --- TELEGRAM BOT MANTIĞI ---
bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const { user, isNew } = await updateOrCreateUser(msg);
    const referrerId = match[1];
    try {
        if (isNew && referrerId && referrerId !== user.telegramId) {
            const referrer = await User.findOne({ telegramId: referrerId });
            if (referrer) {
                referrer.points += 500;
                referrer.referralCount += 1;
                await referrer.save();
                bot.sendMessage(referrerId, `🎉 Yeni bir referans! ${user.firstName} katıldı. +500 GEP kazandın.`);
            }
        }
        sendWelcomeMessage(chatId);
    } catch (e) { console.error("Start Error:", e); }
});

bot.onText(/\/start$/, async (msg) => {
    const chatId = msg.chat.id;
    try {
        await updateOrCreateUser(msg);
        sendWelcomeMessage(chatId);
    } catch (e) { console.error("Start Error:", e); }
});

function sendWelcomeMessage(chatId) {
    const appUrl = `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'gelir-evreni.onrender.com'}`;
    bot.sendMessage(chatId, `🚀 *Gelir Evreni'ne Hoş Geldin!*\n\nBurada maden kazarak, görevleri yaparak ve arkadaşlarını davet ederek GEP kazanabilirsin.`, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: "Uygulamayı Aç 📱", web_app: { url: appUrl } }]
            ]
        }
    });
}

// --- API ROTLARI ---

// *** ADSGRAM S2S ÖDÜL ROTASI ***
app.get('/adsgram-reward', async (req, res) => {
    const { userid, status } = req.query;
    if (!userid) return res.status(400).send('User ID missing');
    
    // Adsgram'dan status=reward gelirse ödül ver
    if(status !== 'reward') return res.status(400).send('Invalid status');

    try {
        const user = await User.findOneAndUpdate(
            { telegramId: userid.toString() },
            { $inc: { points: 1000 } }, 
            { new: true }
        );

        if (user) {
            bot.sendMessage(userid, "📺 Reklam izleme ödülü: +1000 GEP hesabına eklendi!").catch(e => {});
            res.status(200).send('OK');
        } else {
            res.status(404).send('User not found');
        }
    } catch (err) {
        res.status(500).send('Error');
    }
});

app.post('/api/user/auth', async (req, res) => {
    const { telegramId, username, firstName } = req.body;
    if(!telegramId) return res.status(400).json({ success: false, message: "ID Eksik" });

    try {
        let user = await User.findOne({ telegramId });
        if (!user) {
            user = new User({ telegramId, username, firstName });
        } else {
            if (username) user.username = username;
            if (firstName) user.firstName = firstName;
        }
        user.level = calculateLevel(user.points);
        await user.save();

        const settings = await Settings.findOne();
        const botInfo = await bot.getMe();
        res.json({ 
            success: true, 
            user, 
            botUsername: botInfo.username, 
            isAdmin: telegramId === ADMIN_ID,
            announcements: settings ? settings.announcements : [] 
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ... (Diğer API rotaların (checkin, mine, leaderboard vb.) aynı kalabilir) ...
// Not: Kodun çok uzun olmaması için geri kalan standart rotaları buraya eklemedim, 
// mevcuttaki checkin, mine ve admin rotalarını bu kodun altına eklemeye devam edebilirsin.

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
