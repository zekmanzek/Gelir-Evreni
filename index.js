const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// MongoDB bağlantısı
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=>console.log("✅ Premium DB Connected Successfully"))
  .catch(err=>console.error("DB Error:", err));

// User modeli
const UserSchema = new mongoose.Schema({
  telegramId: String,
  name: String,
  points: { type: Number, default: 0 },
  completedTasks: { type: [String], default: [] }
});
const User = mongoose.model('User', UserSchema);

// Auth endpoint
app.post('/api/user/auth', async (req,res)=>{
  const { telegramId } = req.body;
  let user = await User.findOne({ telegramId });
  if(!user){
    user = new User({ telegramId, name: "Anonim", points: 0 });
    await user.save();
  }
  res.json({ success:true, user });
});

// Leaderboard endpoint
app.get('/api/leaderboard', async (req,res)=>{
  try {
    const topUsers = await User.find({})
      .sort({ points: -1 })
      .limit(10)
      .select('telegramId name points');
    res.json({ success:true, leaderboard: topUsers });
  } catch(err){
    res.status(500).json({ success:false, error:"Server error" });
  }
});

// Sponsor endpoint (statik örnek)
app.get('/api/sponsors', (req,res)=>{
  res.json({
    success:true,
    sponsors:[
      { name:"Sponsor A", message:"🔥 Büyük Kampanya" },
      { name:"Sponsor B", message:"💎 Premium Fırsatlar" }
    ]
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, ()=>console.log(`🚀 Premium Server is active on port ${PORT}`));
