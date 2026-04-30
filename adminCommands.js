// adminCommands.js
// SİBER KARARGAH - YÖNETİCİ KOMUT MERKEZİ (TAM EKONOMİ KONTROLLÜ)

module.exports = function(context) {
    const { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog } = context;
    const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

    const adminCommands = [
        { command: 'ekonomi', description: '💰 Güncel maliyet ve ödül raporu' },
        { command: 'ayar', description: '⚙️ Değer bükücü (Örn: /ayar cark_maliyet 15000)' },
        { command: 'rapor', description: '📊 Sistem genel durumu' },
        { command: 'radar', description: '📡 Canlı oyuncu hareketleri' },
        { command: 'kilit', description: '🚨 Güvenlik duvarı (Aktif/Kapat)' },
        { command: 'boost', description: '🔥 Global çarpan (Happy Hour)' },
        { command: 'promo', description: '🎫 Sınırlı etkinlik kodu üret' },
        { command: 'bilgi', description: '👤 Temel kullanıcı istihbaratı' },
        { command: 'canta', description: '🩻 Derin oyuncu analizi (X-Ray)' },
        { command: 'bakiye', description: '💵 Anlık bakiye müdahalesi' },
        { command: 'ceza', description: '⚡ Hesabı sıfırla (İnfaz)' },
        { command: 'ban', description: '🚫 Siber ağdan yasakla' },
        { command: 'unban', description: '✅ Yasaklamayı kaldır' },
        { command: 'yayin', description: '📢 Tüm kullanıcılara anlık mesaj' },
        { command: 'duyuru', description: '📝 Kayan yazı (ekle/sil/liste)' },
        { command: 'gorev', description: '🎯 Tıklamalı görev (ekle/sil/liste)' },
        { command: 'odemelist', description: '💰 Haftalık TOP 5 TON Cüzdanları' }
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
                    `*🎲 ÇARK ŞANS ORANLARI (%):* \n` +
                    `• Boş: \`%${cfg.spinProbEmpty || 40}\` | Düşük: \`%${cfg.spinProbLow || 35}\` | Amorti: \`%${cfg.spinProbCost || 17}\`\n` +
                    `• Orta: \`%${cfg.spinProbMid || 7}\` | Jackpot: \`%${cfg.spinProbJackpot || 1}\`\n\n` +
                    `⚙️ *Değiştirmek için:* \`/ayar [kod] [yeni_değer]\``;
                    return sendMsg(ekoText);

                case '/ayar':
                    if (args.length < 3) return sendMsg("❌ **Hatalı Kullanım!**\nFormat: `/ayar [kod] [yeni_değer]`\n\n💡 *Örnekler:*\n`/ayar cark_maliyet 15000`\n`/ayar maden_bas 5000`\n`/ayar sans_jackpot 5`\n\n🔍 *(Bilinmeyen kodlar için /ekonomi yazın)*");
                    
                    const code = args[1].toLowerCase();
                    const val = parseInt(args[2]);
                    if (isNaN(val)) return sendMsg("❌ Hata: Lütfen sadece rakam girin.");

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
                        'kapsul_efsanevi': 'lootBig', 'kapsul_nadir': 'lootMid', 'kapsul_standart': 'lootSmall', 'tahmin_odul': 'predictReward',
                        // 🔥 YENİ: Çark İhtimalleri
                        'sans_bos': 'spinProbEmpty', 'sans_dusuk': 'spinProbLow', 'sans_amorti': 'spinProbCost',
                        'sans_orta': 'spinProbMid', 'sans_jackpot': 'spinProbJackpot'
                    };

                    if (!map[code]) return sendMsg("❌ Hatalı kod! Hangi kodları kullanabileceğini görmek için `/ekonomi` yaz.");
                    
                    config[map[code]] = val;
                    await config.save();
                    addRadarLog(`⚙️ EKONOMİ: ${code.toUpperCase()} değeri ${val} olarak güncellendi.`);
                    return sendMsg(`✅ **BAŞARILI!** \n${code.toUpperCase()} artık \`${val.toLocaleString()}\` olarak ayarlandı.`);

                // ==========================================
                // DİĞER STANDART KOMUTLAR
                // ==========================================
                case '/kilit':
                    if (!args[1] || !['aktif', 'kapat'].includes(args[1])) return sendMsg("❌ **Hatalı Kullanım!**\n💡 *Örnek:* `/kilit aktif` veya `/kilit kapat`");
                    let c = await GameConfig.findOne() || await GameConfig.create({});
                    c.isLocked = (args[1] === 'aktif'); await c.save();
                    return sendMsg(c.isLocked ? "🚨 SİSTEM KİLİTLENDİ. Kimse giriş yapamaz." : "✅ SİSTEM AÇILDI. Ağ normale döndü.");

                case '/boost':
                    const mult = parseFloat(args[1]); const mins = parseInt(args[2]);
                    if (!mult || isNaN(mins)) return sendMsg("❌ **Hatalı Kullanım!**\nFormat: `/boost [Çarpan] [Dakika]`\n\n💡 *Örnek:* `/boost 2 60` (Kazançları 60 dakikalığına 2'ye katlar)");
                    let bCfg = await GameConfig.findOne() || await GameConfig.create({});
                    bCfg.boostMultiplier = mult; bCfg.boostEndTime = new Date(Date.now() + mins * 60000); await bCfg.save();
                    sendMsg(`🔥 **HAPPY HOUR AKTİF!** Çarpan: ${mult}x | Süre: ${mins} Dk`);
                    const allU = await User.find({ telegramId: { $exists: true } });
                    allU.forEach(u => { bot.sendMessage(u.telegramId, `🔥 **SİBER ETKİNLİK!**\n\n${mins} dakika boyunca kazançlar ${mult} KATINA çıkarıldı! 👇`, { reply_markup: { inline_keyboard: [[{ text: "🚀 KAZAN", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}); });
                    return;

                case '/radar':
                    return sendMsg(radarLogs.length ? `📡 **SİBER RADAR:** \n\n${radarLogs.join('\n')}` : "📡 Ağda şu an hareket yok.");

                case '/rapor':
                    const uCount = await User.countDocuments(); const total = (await User.aggregate([{$group:{_id:null,t:{$sum:"$points"}}}]))[0]?.t || 0;
                    return sendMsg(`📊 **SİBER AĞ RAPORU**\n👥 Toplam Oyuncu: ${uCount}\n💎 Piyasada Dolaşan GEP: ${total.toLocaleString()}`);

                case '/bilgi':
                    if (!args[1]) return sendMsg("❌ **Hatalı Kullanım!**\n💡 *Örnek:* `/bilgi @kullaniciadi`");
                    const targetInfo = args[1]?.replace('@', ''); const ui = await User.findOne({ $or: [{ username: targetInfo?.toLowerCase() }, { telegramId: targetInfo }] });
                    if (!ui) return sendMsg("❌ Oyuncu bulunamadı.");
                    return sendMsg(`👤 **KİMLİK:** @${ui.username || 'Gizli'}\n💰 Bakiye: ${ui.points.toLocaleString()} GEP\n🏆 Davet: ${ui.referralCount}\n👛 Cüzdan: \`${ui.walletAddress || 'Yok'}\``);
                
                case '/canta':
                    if (!args[1]) return sendMsg("❌ **Hatalı Kullanım!**\n💡 *Örnek:* `/canta @kullaniciadi`");
                    const targetC = args[1]?.replace('@', ''); const uc = await User.findOne({ $or: [{ username: targetC?.toLowerCase() }, { telegramId: targetC }] });
                    if (!uc) return sendMsg("❌ Oyuncu bulunamadı.");
                    return sendMsg(`🩻 **DERİN X-RAY:** @${uc.username || 'Gizli'}\n💰 Bakiye: ${uc.points.toLocaleString()}\n📈 Seri: ${uc.streak}. Gün\n⛏️ Maden T.: ${new Date(uc.lastMining).toLocaleString('tr-TR')}\n📦 Kutu1: ${new Date(uc.lastLootbox1 || 0).toLocaleString('tr-TR')}`);

                case '/bakiye':
                    const targetB = args[1]?.replace('@', ''); const amt = parseInt(args[2]);
                    if (!targetB || isNaN(amt)) return sendMsg("❌ **Hatalı Kullanım!**\nFormat: `/bakiye @kullaniciadi miktar`\n\n💡 *Örnek:* `/bakiye @ahmet 50000` (Eksi değer yazarak silebilirsiniz)");
                    const ub = await User.findOne({ $or: [{ username: targetB?.toLowerCase() }, { telegramId: targetB }] });
                    if (!ub) return sendMsg("❌ Oyuncu bulunamadı.");
                    addPoints(ub, amt); await ub.save();
                    return sendMsg(`✅ @${ub.username} bakiyesi güncellendi. Yeni Bakiye: ${ub.points.toLocaleString()} GEP`);

                case '/ceza':
                    if (!args[1]) return sendMsg("❌ **Hatalı Kullanım!**\n💡 *Örnek:* `/ceza @kullaniciadi`");
                    const targetCz = args[1]?.replace('@', ''); const ucz = await User.findOne({ $or: [{ username: targetCz?.toLowerCase() }, { telegramId: targetCz }] });
                    if (!ucz) return sendMsg("❌ Oyuncu bulunamadı.");
                    ucz.points = 0; ucz.streak = 1; await ucz.save();
                    addRadarLog(`⚡ @${ucz.username} infaz edildi.`);
                    return sendMsg(`⚡ İNFAZ BAŞARILI! @${ucz.username} oyuncusunun bakiyesi ve serisi sıfırlandı.`);

                case '/ban':
                case '/unban':
                    if (!args[1]) return sendMsg(`❌ **Hatalı Kullanım!**\n💡 *Örnek:* \`${cmd} @kullaniciadi\``);
                    const isBan = cmd === '/ban'; const uban = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: isBan });
                    if (!uban) return sendMsg("❌ Oyuncu bulunamadı."); return sendMsg(isBan ? `🚫 @${uban.username} sistemden yasaklandı.` : `✅ @${uban.username} yasağı kaldırıldı.`);

                case '/promo':
                    const pCode = args[1]; const pRew = parseInt(args[2]); const pMax = parseInt(args[3]);
                    if (!pCode || isNaN(pRew) || isNaN(pMax)) return sendMsg("❌ **Hatalı Kullanım!**\nFormat: `/promo [KOD] [Ödül] [Kişi Limit]`\n\n💡 *Örnek:* `/promo KAPTAN 50000 100`");
                    await PromoCode.create({ code: pCode.toUpperCase(), reward: pRew, maxUsage: pMax }); return sendMsg(`✅ Kod Üretildi: ${pCode.toUpperCase()}\nÖdül: ${pRew} GEP | Sınır: ${pMax} Kişi`);

                case '/duyuru':
                    const dAct = args[1]; const dText = msg.text.replace(`/duyuru ${dAct} `, ''); const s = await Settings.findOne() || await Settings.create({});
                    if (!dAct || !['ekle', 'liste', 'sil'].includes(dAct)) return sendMsg("❌ **Hatalı Kullanım!**\n\n💡 *Örnekler:*\n`/duyuru ekle Yeni etkinlik başladı!`\n`/duyuru liste`\n`/duyuru sil 1`");
                    
                    if (dAct === 'ekle') { s.announcements.push(dText); await s.save(); return sendMsg("✅ Kayan yazıya duyuru eklendi."); }
                    if (dAct === 'liste') { return sendMsg(`📢 Kayan Yazı Duyuruları:\n` + s.announcements.map((a,i) => `${i+1}. ${a}`).join('\n') || "Duyuru yok."); }
                    if (dAct === 'sil') { 
                        if(isNaN(args[2])) return sendMsg("❌ Silmek istediğiniz duyurunun numarasını yazın.");
                        s.announcements.splice(parseInt(args[2])-1, 1); await s.save(); return sendMsg("✅ Duyuru silindi."); 
                    }
                    break;

                case '/gorev':
                    const gAct = args[1];
                    if (!gAct || !['ekle', 'liste', 'sil'].includes(gAct)) return sendMsg("❌ **Hatalı Kullanım!**\n\n💡 *Örnekler:*\n`/gorev ekle Youtube_Abone_Ol 25000 https://youtube.com/...`\n`/gorev liste`\n`/gorev sil [Görev_ID]`");
                    
                    if (gAct === 'liste') { const tasks = await Task.find(); return sendMsg(`🎯 Aktif Görevler:\n\n` + tasks.map(t => `ID: \`${t.taskId}\` | ${t.title} | ${t.reward} GEP`).join('\n') || "Görev Yok."); }
                    if (gAct === 'ekle') { await Task.create({ taskId: Date.now().toString(), title: args[2].replace(/_/g, ' '), reward: parseInt(args[3]), target: args[4] }); return sendMsg("✅ Görev Başarıyla Eklendi."); }
                    if (gAct === 'sil') { await Task.deleteOne({ taskId: args[2] }); return sendMsg("✅ Görev Silindi."); }
                    break;

                case '/yayin':
                    const yText = msg.text.replace('/yayin ', '');
                    if (!yText || yText.trim() === '') return sendMsg("❌ **Hatalı Kullanım!**\n💡 *Örnek:* `/yayin Herkes oyuna girsin, 2X ödüller aktif!`");
                    const uYayin = await User.find({ telegramId: { $exists: true } }); sendMsg(`⏳ Yayın başlatılıyor... Ağa bağlı herkese gönderiliyor.`);
                    uYayin.forEach(u => bot.sendMessage(u.telegramId, `📢 **SİBER DUYURU**\n\n${yText}`, { reply_markup: { inline_keyboard: [[{ text: "🚀 OYUNA GİT", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{}));
                    return sendMsg("✅ Yayın operasyonu tamamlandı.");

                case '/odemelist':
                    const topW = await User.find({ dailyPoints: { $gt: 0 } }).sort({ dailyPoints: -1 }).limit(5);
                    if (topW.length === 0) return sendMsg("⚠️ Tablo şu an boş.");
                    let mText = `💰 **HAFTALIK ÖDEME LİSTESİ (TOP 5)** 💰\n\n`;
                    topW.forEach((u, i) => { mText += `${i+1}. @${u.username || u.firstName} - ${u.dailyPoints.toLocaleString()} GEP\n📍 Cüzdan: \`${u.walletAddress || 'Yok'}\`\n---\n`; });
                    return sendMsg(mText);
            }
        } catch (e) { sendMsg("❌ Operasyon Hatası: " + e.message); }
    });
};
