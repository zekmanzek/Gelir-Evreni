const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const BOT_TOKEN = "8565484624:AAEVI0-SFA278gHAX528uREvAb93pc8yJ3s";
const MONGO_URI =
  "mongodb+srv://mzybro_db_user:RrdTszJxirbFhHfm@zekman.bi8ty3t.mongodb.net/GelirEvreni?retryWrites=true&w=majority";
const APP_URL = "https://gelir-evreni.onrender.com";
const ADMIN_IDS = []; // Telegram admin user ID'lerini buraya ekle: [123456789]

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── MONGODB SCHEMAS ──────────────────────────────────────────────────────────
mongoose.connect(MONGO_URI);

const userSchema = new mongoose.Schema({
  telegramId: { type: String, unique: true, required: true },
  username: String,
  firstName: String,
  lastName: String,
  points: { type: Number, default: 0 },
  inviteCode: { type: String, unique: true },
  invitedBy: String,
  inviteCount: { type: Number, default: 0 },
  completedTasks: [String],
  createdAt: { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema({
  taskId: { type: String, unique: true },
  title: String,
  description: String,
  reward: Number,
  type: { type: String, enum: ["channel", "group", "link", "social"], default: "link" },
  target: String, // kanal/grup username veya URL
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const withdrawSchema = new mongoose.Schema({
  telegramId: String,
  username: String,
  points: Number,
  usdtAmount: Number,
  walletAddress: String,
  network: { type: String, default: "BEP20" },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  adminNote: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date,
});

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const Withdraw = mongoose.model("Withdraw", withdrawSchema);

// ─── TELEGRAM BOT ─────────────────────────────────────────────────────────────
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function generateInviteCode(telegramId) {
  return crypto.createHash("md5").update(telegramId + Date.now()).digest("hex").slice(0, 8).toUpperCase();
}

function validateTelegramData(initData) {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get("hash");
    urlParams.delete("hash");

    const dataCheckString = [...urlParams.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => `${key}=${val}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const expectedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    return hash === expectedHash;
  } catch {
    return false;
  }
}

// /start komutu
bot.onText(/\/start(.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const telegramId = String(msg.from.id);
  const referralCode = match[1]?.trim();

  try {
    let user = await User.findOne({ telegramId });

    if (!user) {
      const inviteCode = generateInviteCode(telegramId);
      let invitedBy = null;
      let bonusPoints = 0;

      if (referralCode && referralCode !== inviteCode) {
        const referrer = await User.findOne({ inviteCode: referralCode });
        if (referrer) {
          invitedBy = referrer.telegramId;
          referrer.points += 500;
          referrer.inviteCount += 1;
          await referrer.save();
          bonusPoints = 250;

          // Referrer'a bildirim
          bot.sendMessage(referrer.telegramId, `🎉 Davetinle yeni bir kullanıcı katıldı! +500 puan kazandın!`);
        }
      }

      user = await User.create({
        telegramId,
        username: msg.from.username,
        firstName: msg.from.first_name,
        lastName: msg.from.last_name,
        inviteCode,
        invitedBy,
        points: bonusPoints,
      });
    }

    const keyboard = {
      inline_keyboard: [
        [{ text: "🚀 Mini App'i Aç", web_app: { url: APP_URL } }],
        [{ text: "👥 Arkadaşını Davet Et", callback_data: "invite" }],
        [{ text: "📋 Görevler", callback_data: "tasks" }],
      ],
    };

    bot.sendMessage(
      chatId,
      `🌟 *Gelir Evreni'ne Hoş Geldin!*\n\n` +
        `Merhaba ${msg.from.first_name}! 👋\n\n` +
        `💰 Puanların: *${user.points}*\n` +
        `👥 Davet Ettiğin: *${user.inviteCount}* kişi\n\n` +
        `Görevleri tamamla, arkadaşlarını davet et ve puan kazan!`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  } catch (err) {
    console.error("Start error:", err);
    bot.sendMessage(chatId, "Bir hata oluştu, tekrar dene.");
  }
});

// Callback query handler
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const telegramId = String(query.from.id);

  if (query.data === "invite") {
    const user = await User.findOne({ telegramId });
    if (user) {
      const inviteLink = `https://t.me/GelirEvreniBot?start=${user.inviteCode}`;
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(
        chatId,
        `🔗 *Davet Linkin:*\n\n${inviteLink}\n\n` +
          `✅ Her davet için *500 puan* kazanırsın!\n` +
          `✅ Arkadaşın da *250 puan* bonus alır!`,
        { parse_mode: "Markdown" }
      );
    }
  }

  if (query.data === "tasks") {
    const tasks = await Task.find({ isActive: true }).limit(5);
    if (tasks.length === 0) {
      bot.answerCallbackQuery(query.id, { text: "Henüz görev yok." });
      return;
    }
    let msg = "📋 *Aktif Görevler:*\n\n";
    tasks.forEach((t) => {
      msg += `• *${t.title}* — +${t.reward} puan\n`;
    });
    msg += "\nGörevleri tamamlamak için Mini App'i aç!";
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, msg, { parse_mode: "Markdown" });
  }
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// Kullanıcı kaydı / girişi
app.post("/api/user/auth", async (req, res) => {
  try {
    const { initData } = req.body;

    // Geliştirme ortamında validasyonu esnet
    let telegramUser;
    try {
      const params = new URLSearchParams(initData);
      telegramUser = JSON.parse(params.get("user"));
    } catch {
      return res.status(400).json({ error: "Geçersiz veri" });
    }

    const telegramId = String(telegramUser.id);
    let user = await User.findOne({ telegramId });

    if (!user) {
      const inviteCode = generateInviteCode(telegramId);
      user = await User.create({
        telegramId,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        inviteCode,
        points: 0,
      });
    } else {
      user.username = telegramUser.username;
      user.firstName = telegramUser.first_name;
      await user.save();
    }

    res.json({
      success: true,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        points: user.points,
        inviteCode: user.inviteCode,
        inviteCount: user.inviteCount,
        completedTasks: user.completedTasks,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Kullanıcı bilgisi getir
app.get("/api/user/:telegramId", async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.params.telegramId });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Görevleri getir
app.get("/api/tasks", async (req, res) => {
  try {
    const tasks = await Task.find({ isActive: true }).sort({ createdAt: -1 });
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Görev tamamla
app.post("/api/tasks/complete", async (req, res) => {
  try {
    const { telegramId, taskId } = req.body;

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    if (user.completedTasks.includes(taskId)) {
      return res.status(400).json({ error: "Bu görev zaten tamamlandı" });
    }

    const task = await Task.findOne({ taskId, isActive: true });
    if (!task) return res.status(404).json({ error: "Görev bulunamadı" });

    user.completedTasks.push(taskId);
    user.points += task.reward;
    await user.save();

    res.json({ success: true, points: user.points, earned: task.reward });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Liderlik tablosu
app.get("/api/leaderboard", async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ points: -1 })
      .limit(50)
      .select("telegramId username firstName points inviteCount");
    res.json({ success: true, leaderboard: users });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Davet bilgisi
app.get("/api/invite/:telegramId", async (req, res) => {
  try {
    const user = await User.findOne({ telegramId: req.params.telegramId });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const invitedUsers = await User.find({ invitedBy: req.params.telegramId })
      .select("firstName username points createdAt")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      inviteCode: user.inviteCode,
      inviteLink: `https://t.me/GelirEvreniBot?start=${user.inviteCode}`,
      inviteCount: user.inviteCount,
      invitedUsers,
    });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Çekim talebi oluştur
app.post("/api/withdraw", async (req, res) => {
  try {
    const { telegramId, points, walletAddress } = req.body;

    if (!walletAddress || walletAddress.length < 10) {
      return res.status(400).json({ error: "Geçerli bir BEP20 cüzdan adresi girin" });
    }

    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

    const MIN_WITHDRAW = 1000;
    if (points < MIN_WITHDRAW) {
      return res.status(400).json({ error: `Minimum çekim ${MIN_WITHDRAW} puandır` });
    }

    if (user.points < points) {
      return res.status(400).json({ error: "Yetersiz puan" });
    }

    // 1000 puan = 1 USDT (oranı istediğin gibi ayarla)
    const POINTS_PER_USDT = 1000;
    const usdtAmount = parseFloat((points / POINTS_PER_USDT).toFixed(2));

    // Puan düş
    user.points -= points;
    await user.save();

    const withdraw = await Withdraw.create({
      telegramId,
      username: user.username,
      points,
      usdtAmount,
      walletAddress,
      network: "BEP20",
    });

    // Adminlere bildirim gönder
    const adminMsg =
      `💸 *Yeni Çekim Talebi!*\n\n` +
      `👤 Kullanıcı: @${user.username || user.firstName}\n` +
      `🆔 ID: ${telegramId}\n` +
      `💰 Puan: ${points}\n` +
      `💵 USDT: ${usdtAmount}\n` +
      `🔗 Adres (BEP20): \`${walletAddress}\`\n\n` +
      `📋 Talep ID: ${withdraw._id}`;

    ADMIN_IDS.forEach((adminId) => {
      bot.sendMessage(adminId, adminMsg, { parse_mode: "Markdown" });
    });

    res.json({
      success: true,
      message: "Çekim talebiniz alındı. 24-48 saat içinde işleme alınacaktır.",
      withdraw: {
        id: withdraw._id,
        points,
        usdtAmount,
        walletAddress,
        status: "pending",
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Çekim geçmişi
app.get("/api/withdraw/:telegramId", async (req, res) => {
  try {
    const withdrawals = await Withdraw.find({ telegramId: req.params.telegramId })
      .sort({ createdAt: -1 })
      .limit(20);
    res.json({ success: true, withdrawals });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Admin: çekim güncelle
app.post("/api/admin/withdraw/update", async (req, res) => {
  try {
    const { adminId, withdrawId, status, adminNote } = req.body;

    if (!ADMIN_IDS.includes(Number(adminId))) {
      return res.status(403).json({ error: "Yetkisiz" });
    }

    const withdraw = await Withdraw.findByIdAndUpdate(
      withdrawId,
      { status, adminNote, updatedAt: new Date() },
      { new: true }
    );

    if (!withdraw) return res.status(404).json({ error: "Talep bulunamadı" });

    // Kullanıcıya bildir
    const statusText = status === "approved" ? "✅ Onaylandı" : "❌ Reddedildi";
    bot.sendMessage(
      withdraw.telegramId,
      `💸 *Çekim Talebiniz ${statusText}!*\n\n` +
        `💰 Miktar: ${withdraw.usdtAmount} USDT\n` +
        `${adminNote ? `📝 Not: ${adminNote}` : ""}`,
      { parse_mode: "Markdown" }
    );

    // Reddedildiyse puanları iade et
    if (status === "rejected") {
      await User.findOneAndUpdate(
        { telegramId: withdraw.telegramId },
        { $inc: { points: withdraw.points } }
      );
    }

    res.json({ success: true, withdraw });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Admin: görev ekle
app.post("/api/admin/tasks", async (req, res) => {
  try {
    const { adminId, title, description, reward, type, target } = req.body;

    if (!ADMIN_IDS.includes(Number(adminId))) {
      return res.status(403).json({ error: "Yetkisiz" });
    }

    const taskId = crypto.randomBytes(8).toString("hex");
    const task = await Task.create({ taskId, title, description, reward, type, target });
    res.json({ success: true, task });
  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası" });
  }
});

// Başlangıç görevleri ekle (sadece bir kez çalışır)
async function seedTasks() {
  const count = await Task.countDocuments();
  if (count > 0) return;

  await Task.insertMany([
    {
      taskId: "task_telegram_channel",
      title: "Telegram Kanalımıza Katıl",
      description: "Resmi kanalımıza katılarak haberleri takip et",
      reward: 300,
      type: "channel",
      target: "https://t.me/GelirEvreni",
    },
    {
      taskId: "task_telegram_group",
      title: "Telegram Grubuna Katıl",
      description: "Topluluk grubuna katıl ve diğer üyelerle tanış",
      reward: 200,
      type: "group",
      target: "https://t.me/GelirEvreniGrup",
    },
    {
      taskId: "task_share",
      title: "Botu Paylaş",
      description: "Botu sosyal medyada paylaş",
      reward: 150,
      type: "social",
      target: "",
    },
    {
      taskId: "task_daily",
      title: "Günlük Giriş Bonusu",
      description: "Her gün giriş yaparak bonus puan kazan",
      reward: 50,
      type: "link",
      target: "",
    },
  ]);

  console.log("Başlangıç görevleri eklendi.");
}

app.listen(PORT, async () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor`);
  await seedTasks();
});
