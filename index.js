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

// --- DATABASE CONNECTION ---
mongoose.connect(MONGO_URI).then(() => console.log("✅ Veritabanı Bağlantısı Tamam"));

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

// --- TELEGRAM BOT ---
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
    bot.sendMessage(msg.chat.id, `🌟 *Gelir Evreni'ne Hoş Geldin!*`, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: APP_URL } }]] }
    });
  } catch (err) { console.log("Start Hatası:", err); }
});

// --- API ROUTES ---

// Otomatik Onay ve Giriş
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

    // 1 Saatlik Bekleme Kontrolü (Otomatik Puan Verme)
    const now = new Date();
    let updated = false;
    if (user.pendingTasks && user.pendingTasks.length > 0) {
        const stillPending = [];
        for (const pTask of user.pendingTasks) {
            if (now - new Date(pTask.clickedAt) >= 3600000) { // 3600000 ms = 1 Saat
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

// Görevi Başlatma
app.post("/api/tasks/start", async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && !user.completedTasks.includes(taskId) && !user.pendingTasks.find(t => t.taskId === taskId)) {
      user.pendingTasks.push({ taskId, clickedAt: new Date() });
      await user.save();
      return res.json({ success: true });
    }
    res.status(400).json({ error: "Zaten yapılıyor veya bitti" });
  } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await Task.find({ isActive: true });
  res.json({ success: true, tasks });
});

app.listen(PORT, () => console.log(`🚀 Sunucu Aktif: ${PORT}`));
