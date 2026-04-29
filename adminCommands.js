// adminCommands.js
// SİBER KARARGAH - YÖNETİCİ KOMUT MERKEZİ (MODÜLER MİMARİ)

module.exports = function(context) {
    const { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog } = context;
    const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

    // --- YARDIMCI MESAJ FONKSİYONU ---
    const sendMsg = (text, markup = null) => {
        const options = { parse_mode: 'Markdown' };
        if (markup) options.reply_markup = markup;
        return bot.sendMessage(ADMIN_ID, text, options);
    };

    bot.on('message', async (msg) => {
        if (!msg.text || msg.from.id.toString() !== ADMIN_ID) return;

        const args = msg.text.split(' ');
        const cmd = args[0].toLowerCase();

        try {
            // 🧭 KOMUT YÖNLENDİRİCİ (ROUTER)
            switch (cmd) {
                // ==========================================
                // ⚙️ SİSTEM VE GÜVENLİK
                // ==========================================
                case '/admin':   return await showAdminMenu();
                case '/kilit':   return await handleLockdown(args);
                case '/rapor':   return await showReport();
                case '/radar':   return await showRadar();

                // ==========================================
                // 💰 EKONOMİ VE OYUN AYARLARI
                // ==========================================
                case '/boost':   return await handleBoost(args);
                case '/ayar':    return await handleSettings(args);
                case '/promo':   return await handlePromoCode(args);

                // ==========================================
                // 👥 KULLANICI VE CEZA YÖNETİMİ
                // ==========================================
                case '/bilgi':   return await showUserInfo(args);
                case '/canta':   return await showUserInventory(args);
                case '/bakiye':  return await adjustBalance(args);
                case '/ceza':    return await executePenalty(args);
                case '/ban':     return await toggleBan(args, true);
                case '/unban':   return await toggleBan(args, false);
                case '/odemelist': return await showWithdrawalList();

                // ==========================================
                // 📢 İLETİŞİM VE GÖREVLER
                // ==========================================
                case '/yayin':   return await broadcastMessage(msg.text);
                case '/duyuru':  return await manageAnnouncements(args, msg.text);
                case '/gorev':   return await manageTasks(args);

                default:
                    // Bilinmeyen komutlar sessizce yoksayılır
                    break;
            }
        } catch (error) {
            sendMsg(`❌ Sistem Hatası: ${error.message}`);
        }
    });

    // =====================================================================
    // 🛠️ İŞLEVSEL FONKSİYONLAR (HER KOMUTUN KENDİ ODASI)
    // =====================================================================

    async function showAdminMenu() {
        const text = `🛡️ **SİBER KOMUTA MERKEZİ (MASTER)**\n\n` +
        `🚨 *ACİL DURUM KONTROLLERİ:*\n` +
        `\`/kilit aktif\` | \`/kilit kapat\`\n\n` +
        `💸 *EKONOMİ & PROMOSYON:*\n` +
        `\`/boost Çarpan Dakika\` (Örn: /boost 2 60)\n` +
        `\`/ayar [oyun] [fiyat]\` (Örn: /ayar cark 10000)\n` +
        `\`/promo KOD Ödül Limit\`\n\n` +
        `📢 *İLETİŞİM & SİSTEM GÖREVLERİ:*\n` +
        `\`/yayin Mesaj\` (Tüm ağa butonlu mesaj)\n` +
        `\`/duyuru ekle/sil/liste\` (Kayan Yazı)\n` +
        `\`/gorev ekle/sil/liste\` (Görev Merkezi)\n\n` +
        `👤 *İSTİHBARAT, CEZA VE ÖDEME:*\n` +
        `\`/radar\` (Ağdaki son 20 canlı işlem)\n` +
        `\`/bilgi @user\` (Temel İstihbarat)\n` +
        `\`/canta @user\` (Derin Röntgen / Loglar)\n` +
        `\`/bakiye @user Miktar\` (GEP Ekle/Sil)\n` +
        `\`/ceza @user\` (Bakiyeyi Sıfırla)\n` +
        `\`/ban @user\` | \`/unban @user\`\n` +
        `\`/odemelist\` (Kazanan Cüzdanlar)\n\n` +
        `📊 \`/rapor\` (Genel Sistem Durumu)`;
        return sendMsg(text);
    }

    async function handleLockdown(args) {
        let config = await GameConfig.findOne() || await GameConfig.create({});
        if (args[1] === 'aktif') { 
            config.isLocked = true; await config.save(); 
            return sendMsg(`🚨 **SİSTEM KİLİTLENDİ!** Oyuncuların ekranı karartıldı.`); 
        }
        if (args[1] === 'kapat') { 
            config.isLocked = false; await config.save(); 
            return sendMsg(`✅ **KİLİT AÇILDI!** Sistem normale döndü.`); 
        }
    }

    async function handleBoost(args) {
        const mult = parseFloat(args[1]); const mins = parseInt(args[2]);
        if (!mult || isNaN(mins)) return sendMsg("❌ Format: /boost [Çarpan] [Dakika]");
        let config = await GameConfig.findOne() || await GameConfig.create({});
        config.boostMultiplier = mult; 
        config.boostEndTime = new Date(Date.now() + mins * 60000); 
        await config.save();
        sendMsg(`🔥 **HAPPY HOUR AKTİF!** Çarpan: ${mult}x | Süre: ${mins} Dk`);
        
        const users = await User.find({ telegramId: { $exists: true } });
        users.forEach(u => { 
            bot.sendMessage(u.telegramId, `🔥 **SİBER ETKİNLİK BAŞLADI!**\n\nÖnümüzdeki ${mins} dakika boyunca sistemdeki maden, görev ve Gepçöz kazançları tam **${mult} KATINA** çıkarıldı! Fırsatı kaçırma! 👇`, { reply_markup: { inline_keyboard: [[{ text: "🚀 2X KAZAN", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}); 
        });
    }

    async function showRadar() {
        if (radarLogs.length === 0) return sendMsg("📡 Radar şu an boş. Hareket yok.");
        return sendMsg(`📡 **CANLI SİBER RADAR (Son 20 İşlem)**\n\n` + radarLogs.join('\n'));
    }

    async function showUserInfo(args) {
        const target = args[1]?.replace('@', '');
        if (!target) return sendMsg("❌ Kullanıcı adı girin.");
        const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
        if (!u) return sendMsg("❌ Kullanıcı bulunamadı.");
        return sendMsg(`👤 **İstihbarat:** @${u.username || "Yok"} (ID: ${u.telegramId})\n💰 **Bakiye:** ${u.points.toLocaleString()} GEP\n🏆 **Davet:** ${u.referralCount || 0} Kişi\n⚠️ **Ban Durumu:** ${u.isBanned ? 'Evet' : 'Hayır'}\n👛 **Cüzdan:** ${u.walletAddress ? 'Bağlı' : 'Bağlı Değil'}`);
    }

    async function showUserInventory(args) {
        const target = args[1]?.replace('@', '');
        if (!target) return sendMsg("❌ Kullanıcı adı girin.");
        const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
        if (!u) return sendMsg("❌ Kullanıcı bulunamadı.");
        const info = `🩻 **DERİN X-RAY:** @${u.username || "Gizli"} (${u.telegramId})\n\n` +
        `💰 **Bakiye:** ${u.points.toLocaleString()}\n` +
        `📈 **Günlük Seri:** ${u.streak} Gün (Son: ${new Date(u.lastCheckin).toLocaleString('tr-TR')})\n` +
        `⛏️ **Son Maden:** ${new Date(u.lastMining).toLocaleString('tr-TR')}\n` +
        `📦 **Kutu 1:** ${new Date(u.lastLootbox1 || 0).toLocaleString('tr-TR')}\n` +
        `📦 **Kutu 2:** ${new Date(u.lastLootbox2 || 0).toLocaleString('tr-TR')}\n` +
        `📦 **Kutu 3:** ${new Date(u.lastLootbox3 || 0).toLocaleString('tr-TR')}\n` +
        `👛 **Cüzdan:** \`${u.walletAddress || 'Yok'}\``;
        return sendMsg(info);
    }

    async function adjustBalance(args) {
        const target = args[1]?.replace('@', ''); const amount = parseInt(args[2]);
        if (!target || isNaN(amount)) return sendMsg("❌ Format: /bakiye @kullaniciadi miktar");
        const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
        if (!u) return sendMsg("❌ Kullanıcı bulunamadı.");
        addPoints(u, amount); await u.save();
        return sendMsg(`✅ @${u.username} hesabına müdahale edildi. Yeni Bakiye: ${u.points.toLocaleString()} GEP`);
    }

    async function executePenalty(args) {
        const target = args[1]?.replace('@', '');
        if (!target) return sendMsg("❌ Kullanıcı adı girin.");
        const u = await User.findOne({ $or: [{ username: target.toLowerCase() }, { telegramId: target }] });
        if (!u) return sendMsg("❌ Kullanıcı bulunamadı.");
        const oldBalance = u.points; u.points = 0; u.streak = 1; await u.save();
        addRadarLog(`⚡ DİKKAT: @${u.username} yöneticiler tarafından infaz edildi. (-${oldBalance} GEP)`);
        return sendMsg(`⚡ **İNFAZ BAŞARILI!** @${u.username} adlı kullanıcının ${oldBalance.toLocaleString()} GEP bakiyesi SIFIRLANDI.`);
    }

    async function toggleBan(args, isBanned) {
        const u = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned });
        if (!u) return sendMsg("❌ Kullanıcı bulunamadı.");
        return sendMsg(isBanned ? `🚫 @${u.username} sistemden uzaklaştırıldı.` : `✅ @${u.username} yasağı kaldırıldı.`);
    }

    async function handleSettings(args) {
        const game = args[1]?.toLowerCase(); const newPrice = parseInt(args[2]);
        if (!game || isNaN(newPrice)) return sendMsg("❌ Format: /ayar [oyun] [fiyat]");
        let config = await GameConfig.findOne() || await GameConfig.create({});
        let fieldMap = { 'gepcoz': 'gepcozReward', 'cark': 'spinCost', 'tahmin': 'predictCost', 'kapsul1': 'lootbox1Cost', 'kapsul2': 'lootbox2Cost', 'kapsul3': 'lootbox3Cost', 'airdrop': 'airdropCost', 'referans': 'refReward' };
        if (!fieldMap[game]) return sendMsg("❌ Hatalı oyun adı.");
        config[fieldMap[game]] = newPrice; await config.save();
        return sendMsg(`⚙️ Başarılı! ${game.toUpperCase()} yeni değeri: ${newPrice.toLocaleString()} GEP`);
    }

    async function handlePromoCode(args) {
        const code = args[1]; const reward = parseInt(args[2]); const maxUsage = parseInt(args[3]);
        if (!code || isNaN(reward) || isNaN(maxUsage)) return sendMsg("❌ Format: /promo KOD Ödül Kişi");
        await PromoCode.create({ code: code.toUpperCase(), reward, maxUsage });
        return sendMsg(`✅ Kod Üretildi:\n🎁 ${code.toUpperCase()} | 💰 ${reward} GEP | 👥 ${maxUsage} Kişi`);
    }

    async function manageAnnouncements(args, fullText) {
        const action = args[1]; const text = fullText.replace(`/duyuru ${action} `, '');
        const s = await Settings.findOne() || await Settings.create({});
        if (action === 'ekle') { s.announcements.push(text); await s.save(); return sendMsg("✅ Kayan duyuru eklendi."); }
        if (action === 'liste') { return sendMsg(`📢 **Kayan Duyurular:**\n` + s.announcements.map((a,i) => `${i+1}. ${a}`).join('\n') || "Duyuru Yok"); }
        if (action === 'sil') { s.announcements.splice(parseInt(args[2])-1, 1); await s.save(); return sendMsg("✅ Duyuru silindi."); }
    }

    async function manageTasks(args) {
        const action = args[1];
        if (action === 'liste') { 
            const tasks = await Task.find(); 
            return sendMsg(`🎯 **Sistemdeki Görevler:**\n` + tasks.map(t => `ID: ${t.taskId} | ${t.title} | ${t.reward} GEP`).join('\n') || "Görev Yok"); 
        }
        if (action === 'ekle') { 
            await Task.create({ taskId: Date.now().toString(), title: args[2].replace(/_/g, ' '), reward: parseInt(args[3]), target: args[4] }); 
            return sendMsg("✅ Görev Eklendi. (Not: Başlıktaki '_' işaretleri boşluğa çevrilir)"); 
        }
        if (action === 'sil') { 
            await Task.deleteOne({ taskId: args[2] }); 
            return sendMsg("✅ Görev Silindi."); 
        }
    }

    async function broadcastMessage(fullText) {
        const message = fullText.replace('/yayin ', '');
        if (!message || message === '/yayin') return sendMsg("❌ Mesaj girmediniz.");
        const users = await User.find({ telegramId: { $exists: true } });
        sendMsg(`⏳ Yayın başladı...`);
        for (let u of users) { 
            try { 
                await bot.sendMessage(u.telegramId, `📢 **SİBER AĞ DUYURUSU**\n\n${message}`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 HEMEN OYNA", web_app: { url: WEBHOOK_URL } }]] } }); 
            } catch (e) {} 
        }
        return sendMsg(`✅ Yayın tamamlandı!`);
    }

    async function showReport() {
        const userCount = await User.countDocuments();
        const totalGep = (await User.aggregate([{$group: {_id:null, total:{$sum:"$points"}}}]))[0]?.total || 0;
        const config = await GameConfig.findOne() || await GameConfig.create({});
        const isBoost = config.boostEndTime && config.boostEndTime > new Date();
        const report = `📊 **SİBER AĞ DURUM RAPORU** 📊\n\n` +
                       `👥 **Toplam Oyuncu:** ${userCount.toLocaleString()}\n` +
                       `💎 **Dolaşımdaki GEP:** ${totalGep.toLocaleString()}\n` +
                       `🔥 **Happy Hour:** ${isBoost ? 'Aktif (' + config.boostMultiplier + 'x)' : 'Kapalı'}\n` +
                       `🚨 **Sistem Kilidi:** ${config.isLocked ? 'KİLİTLİ' : 'Açık'}\n\n` +
                       `⚙️ **Güncel Fiyatlar:**\n` +
                       `Gepçöz Ödülü: ${config.gepcozReward} | Ref Ödülü: ${config.refReward}\n` +
                       `Çark Bedeli: ${config.spinCost} | Tahmin: ${config.predictCost}`;
        return sendMsg(report);
    }

    async function showWithdrawalList() {
        const topWinners = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
        if (topWinners.length === 0) return sendMsg("⚠️ Liderlik tablosu şu an boş.");
        let msgText = `💰 **HAFTALIK ÖDEME LİSTESİ (TOP 5)** 💰\n\n`;
        
        topWinners.forEach((u, i) => {
            msgText += `${i+1}. @${u.username || u.firstName} - ${u.dailyPoints.toLocaleString()} GEP\n`;
            msgText += `📍 Adres: \`${u.walletAddress || 'Bağlamamış'}\`\n`;
            msgText += `------------------------\n`;
        });
        
        return sendMsg(msgText);
    }
};
