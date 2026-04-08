const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// --- CONFIG ---
const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
const APP_URL = "https://gelir-evreni.onrender.com";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- VERİTABANI ---
mongoose.connect(MONGO_URI).then(() => console.log("✅ Veritabanı Bağlantısı Başarılı"));

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
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

// --- BOT KOMUTLARI ---
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const telegramId = String(msg.from.id);
  let user = await User.findOne({ telegramId });
  if (!user) {
    await User.create({
      telegramId,
      username: msg.from.username,
      firstName: msg.from.first_name,
      inviteCode: crypto.randomBytes(3).toString('hex').toUpperCase()
    });
  }
  bot.sendMessage(msg.chat.id, `🚀 *Gelir Evreni Hazır!*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "Uygulamayı Aç", web_app: { url: APP_URL } }]] }
  });
});

// --- API ---
app.post("/api/user/auth", async (req, res) => {
  try {
    const { initData } = req.body;
    if (!initData) return res.status(400).json({ error: "No data" });
    const params = new URLSearchParams(initData);
    const tgUser = JSON.parse(params.get("user"));
    const telegramId = String(tgUser.id);

    let user = await User.findOne({ telegramId });
    
    // OTOMATİK ONAY SİSTEMİ (1 Saat kontrolü)
    const now = new Date();
    let updated = false;
    if (user && user.pendingTasks.length > 0) {
        const stillPending = [];
        for (const pTask of user.pendingTasks) {
            if (now - new Date(pTask.clickedAt) >= 3600000) { // 1 Saat doldu mu?
                const task = await Task.findOne({ taskId: pTask.taskId });
                if (task) {
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
  } catch (err) { res.status(500).json({ error: "Auth fail" }); }
});

app.post("/api/tasks/start", async (req, res) => {
  const { telegramId, taskId } = req.body;
  const user = await User.findOne({ telegramId });
  if (user && !user.pendingTasks.find(t => t.taskId === taskId)) {
    user.pendingTasks.push({ taskId, clickedAt: new Date() });
    await user.save();
    res.json({ success: true });
  } else { res.status(400).send(); }
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find({ isActive: true });
  res.json({ success: true, tasks });
});

app.listen(PORT, () => console.log(`🚀 Sunucu Aktif: ${PORT}`));
