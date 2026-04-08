const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;

const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI = "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
const APP_URL = "https://gelir-evreni.onrender.com";
const ADMIN_ID = "1469411131"; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(MONGO_URI).then(() => { seedTasks(); });

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  firstName: String,
  points: { type: Number, default: 0 },
  completedTasks: [String],
  pendingTasks: [{ taskId: String, clickedAt: { type: Date, default: Date.now } }],
  lastSpin: { type: Date, default: null }
});

const taskSchema = new mongoose.Schema({
  taskId: { type: String, unique: true },
  title: String,
  reward: Number,
  target: String, // Butonun gideceği link
  category: String,
  isActive: { type: Boolean, default: true }
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);

const seedTasks = async () => {
  await Task.updateMany({}, { $set: { isActive: false } });
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
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

bot.onText(/\/start/, async (msg) => {
  const telegramId = String(msg.from.id);
  let user = await User.findOne({ telegramId });
  if (!user) user = await User.create({ telegramId, firstName: msg.from.first_name, username: msg.from.username });
  
  bot.sendMessage(msg.chat.id, `🌟 *Gelir Evreni'ne Hoş Geldin!*`, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: APP_URL } }]] }
  });
});

app.post("/api/user/auth", async (req, res) => {
    try {
        const params = new URLSearchParams(req.body.initData);
        const tgUser = JSON.parse(params.get("user"));
        const user = await User.findOne({ telegramId: String(tgUser.id) });
        // Kullanıcıya özel referans linki oluşturma
        const refLink = `https://t.me/GelirEvreniBot?start=${tgUser.id}`;
        res.json({ success: true, user, refLink });
    } catch (e) { res.status(500).json({ error: "Auth hatası" }); }
});

app.get("/api/tasks", async (req, res) => {
    const tasks = await Task.find({ isActive: true });
    res.json({ success: true, tasks });
});

app.post("/api/spin", async (req, res) => {
    try {
        const { telegramId } = req.body;
        const user = await User.findOne({ telegramId });
        const now = new Date();
        if (user.lastSpin && now - user.lastSpin < 24 * 60 * 60 * 1000) return res.status(400).json({ error: "Günde sadece 1 kez çevirebilirsin!" });

        const rewards = [50, 100, 150, 200, 250, 500];
        const winIndex = Math.floor(Math.random() * rewards.length);
        user.points += rewards[winIndex];
        user.lastSpin = now;
        await user.save();
        res.json({ success: true, reward: rewards[winIndex], winIndex });
    } catch (err) { res.status(500).json({ error: "Hata" }); }
});

app.post("/api/withdraw", async (req, res) => {
    const { telegramId, walletAddress, amount } = req.body;
    const user = await User.findOne({ telegramId });
    if (user && user.points >= 500000) {
        bot.sendMessage(ADMIN_ID, `💰 *ÇEKİM TALEBİ*\n\n👤 Kullanıcı: ${user.firstName}\n💵 Miktar: ${amount} GEP\n🏦 Cüzdan: \`${walletAddress}\``, { parse_mode: "Markdown" });
        res.json({ success: true });
    }
});

app.listen(PORT, () => console.log(`🚀 Server Aktif: ${PORT}`));
