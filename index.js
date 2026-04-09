const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log("MongoDB Bağlantısı Başarılı"))
  .catch(err => console.error("Bağlantı Hatası:", err));

// Kullanıcı Modeli
const userSchema = new mongoose.Schema({
    telegramId: String,
    username: String,
    points: { type: Number, default: 0 },
    lastMining: Date,
    lastSpin: Date, // Çark takibi için eklendi
    completedTasks: [String]
});
const User = mongoose.model('User', userSchema);

// Görev Listesi
const tasks = [
    { taskId: "t1", category: "Topluluğumuz", title: "Gelir Evreni Proje Katıl", reward: 100, target: "https://t.me/gelirevreni" },
    { taskId: "t2", category: "Topluluğumuz", title: "Gelir Evreni Katıl", reward: 100, target: "https://t.me/gelirevreni" },
    { taskId: "t3", category: "Topluluğumuz", title: "Kripto Tayfa Sohbet", reward: 100, target: "https://t.me/kripto_tayfa" },
    { taskId: "t4", category: "Topluluğumuz", title: "Referans Linkim Katıl", reward: 100, target: "https://t.me/gelirevreni" },
    { taskId: "t5", category: "Topluluğumuz", title: "Kripto Tayfa X Takip", reward: 100, target: "https://x.com/kriptotayfa" }
];

// --- API UÇLARI ---

app.post("/api/user/auth", async (req, res) => {
    const { initData } = req.body;
    // Basit auth simülasyonu (Gerçek senaryoda initData doğrulanmalıdır)
    const telegramId = "1469411131"; // Test için sabitlendi
    let user = await User.findOne({ telegramId });
    if (!user) {
        user = new User({ telegramId, username: "Kullanıcı", points: 1200 });
        await user.save();
    }
    res.json({ user, refLink: `https://t.me/gelirevreni_bot?start=${telegramId}` });
});

app.get("/api/tasks", (req, res) => res.json({ tasks }));

app.post("/api/tasks/complete", async (req, res) => {
    const { telegramId, taskId } = req.body;
    const user = await User.findOne({ telegramId });
    const task = tasks.find(t => t.taskId === taskId);
    if (user && task && !user.completedTasks.includes(taskId)) {
        user.completedTasks.push(taskId);
        user.points += task.reward;
        await user.save();
        return res.json({ success: true });
    }
    res.json({ success: false });
});

// GÜNCELLENEN ÇARK API (24 Saat Kilidi)
app.post("/api/spin", async (req, res) => {
    try {
        const user = await User.findOne({ telegramId: req.body.telegramId });
        if (!user) return res.status(404).json({ error: "Kullanıcı bulunamadı" });

        const now = new Date();
        if (user.lastSpin) {
            const diff = now - new Date(user.lastSpin);
            const hoursLeft = 24 - (diff / (1000 * 60 * 60));
            if (hoursLeft > 0) {
                return res.json({ 
                    success: false, 
                    error: `Günde sadece 1 kez çevirebilirsin! Kalan süre: ${Math.ceil(hoursLeft)} saat.` 
                });
            }
        }

        const rewards = [50, 100, 150, 200, 250, 500];
        const winIndex = Math.floor(Math.random() * rewards.length);
        user.points += rewards[winIndex];
        user.lastSpin = now;
        await user.save();
        res.json({ success: true, reward: rewards[winIndex], winIndex });
    } catch (err) {
        res.status(500).json({ error: "Hata" });
    }
});

app.post("/api/mining/claim", async (req, res) => {
    const user = await User.findOne({ telegramId: req.body.telegramId });
    user.points += 100;
    user.lastMining = new Date();
    await user.save();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server ${PORT} üzerinde çalışıyor`));
