// adminCommands.js
// SİBER KARARGAH - YÖNETİCİ KOMUT MERKEZİ (EKONOMİ KONTROLLÜ)

module.exports = function(context) {
    const { bot, models, GameConfig, ADMIN_ID, WEBHOOK_URL, radarLogs, addPoints, addRadarLog } = context;
    const { User, PromoCode, Task, YesterdayWinner, Settings, AirdropLink } = models;

    const adminCommands = [
        { command: 'ekonomi', description: '💰 Tüm maliyet ve ödül ayarlarını listeler' },
        { command: 'ayar', description: '⚙️ Değer değiştir (Örn: /ayar cark_maliyet 10000)' },
        { command: 'rapor', description: '📊 Ağ durum raporu' },
        { command: 'radar', description: '📡 Canlı siber radar' },
        { command: 'kilit', description: '🚨 Sistemi kilitle/aç' },
        { command: 'boost', description: '🔥 Happy Hour başlat' },
        { command: 'bilgi', description: '👤 Kullanıcı istihbaratı' },
        { command: 'yayin', description: '📢 Tüm ağa mesaj gönder' }
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
                    `*🎮 OYUN MALİYETLERİ:* \n` +
                    `• Çark: \`${cfg.spinCost}\` GEP\n` +
                    `• Tahmin: \`${cfg.predictCost}\` GEP\n` +
                    `• Roket Min: \`100\` GEP\n` +
                    `• VIP Pano: \`${cfg.airdropCost}\` GEP\n\n` +
                    `*🎁 ÖDÜL SİSTEMİ:* \n` +
                    `• Maden (Başlangıç): \`${cfg.mineBaseReward}\` GEP\n` +
                    `• Maden (Lvl Artış): \`${cfg.mineLevelStep}\` GEP\n` +
                    `• Reklam İzleme: \`${cfg.adReward}\` GEP\n` +
                    `• Günlük Başlangıç: \`${cfg.dailyBaseReward}\` GEP\n` +
                    `• Referans Başı: \`${cfg.refReward}\` GEP\n` +
                    `• Gepçöz: \`${cfg.gepcozReward}\` GEP\n\n` +
                    `⚙️ *Değiştirmek için:* \`/ayar [kod] [yeni_değer]\` \n` +
                    `Örn: \`/ayar cark_maliyet 10000\``;
                    return sendMsg(ekoText);

                case '/ayar':
                    if (args.length < 3) return sendMsg("❌ Kullanım: `/ayar [kod] [miktar]`\n\n*Kodlar:* \n`cark_maliyet`, `reklam_odul`, `maden_bas`, `maden_artis`, `ref_odul`, `gepcoz_odul`, `gunluk_bas`...");
                    
                    const code = args[1].toLowerCase();
                    const val = parseInt(args[2]);
                    if (isNaN(val)) return sendMsg("❌ Lütfen geçerli bir rakam girin.");

                    let config = await GameConfig.findOne() || await GameConfig.create({});
                    
                    const map = {
                        'cark_maliyet': 'spinCost',
                        'tahmin_maliyet': 'predictCost',
                        'pano_maliyet': 'airdropCost',
                        'maden_bas': 'mineBaseReward',
                        'maden_artis': 'mineLevelStep',
                        'reklam_odul': 'adReward',
                        'ref_odul': 'refReward',
                        'gepcoz_odul': 'gepcozReward',
                        'gunluk_bas': 'dailyBaseReward'
                    };

                    if (!map[code]) return sendMsg("❌ Hatalı kod! `/ekonomi` yazarak geçerli kodlara bakabilirsin.");
                    
                    config[map[code]] = val;
                    await config.save();
                    addRadarLog(`⚙️ EKONOMİ: ${code.toUpperCase()} değeri ${val} GEP olarak güncellendi.`);
                    return sendMsg(`✅ **BAŞARILI!** \n${code.toUpperCase()} artık \`${val.toLocaleString()}\` GEP.`);

                // ==========================================
                // DİĞER STANDART KOMUTLAR (Özetlendi)
                // ==========================================
                case '/kilit':
                    let c = await GameConfig.findOne() || await GameConfig.create({});
                    c.isLocked = (args[1] === 'aktif');
                    await c.save();
                    return sendMsg(c.isLocked ? "🚨 SİSTEM KİLİTLENDİ." : "✅ SİSTEM AÇILDI.");

                case '/radar':
                    return sendMsg(radarLogs.length ? `📡 **RADAR:** \n\n${radarLogs.join('\n')}` : "📡 Hareket yok.");

                case '/rapor':
                    const uCount = await User.countDocuments();
                    const total = (await User.aggregate([{$group:{_id:null,t:{$sum:"$points"}}}]))[0]?.t || 0;
                    return sendMsg(`📊 **RAPOR**\n👥 Oyuncu: ${uCount}\n💎 Toplam GEP: ${total.toLocaleString()}`);
                
                case '/bilgi':
                    const target = args[1]?.replace('@', '');
                    const u = await User.findOne({ $or: [{ username: target?.toLowerCase() }, { telegramId: target }] });
                    if (!u) return sendMsg("❌ Bulunamadı.");
                    return sendMsg(`👤 @${u.username}\n💰 ${u.points.toLocaleString()} GEP\n👛 \`${u.walletAddress || 'Bağlı Değil'}\``);

                case '/yayin':
                    const msgText = msg.text.replace('/yayin ', '');
                    const users = await User.find({ telegramId: { $exists: true } });
                    users.forEach(u => {
                        bot.sendMessage(u.telegramId, `📢 **SİBER DUYURU**\n\n${msgText}`, { reply_markup: { inline_keyboard: [[{ text: "🚀 OYUNA GİT", web_app: { url: WEBHOOK_URL } }]] } }).catch(()=>{});
                    });
                    return sendMsg("✅ Yayın tamam.");
            }
        } catch (e) { sendMsg("❌ Hata: " + e.message); }
    });
};
