const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 10000;

// --- AYARLAR ---
const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
const APP_URL = "https://gelir-evreni.onrender.com";
const ADMIN_ID = "1469411131"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- VERİTABANI MODELLERİ ---
const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  firstName: String,
  points: { type: Number, default: 0 },
  completedTasks: [String], 
  lastSpin: { type: Date, default: null },
  lastMining: { type: Date, default: null },
  inviteCode: { type: String, default: null }
});

userSchema.set('strictIndex', false); 
const User = mongoose.model("User", userSchema);

const taskSchema = new mongoose.Schema({
  taskId: { type: String, unique: true },
  title: String,
  reward: Number,
  target: String,
  category: String,
  isActive: { type: Boolean, default: true }
});

const Task = mongoose.model("Task", taskSchema);

// --- GÖREVLERİ OLUŞTURMA ---
const seedTasks = async () => {
  try {
    const tasks = [
      { taskId: "tg_proje", title: "Gelir Evreni Proje Katıl", reward: 100, target: "https://t.me/gelirevreniproje", category: "Topluluğumuz" },
      { taskId: "tg_evreni", title: "Gelir Evreni Katıl", reward: 100, target: "https://t.me/gelirevreni", category: "Topluluğumuz" },
      { taskId: "tg_tayfa_ana", title: "Kripto Tayfa Sohbet", reward: 100, target: "https://t.me/kriptotayfa", category: "Topluluğumuz" },
      { taskId: "tg_ref", title: "Referans Linkim Katıl", reward: 100, target: "https://t.me/referanslinkim", category: "Topluluğumuz" },
      { taskId: "x_tayfa", title: "Kripto Tayfa X Takip", reward: 100, target: "https://x.com/kriptotayfa", category: "Topluluğumuz" }
    ];
    for (const t of tasks) {
      await Task.findOneAndUpdate({ taskId: t.taskId }, { ...t, isActive: true }, { upsert: true });
    }
    console.log("✅ Görevler güncellendi.");
  } catch (err) { console.error("Seed hatası:", err); }
};

mongoose.connect(MONGO_URI).then(() => { seedTasks(); });

// --- BOT KOMUTLARI ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  try {
    const telegramId = String(msg.from.id);
    let user = await User.findOne({ telegramId });
    if (!user) {
      user = await User.create({ 
        telegramId, 
        firstName: msg.from.first_name, 
        username: msg.from.username,
        inviteCode: `INV-${telegramId}`,
        points: 100 
      });
    }
    bot.sendMessage(msg.chat.id, `🌟 *Gelir Evreni'ne Hoş Geldin!*`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: APP_URL } }]] }
    });
  } catch (err) { console.error(err); }
});

// --- API: GÖREV ONAYLAMA ---
app.post("/api/tasks/complete", async (req, res) => {
    try {
        const { telegramId, taskId } = req.body;
        const user = await User.findOne({ telegramId });
        const task = await Task.findOne({ taskId });

        if (!user || !task) return res.status(404).json({ error: "Kayıt bulunamadı" });
        if (user.completedTasks.includes(taskId)) return res.json({ success: true, message: "Zaten yapıldı" });

        user.points += task.reward;
        user.completedTasks.push(taskId);
        await user.save();

        res.json({ success: true, newPoints: user.points });
    } catch (err) { res.status(500).json({ error: "Hata oluştu" }); }
});

// --- DİĞER APILER ---
app.get("/ping", (req, res) => res.send("Aktif"));
app.post("/api/user/auth", async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const tgUser = JSON.parse(params.get("user"));
        const user = await User.findOne({ telegramId: String(tgUser.id) });
        res.json({ success: true, user, refLink: `https://t.me/gelirevreni_bot?start=${tgUser.id}` });
    } catch (e) { res.status(500).json({ error: "Auth hatası" }); }
});

app.get("/api/tasks", async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ success: true, tasks });
});

app.post("/api/mining/claim", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.telegramId });
        user.points += 100;
        user.lastMining = new Date();
        await user.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.post("/api/spin", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.telegramId });
        const rewards = [50, 100, 150, 200, 250, 500];
        const winIndex = Math.floor(Math.random() * rewards.length);
        user.points += rewards[winIndex];
        user.lastSpin = new Date();
        await user.save();
        res.json({ success: true, reward: rewards[winIndex], winIndex });
    } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.listen(PORT, () => {
    setInterval(() => { axios.get(`${APP_URL}/ping`).catch(() => {}); }, 5 * 60 * 1000);
});
