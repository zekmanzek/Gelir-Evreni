const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI).then(async () => {
  console.log("✅ MongoDB Bağlantısı Başarılı");
  
  // KRİTİK TEMİZLİK: Eski hatalı indexleri ve çakışan kayıtları temizle
  try {
    const db = mongoose.connection.db;
    await db.collection('users').dropIndexes(); // Tüm eski kuralları sıfırla
    await db.collection('users').deleteMany({}); // Eski hatalı test kayıtlarını sil
    console.log("🧹 Veritabanı Tertemiz Edildi!");
  } catch (e) {
    console.log("Temizlik sırasında hata (zaten boş olabilir):", e.message);
  }
});

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  firstName: String,
  points: { type: Number, default: 0 },
  completedTasks: [],
  pendingTasks: [],
  inviteCode: { type: String, unique: true }
});

const User = mongoose.model("User", userSchema);
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const telegramId = String(msg.from.id);
  try {
    const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();
    await User.create({
      telegramId,
      username: msg.from.username || "isimsiz",
      firstName: msg.from.first_name || "Kullanıcı",
      inviteCode
    });
    
    bot.sendMessage(msg.chat.id, "✅ **Sistem Sıfırlandı ve Onarıldı!**\nŞimdi her şey tıkır tıkır çalışacak. Tekrar hoş geldin!", { parse_mode: "Markdown" });
  } catch (err) {
    // Eğer kullanıcı zaten varsa (silme sonrası ilk startta)
    bot.sendMessage(msg.chat.id, "🚀 Gelir Evreni Aktif! Görevlere başlayabilirsin.");
  }
});

app.listen(PORT, () => console.log("🚀 Onarım Sunucusu Aktif"));
