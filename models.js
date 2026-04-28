const mongoose = require('mongoose');

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
    mainGroupId: { type: String, default: "" },

    // DİNAMİK GRUP YÖNETİM AYARLARI
    isWelcomeEnabled: { type: Boolean, default: true },
    welcomeMessage: { type: String, default: "🌟 **Siber Ağ'a Hoş Geldin {isim}!**\n\n💎 **GELİR EVRENİ (GEP) SİSTEM ÖZETİ** 💎\n\n⛏️ **Maden:** 4 saatte bir uygulamaya girip GEP topla.\n📢 **Benim Projem:** Kendi projeni 1M GEP'e yayınla veya başkalarının projelerine katılıp anında **+10.000 GEP** kazan.\n🎮 **Oyunlar:** Kripto Kahini (Tahmin), Gelir Çarkı ve Gelir Kapsülleri ile GEP'lerini katla.\n💬 **Chat-Kazan:** Bu grupta sohbet ettikçe arka planda otomatik GEP kazanırsın.\n⚔️ **Etkileşim:** `/duello`, `/zar` ve `/bahsis` komutlarıyla grupta diğerleriyle kapış.\n🎁 **Siber Drop:** Saatte bir rastgele gruba düşen 25.000 GEP'i ilk tıklayan kapar!\n🎫 **Promokod:** Bilet şifrelerini yakalayıp sürpriz ödülleri aç.\n👥 **Davet Et:** Profil sekmesindeki linkinle gelen her arkadaşın için ikiniz de anında **10.000 GEP** kazanırsınız." },
    isChatEarnEnabled: { type: Boolean, default: true },
    chatEarnMin: { type: Number, default: 2 },
    chatEarnMax: { type: Number, default: 10 },
    isDiceEnabled: { type: Boolean, default: true },
    isDuelEnabled: { type: Boolean, default: true },
    autoReplies: { type: Map, of: String, default: {} }
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

module.exports = { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink };
