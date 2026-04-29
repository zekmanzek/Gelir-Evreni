// adminCommands.js
// SİBER KARARGAH - YÖNETİCİ KOMUT MERKEZİ (TAM EKONOMİ KONTROLLÜ)

module.exports = function(context) {
    const { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog } = context;
    const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

    const adminCommands = [
        { command: 'ekonomi', description: '💰 Maliyet ve ödül ayarlarını listeler' },
        { command: 'ayar', description: '⚙️ Değer değiştir (Örn: /ayar cark_maliyet 10000)' },
        { command: 'rapor', description: '📊 Ağ durum raporu' },
        { command: 'radar', description: '📡 Canlı siber radar' },
        { command: 'kilit', description: '🚨 Sistemi kilitle/aç' },
        { command: 'boost', description: '🔥 Happy Hour başlat' },
        { command: 'promo', description: '🎫 Promosyon kodu üret' },
        { command: 'bilgi', description: '👤 Kullanıcı istihbaratı' },
        { command: 'canta', description: '🩻 Derin kullanıcı analizi' },
        { command: 'bakiye', description: '💵 Bakiye ayarla' },
        { command: 'ceza', description: '⚡ Hesabı sıfırla (İnfaz)' },
        { command: 'ban', description: '🚫 Kullanıcıyı yasakla' },
        { command: 'unban', description: '✅ Kullanıcı yasağını kaldır' },
        { command: 'yayin', description: '📢 Tüm ağa mesaj gönder' },
        { command: 'duyuru', description: '📝 Kayan yazı (ekle/sil/liste)' },
        { command: 'gorev', description: '🎯 Görev merkezi (ekle/sil/liste)' },
        { command: 'odemelist', description: '💰 Haftalık cüzdan listesi' }
    ];

    bot.setMyCommands(adminCommands, { scope: JSON.stringify({ type: 'chat', chat_id: ADMIN_ID }) });

    const sendMsg = (text) => bot.sendMessage(ADMIN_ID, text, { parse_mode: 'Markdown' });

    bot.on('message', async (msg) => {
        if (!msg.text || msg.from.id.toString() !== ADMIN_ID) return;

        const args = msg.text.split(' ');
        const cmd = args[0].toLowerCase();

        try {
            switch (cmd) {
                // ==========================================
                // 💰 EKONOMİ YÖNETİM PANELİ
                // ==========================================
                case '/ekonomi':
                    const cfg = await GameConfig.findOne() || await GameConfig.create({});
                    const ekoText = `💰 **SİBER EKONOMİ DURUMU** 💰\n\n` +
                    `*🎮 MALİYETLER:* \n` +
                    `• Çark: \`${cfg.spinCost}\`\n` +
                    `• Tahmin: \`${cfg.predictCost}\`\n` +
                    `• Kapsül 1: \`${cfg.lootbox1Cost}\` | Kapsül 2: \`${cfg.lootbox2Cost}\` | Kapsül 3: \`${cfg.lootbox3Cost}\`\n` +
                    `• VIP Pano: \`${cfg.airdropCost}\`\n\n` +
                    `*🎁 TEMEL ÖDÜLLER:* \n` +
                    `• Maden (Bas): \`${cfg.mineBaseReward}\` | Maden (Artış): \`${cfg.mineLevelStep}\`\n` +
                    `• Reklam: \`${cfg.adReward}\` | Ref: \`${cfg.refReward}\`\n` +
                    `• Günlük Seri: \`${cfg.dailyBaseReward}\` | Gepçöz: \`${cfg.gepcozReward}\`\n\n` +
                    `*🎰 OYUN ÖDÜLLERİ:* \n` +
                    `• Çark Jackpot: \`${cfg.spinJackpot}\` | Çark Orta: \`${cfg.spinMid}\` | Çark Düşük: \`${cfg.spinLow}\`\n` +
                    `• Efsane Kapsül: \`${cfg.lootBig}\` | Nadir: \`${cfg.lootMid}\` | Standart: \`${cfg.lootSmall}\`\n` +
                    `• Tahmin Kazan: \`${cfg.predictReward}\`\n\n` +
                    `⚙️ *Değiştirmek için:* \`/ayar [kod] [yeni_değer]\``;
                    return sendMsg(ekoText);

                case '/ayar':
                    if (args.length < 3) return sendMsg("❌ Kullanım: `/ayar [kod] [miktar]`\n\n*Bilinmeyen kodlar için /ekonomi yazın.*");
                    
                    const code = args[1].toLowerCase();
                    const val = parseInt(args[2]);
                    if (isNaN(val)) return sendMsg("❌ Lütfen geçerli bir rakam girin.");

                    let config = await GameConfig.findOne() || await GameConfig.create({});
                    
                    const map = {
                        // Maliyetler
                        'cark_maliyet': 'spinCost', 'tahmin_maliyet': 'predictCost', 'pano_maliyet': 'airdropCost',
                        'kapsul1_maliyet': 'lootbox1Cost', 'kapsul2_maliyet': 'lootbox2Cost', 'kapsul3_maliyet': 'lootbox3Cost',
                        // Temeller
                        'maden_bas': 'mineBaseReward', 'maden_artis': 'mineLevelStep', 'reklam_odul': 'adReward',
                        'ref_odul': 'refReward', 'gepcoz_odul': 'gepcozReward', 'gunluk_bas': 'dailyBaseReward',
                        // Oyun Ödülleri
                        'cark_jackpot': 'spinJackpot', 'cark_orta': 'spinMid', 'cark_dusuk': 'spinLow',
                        'kapsul_efsanevi': 'lootBig', 'kapsul_nadir': 'lootMid', 'kapsul_standart': 'lootSmall', 'tahmin_odul': 'predictReward'
                    };

                    if (!map[code]) return sendMsg("❌ Hatalı kod! Hangi kodları kullanabileceğini görmek için `/ekonomi` yaz.");
                    
                    config[map[code]] = val;
                    await config.save();
                    addRadarLog(`⚙️ EKONOMİ: ${code.toUpperCase()} değeri ${val} GEP olarak güncellendi.`);
                    return sendMsg(`✅ **BAŞARILI!** \n${code.toUpperCase()} artık \`${val.toLocaleString()}\` GEP.`);

                // ==========================================
                // DİĞER STANDART KOMUTLAR
                // ==========================================
                case '/kilit':
                    let c = await GameConfig.findOne() || await GameConfig.create({});
                    c.isLocked = (args[1] === 'aktif'); await c.save();
                    return sendMsg(c.isLocked ? "🚨 SİSTEM KİLİTLENDİ." : "✅ SİSTEM AÇILDI.");

                case '/boost':
                    const mult = parseFloat(args[1]); const mins = parseInt(args[2]);
                    if (!mult || isNaN(mins)) return sendMsg("❌ Format: /boost [Çarpan] [Dakika]");
                    let bCfg = await GameConfig.findOne() || await GameConfig.create({});
                    bCfg.boostMultiplier = mult; bCfg.boostEndTime = new Date(Date.now() + mins * 60000); await bCfg.save();
                    sendMsg(`🔥 **HAPPY HOUR AKTİF!** Çarpan: ${mult}x | Süre: ${mins} Dk`);
                    const allU = await User.find({ telegramId: { $exists: true } });
                    allU.forEach(u => { bot.sendMessage(u.telegramId, `🔥 **SİBER ETKİNLİK!**\n\n${mins} dakika boyunca kazançlar ${mult} KATINA çıkarıldı! 👇`, { reply_markup: { inline_keyboard: [[{ text: "🚀 KAZAN", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}); });
                    return;

                case '/radar':
                    return sendMsg(radarLogs.length ? `📡 **RADAR:** \n\n${radarLogs.join('\n')}` : "📡 Hareket yok.");

                case '/rapor':
                    const uCount = await User.countDocuments(); const total = (await User.aggregate([{$group:{_id:null,t:{$sum:"$points"}}}]))[0]?.t || 0;
                    return sendMsg(`📊 **RAPOR**\n👥 Oyuncu: ${uCount}\n💎 Toplam GEP: ${total.toLocaleString()}`);

                case '/bilgi':
                    const targetInfo = args[1]?.replace('@', ''); const ui = await User.findOne({ $or: [{ username: targetInfo?.toLowerCase() }, { telegramId: targetInfo }] });
                    if (!ui) return sendMsg("❌ Bulunamadı.");
                    return sendMsg(`👤 @${ui.username}\n💰 ${ui.points.toLocaleString()} GEP\n🏆 Davet: ${ui.referralCount}\n👛 \`${ui.walletAddress || 'Yok'}\``);
                
                case '/canta':
                    const targetC = args[1]?.replace('@', ''); const uc = await User.findOne({ $or: [{ username: targetC?.toLowerCase() }, { telegramId: targetC }] });
                    if (!uc) return sendMsg("❌ Bulunamadı.");
                    return sendMsg(`🩻 **DERİN X-RAY:** @${uc.username}\n💰 Bakiye: ${uc.points.toLocaleString()}\n📈 Seri: ${uc.streak}\n⛏️ Maden: ${new Date(uc.lastMining).toLocaleString('tr-TR')}\n📦 Kutu1: ${new Date(uc.lastLootbox1 || 0).toLocaleString('tr-TR')}`);

                case '/bakiye':
                    const targetB = args[1]?.replace('@', ''); const amt = parseInt(args[2]);
                    if (!targetB || isNaN(amt)) return sendMsg("❌ Format: /bakiye @user miktar");
                    const ub = await User.findOne({ $or: [{ username: targetB?.toLowerCase() }, { telegramId: targetB }] });
                    if (!ub) return sendMsg("❌ Bulunamadı.");
                    addPoints(ub, amt); await ub.save();
                    return sendMsg(`✅ @${ub.username} güncellendi: ${ub.points.toLocaleString()} GEP`);

                case '/ceza':
                    const targetCz = args[1]?.replace('@', ''); const ucz = await User.findOne({ $or: [{ username: targetCz?.toLowerCase() }, { telegramId: targetCz }] });
                    if (!ucz) return sendMsg("❌ Bulunamadı.");
                    ucz.points = 0; ucz.streak = 1; await ucz.save();
                    addRadarLog(`⚡ @${ucz.username} infaz edildi.`);
                    return sendMsg(`⚡ İNFAZ BAŞARILI! @${ucz.username} sıfırlandı.`);

                case '/ban':
                case '/unban':
                    const isBan = cmd === '/ban'; const uban = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: isBan });
                    if (!uban) return sendMsg("❌ Bulunamadı."); return sendMsg(isBan ? `🚫 @${uban.username} banlandı.` : `✅ @${uban.username} açıldı.`);

                case '/promo':
                    const pCode = args[1]; const pRew = parseInt(args[2]); const pMax = parseInt(args[3]);
                    if (!pCode || isNaN(pRew) || isNaN(pMax)) return sendMsg("❌ Format: /promo KOD Ödül Kişi");
                    await PromoCode.create({ code: pCode.toUpperCase(), reward: pRew, maxUsage: pMax }); return sendMsg(`✅ Kod Üretildi: ${pCode.toUpperCase()}`);

                case '/duyuru':
                    const dAct = args[1]; const dText = msg.text.replace(`/duyuru ${dAct} `, ''); const s = await Settings.findOne() || await Settings.create({});
                    if (dAct === 'ekle') { s.announcements.push(dText); await s.save(); return sendMsg("✅ Duyuru eklendi."); }
                    if (dAct === 'liste') { return sendMsg(`📢 Duyurular:\n` + s.announcements.map((a,i) => `${i+1}. ${a}`).join('\n') || "Yok"); }
                    if (dAct === 'sil') { s.announcements.splice(parseInt(args[2])-1, 1); await s.save(); return sendMsg("✅ Duyuru silindi."); }
                    break;

                case '/gorev':
                    const gAct = args[1];
                    if (gAct === 'liste') { const tasks = await Task.find(); return sendMsg(`🎯 Görevler:\n` + tasks.map(t => `${t.taskId} | ${t.title} | ${t.reward}`).join('\n') || "Yok"); }
                    if (gAct === 'ekle') { await Task.create({ taskId: Date.now().toString(), title: args[2].replace(/_/g, ' '), reward: parseInt(args[3]), target: args[4] }); return sendMsg("✅ Görev Eklendi."); }
                    if (gAct === 'sil') { await Task.deleteOne({ taskId: args[2] }); return sendMsg("✅ Görev Silindi."); }
                    break;

                case '/yayin':
                    const yText = msg.text.replace('/yayin ', '');
                    const uYayin = await User.find({ telegramId: { $exists: true } }); sendMsg(`⏳ Yayın başladı...`);
                    uYayin.forEach(u => bot.sendMessage(u.telegramId, `📢 **SİBER DUYURU**\n\n${yText}`, { reply_markup: { inline_keyboard: [[{ text: "🚀 OYUNA GİT", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}));
                    return sendMsg("✅ Yayın tamam.");

                case '/odemelist':
                    const topW = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
                    if (topW.length === 0) return sendMsg("⚠️ Tablo boş.");
                    let mText = `💰 **ÖDEME LİSTESİ (TOP 5)** 💰\n\n`;
                    topW.forEach((u, i) => { mText += `${i+1}. @${u.username || u.firstName} - ${u.dailyPoints.toLocaleString()}\n📍 \`${u.walletAddress || 'Yok'}\`\n---\n`; });
                    return sendMsg(mText);
            }
        } catch (e) { sendMsg("❌ Hata: " + e.message); }
    });
};
