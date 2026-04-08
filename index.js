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
const ADMIN_ID = "1469411131"; // MEHMET GÜNCEL ADMIN ID

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── VERİTABANI BAĞLANTISI ────────────────────────────────────────────────────
mongoose.connect(MONGO_URI).then(() => {
    console.log("✅ MongoDB Bağlantısı Başarılı");
    seedTasks(); 
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

// ─── GÖREV PAKETLERİ ──────────────────────────────────────────────────────────
const seedTasks = async () => {
  await Task.updateMany({}, { $set: { isActive: false } });
  const tasks = [
    { taskId: "tg_proje", title: "Gelir Evreni Proje Katıl", reward: 100, target: "https://t.me/gelirevreniproje", category: "Topluluğumuz" },
    { taskId: "tg_evreni", title: "Gelir Evreni Katıl", reward: 100, target: "https://t.me/gelirevreni", category: "Topluluğumuz" },
    { taskId: "tg_tayfa_ana", title: "Kripto Tayfa Sohbet", reward: 100, target: "https://t.me/kriptotayfa", category: "Topluluğumuz" },
    { taskId: "tg_ref", title: "Referans Linkim Katıl", reward: 100, target: "https://t.me/referanslinkim", category: "Topluluğumuz" },
    { taskId: "x_tayfa", title: "Kripto Tayfa X Takip", reward: 100, target: "https://x.com/kriptotayfa", category: "Topluluğumuz" },
    { taskId: "start_soon", title: "Yeni Görevler Yakında", reward: 0, target: "#", category: "Başlangıç Görevleri" },
    { taskId: "airdrop_soon", title: "Yeni Airdrop Çok Yakında", reward: 0, target: "#", category: "Airdroplar" },
    { taskId: "surprise_soon", title: "Sürpriz Görev Yolda", reward: 0, target: "#", category: "Sürpriz Görevler" }
  ];
  for (const t of tasks) {
    await Task.findOneAndUpdate({ taskId: t.taskId }, { ...t, isActive: true }, { upsert: true });
  }
};

// ─── API VE ÇEKİM SİSTEMİ ─────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

app.post("/api/withdraw", async (req, res) => {
    try {
        const { telegramId, walletAddress, amount } = req.body;
        const user = await User.findOne({ telegramId });

        if (!user || user.points < 500000) {
            return res.status(400).json({ error: "Yetersiz bakiye" });
        }

        const message = `💰 *YENİ ÇEKİM TALEBİ*\n\n👤 Kullanıcı: ${user.firstName}\n🆔 ID: ${user.telegramId}\n💵 Miktar: ${amount} GEP\n🏦 Cüzdan: \`${walletAddress}\``;
        bot.sendMessage(ADMIN_ID, message, { parse_mode: "Markdown" });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.post("/api/user/auth", async (req, res) => {
    const { initData } = req.body;
    const params = new URLSearchParams(initData);
    const tgUser = JSON.parse(params.get("user"));
    const telegramId = String(tgUser.id);
    let user = await User.findOne({ telegramId });
    if (!user) user = await User.create({ telegramId, firstName: tgUser.first_name, username: tgUser.username, inviteCode: crypto.randomBytes(3).toString('hex').toUpperCase() });
    res.json({ success: true, user });
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find({ isActive: true });
  res.json({ success: true, tasks });
});

app.listen(PORT, () => console.log(`🚀 Aktif: ${PORT}`));
