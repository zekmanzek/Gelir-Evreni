const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
const APP_URL = "https://gelir-evreni.onrender.com";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── VERİTABANI BAĞLANTISI ────────────────────────────────────────────────────
mongoose.connect(MONGO_URI).then(() => {
    console.log("✅ MongoDB Bağlantısı Başarılı");
    seedTasks(); // Görevleri her başlangıçta kontrol et/ekle
});

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  firstName: String,
  points: { type: Number, default: 0 },
  completedTasks: [String],
  pendingTasks: [{ taskId: String, clickedAt: { type: Date, default: Date.now } }],
  inviteCode: { type: String, unique: true }
});

const taskSchema = new mongoose.Schema({
  taskId: { type: String, unique: true },
  title: String,
  reward: Number,
  target: String,
  category: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

// ─── GÖREVLERİ YAPILANDIRMA (PAKET SİSTEMİ) ──────────────────────────────────
const seedTasks = async () => {
  const tasks = [
    // --- TOPLULUĞUMUZ (100 GEP) ---
    { taskId: "tg_proje", title: "Gelir Evreni Proje Katıl", reward: 100, target: "https://t.me/gelirevreniproje", category: "Topluluğumuz" },
    { taskId: "tg_evreni", title: "Gelir Evreni Katıl", reward: 100, target: "https://t.me/gelirevreni", category: "Topluluğumuz" },
    { taskId: "tg_tayfa_alt", title: "Kripto Tayfa Duyuru", reward: 100, target: "https://t.me/kripto_tayfa", category: "Topluluğumuz" },
    { taskId: "tg_tayfa_ana", title: "Kripto Tayfa Sohbet", reward: 100, target: "https://t.me/kriptotayfa", category: "Topluluğumuz" },
    { taskId: "tg_ref", title: "Referans Linkim Katıl", reward: 100, target: "https://t.me/referanslinkim", category: "Topluluğumuz" },
    { taskId: "x_tayfa", title: "Kripto Tayfa X Takip", reward: 100, target: "https://x.com/kriptotayfa", category: "Topluluğumuz" },

    // --- AİRDROPLAR (YAKINDA) ---
    { taskId: "airdrop_soon", title: "Yeni Airdroplar (Yakında)", reward: 0, target: "#", category: "Airdroplar", isActive: false },

    // --- SÜRPRİZ GÖREVLER (YAKINDA) ---
    { taskId: "surprise_soon", title: "Sürpriz Görevler (Yakında)", reward: 0, target: "#", category: "Sürpriz Görevler", isActive: false }
  ];

  for (const t of tasks) {
    await Task.findOneAndUpdate({ taskId: t.taskId }, t, { upsert: true });
  }
  console.log("✅ Görev Paketleri Güncellendi");
};

// ─── TELEGRAM BOT ─────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const telegramId = String(msg.from.id);
  try {
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({
        telegramId,
        username: msg.from.username,
        firstName: msg.from.first_name,
        inviteCode: crypto.randomBytes(3).toString('hex').toUpperCase()
      });
    }
    bot.sendMessage(msg.chat.id, `🌟 *Gelir Evreni'ne Hoş Geldin!* \n\nTopluluğumuza katıl, görevleri yap ve GEP kazan!`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: APP_URL } }]] }
    });
  } catch (err) { console.log("Start Hatası:", err); }
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.post("/api/user/auth", async (req, res) => {
  try {
    const { initData } = req.body;
    const params = new URLSearchParams(initData);
    const tgUser = JSON.parse(params.get("user"));
    const telegramId = String(tgUser.id);

    let user = await User.findOne({ telegramId });
    if (!user) {
        user = await User.create({ 
          telegramId, 
          firstName: tgUser.first_name, 
          username: tgUser.username, 
          inviteCode: crypto.randomBytes(3).toString('hex').toUpperCase() 
        });
    }

    // 1 Saatlik Otomatik Puan Onayı
    const now = new Date();
    let updated = false;
    if (user.pendingTasks && user.pendingTasks.length > 0) {
        const stillPending = [];
        for (const pTask of user.pendingTasks) {
            if (now - new Date(pTask.clickedAt) >= 3600000) { 
                const task = await Task.findOne({ taskId: pTask.taskId });
                if (task && !user.completedTasks.includes(pTask.taskId)) {
                    user.points += task.reward;
                    user.completedTasks.push(pTask.taskId);
                    updated = true;
                }
            } else { stillPending.push(pTask); }
        }
        user.pendingTasks = stillPending;
        if (updated) await user.save();
    }
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ error: "Auth hatası" }); }
});

app.post("/api/tasks/start", async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && !user.completedTasks.includes(taskId) && !user.pendingTasks.find(t => t.taskId === taskId)) {
      user.pendingTasks.push({ taskId, clickedAt: new Date() });
      await user.save();
      return res.json({ success: true });
    }
    res.status(400).json({ error: "Zaten yapılıyor" });
  } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find({ isActive: true });
  res.json({ success: true, tasks });
});

app.listen(PORT, () => console.log(`🚀 Sunucu Aktif: ${PORT}`));
