// adminCommands.js - TAM YETKİLİ SİBER KARARGAH VERSİYONU
module.exports = function(context) {
    const { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog, refreshConfigCache } = context;
    const { User, PromoCode, Task, Settings, YesterdayWinner } = models;

    const adminCommands = [
        { command: 'ekonomi', description: '💰 Güncel maliyet ve ödül raporu' },
        { command: 'ayar', description: '⚙️ Değer bükücü (Örn: /ayar cark_maliyet 15000)' },
        { command: 'oyun', description: '🎮 Oyun şalterleri (Örn: /oyun cark kapat)' },
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
                case '/ekonomi':
                    const cfg = await GameConfig.findOne() || await GameConfig.create({});
                    return sendMsg(`💰 **SİBER EKONOMİ DURUMU**\n\n` +
                        `• Çark Maliyet: \`${cfg.spinCost}\`\n` +
                        `• Maden Süre: \`${cfg.miningDuration || 240}\` dk\n` +
                        `• Duyuru Hız: \`${cfg.announcementSpeed || 15}\` sn\n` +
                        `• Çark: ${cfg.isSpinActive ? '✅' : '❌'} | Roket: ${cfg.isCrashActive ? '✅' : '❌'}\n\n` +
                        `⚙️ Değiştirmek için: \`/ayar [kod] [değer]\``);

                case '/oyun':
                    const gName = args[1]?.toLowerCase();
                    const gStatus = args[2]?.toLowerCase();
                    if (!['cark', 'roket'].includes(gName)) return sendMsg("❌ `/oyun cark/roket ac/kapat` ");
                    let oCfg = await GameConfig.findOne();
                    if (gName === 'cark') oCfg.isSpinActive = (gStatus === 'ac');
                    if (gName === 'roket') oCfg.isCrashActive = (gStatus === 'ac');
                    await oCfg.save();
                    await refreshConfigCache();
                    return sendMsg(`🎮 **SİNYAL:** ${gName.toUpperCase()} -> ${gStatus.toUpperCase()}`);

                case '/ayar':
                    const code = args[1]?.toLowerCase();
                    const val = parseInt(args[2]);
                    if (isNaN(val)) return sendMsg("❌ Rakam girin.");
                    let config = await GameConfig.findOne();
                    const map = { 
                        'cark_maliyet': 'spinCost', 'maden_sure': 'miningDuration', 
                        'duyuru_hiz': 'announcementSpeed', 'ref_odul': 'refReward' 
                    };
                    if (!map[code]) return sendMsg("❌ Hatalı kod!");
                    config[map[code]] = val;
                    await config.save();
                    await refreshConfigCache();
                    return sendMsg(`✅ **GÜNCELLENDİ:** ${code.toUpperCase()} = ${val}`);

                case '/radar':
                    return sendMsg(radarLogs.length ? `📡 **SİBER RADAR:** \n\n${radarLogs.join('\n')}` : "📡 Hareket yok.");

                case '/rapor':
                    const uCount = await User.countDocuments();
                    const total = (await User.aggregate([{$group:{_id:null,t:{$sum:"$points"}}}]))[0]?.t || 0;
                    return sendMsg(`📊 **SİBER AĞ RAPORU**\n👥 Oyuncu: ${uCount}\n💎 Toplam GEP: ${total.toLocaleString()}`);

                case '/bilgi':
                    const targetInfo = args[1]?.replace('@', '').toLowerCase();
                    const ui = await User.findOne({ $or: [{ username: targetInfo }, { telegramId: targetInfo }] });
                    if (!ui) return sendMsg("❌ Bulunamadı.");
                    return sendMsg(`👤 **İSTİHBARAT:** @${ui.username}\n💰 Bakiye: ${ui.points.toLocaleString()}\n👛 Cüzdan: \`${ui.walletAddress || 'Yok'}\``);

                case '/canta':
                    const targetC = args[1]?.replace('@', '').toLowerCase();
                    const uc = await User.findOne({ $or: [{ username: targetC }, { telegramId: targetC }] });
                    if (!uc) return sendMsg("❌ Bulunamadı.");
                    return sendMsg(`🩻 **X-RAY:** @${uc.username}\n📈 Seri: ${uc.streak}. Gün\n⛏️ Son Maden: ${new Date(uc.lastMining).toLocaleString('tr-TR')}`);

                case '/bakiye':
                    const targetB = args[1]?.replace('@', '').toLowerCase();
                    const amt = parseInt(args[2]);
                    const ub = await User.findOne({ $or: [{ username: targetB }, { telegramId: targetB }] });
                    if (!ub) return sendMsg("❌ Bulunamadı.");
                    addPoints(ub, amt); await ub.save();
                    return sendMsg(`✅ @${ub.username} bakiyesi güncellendi.`);

                case '/promo':
                    const pCode = args[1]?.toUpperCase();
                    const pRew = parseInt(args[2]);
                    const pMax = parseInt(args[3]);
                    if (!pCode || isNaN(pRew)) return sendMsg("❌ `/promo [KOD] [Ödül] [Limit]`");
                    await PromoCode.create({ code: pCode, reward: pRew, maxUsage: pMax });
                    return sendMsg(`🎫 **KOD ÜRETİLDİ:** ${pCode}\n🎁 Ödül: ${pRew} | 👥 Limit: ${pMax}`);

                case '/yayin':
                    const yText = msg.text.replace('/yayin ', '');
                    if (!yText || yText === '/yayin') return sendMsg("❌ Mesaj yazın.");
                    const allU = await User.find({ telegramId: { $exists: true } });
                    allU.forEach(u => {
                        bot.sendMessage(u.telegramId, `📢 **SİBER DUYURU**\n\n${yText}`, {
                            reply_markup: { inline_keyboard: [[{ text: "🚀 OYUNA GİT", web_app: { url: WEBHOOK_URL } }]] }
                        }).catch(() => {});
                    });
                    return sendMsg("✅ Yayın operasyonu tamamlandı.");

                case '/kilit':
                    let kCfg = await GameConfig.findOne();
                    kCfg.isLocked = (args[1] === 'aktif');
                    await kCfg.save();
                    await refreshConfigCache();
                    return sendMsg(kCfg.isLocked ? "🚨 SİSTEM KİLİTLENDİ." : "✅ SİSTEM AÇILDI.");

                case '/ceza':
                    const ucz = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { points: 0, streak: 1 });
                    return sendMsg(ucz ? `⚡ @${ucz.username} infaz edildi.` : "❌ Bulunamadı.");

                case '/ban':
                    const uban = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: true });
                    return sendMsg(uban ? `🚫 @${uban.username} yasaklandı.` : "❌ Bulunamadı.");

                case '/unban':
                    const uunban = await User.findOneAndUpdate({ username: args[1]?.replace('@', '').toLowerCase() }, { isBanned: false });
                    return sendMsg(uunban ? `✅ @${uunban.username} yasağı kaldırıldı.` : "❌ Bulunamadı.");
            }
        } catch (e) { sendMsg("❌ Hata: " + e.message); }
    });
};
