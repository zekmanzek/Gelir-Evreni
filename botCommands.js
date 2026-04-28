module.exports = function(bot, models, config, addPoints, sharedState) {
    const { User, Settings } = models;
    const { ADMIN_ID, WEBHOOK_URL } = config;

    const chatCooldowns = new Map();
    const activeDuels = new Map();

    bot.on('new_chat_members', async (msg) => {
        const s = await Settings.findOne();
        if (!s || msg.chat.id.toString() !== s.mainGroupId) return;
        
        // YENİ: Yönetici karşılama mesajını kapattıysa hiçbir şey yapma
        if (s.isWelcomeEnabled === false) return;
        
        msg.new_chat_members.forEach(newUser => {
            // Botların gruba girişinde karşılama mesajı atmasını engelliyoruz
            if (newUser.is_bot) return;

            // Kullanıcı isminde bulunabilecek Markdown bozan karakterleri kaçış (escape) ile temizliyoruz
            const safeName = newUser.first_name ? newUser.first_name.replace(/([_*\[\]`])/g, '\\$1') : 'Kullanıcı';

            // YENİ: Veritabanından gelen dinamik mesajı kullanıyoruz
            let finalMessage = s.welcomeMessage;
            if (!finalMessage) {
                // Eğer veritabanında mesaj yoksa varsayılan (eski) mesajı kullan
                const summary = `💎 **GELİR EVRENİ (GEP) SİSTEM ÖZETİ** 💎\n\n⛏️ **Maden:** 4 saatte bir uygulamaya girip GEP topla.\n📢 **Benim Projem:** Kendi projeni 1M GEP'e yayınla veya başkalarının projelerine katılıp anında **+10.000 GEP** kazan.\n🎮 **Oyunlar:** Kripto Kahini (Tahmin), Gelir Çarkı ve Gelir Kapsülleri ile GEP'lerini katla.\n💬 **Chat-Kazan:** Bu grupta sohbet ettikçe arka planda otomatik GEP kazanırsın.\n⚔️ **Etkileşim:** \`/duello\`, \`/zar\` ve \`/bahsis\` komutlarıyla grupta diğerleriyle kapış.\n🎁 **Siber Drop:** Saatte bir rastgele gruba düşen 25.000 GEP'i ilk tıklayan kapar!\n🎫 **Promokod:** Bilet şifrelerini yakalayıp sürpriz ödülleri aç.\n👥 **Davet Et:** Profil sekmesindeki linkinle gelen her arkadaşın için ikiniz de anında **10.000 GEP** kazanırsınız.`;
                finalMessage = `🌟 **Siber Ağ'a Hoş Geldin {isim}!**\n\n${summary}`;
            }

            // {isim} değişkenini kullanıcının gerçek adıyla değiştiriyoruz
            finalMessage = finalMessage.replace(/{isim}/g, safeName);
            
            // Eğer yazılan metnin içinde "aşağıdaki buton" ibaresi yoksa otomatik ekle
            if (!finalMessage.includes("aşağıdaki buton")) {
                finalMessage += `\n\nHemen aşağıdaki butona tıkla ve kazanmaya başla! 👇`;
            }

            bot.sendMessage(msg.chat.id, finalMessage, { 
                parse_mode: 'Markdown', 
                reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: WEBHOOK_URL } }]] } 
            }).catch(err => console.error("Hoş geldin mesajı hatası:", err.message)); 
        });
    });

    bot.on('callback_query', async (query) => {
        if (query.data === 'claim_drop') {
            if (!sharedState.activeDrop || sharedState.activeDrop.claimed) return bot.answerCallbackQuery(query.id, { text: "⚠️ Bu drop çoktan kapıldı!", show_alert: true });
            const user = await User.findOne({ telegramId: query.from.id.toString() });
            if (!user) return bot.answerCallbackQuery(query.id, { text: "⚠️ Önce botu başlatmalısın!", show_alert: true });
            
            sharedState.activeDrop.claimed = true; addPoints(user, sharedState.activeDrop.reward); await user.save();
            bot.editMessageText(`🎉 **DROP KAPILDI!**\n\nVeri paketini hızlı davranan @${query.from.username || query.from.first_name} yakaladı ve **25.000 GEP** kazandı!`, { chat_id: query.message.chat.id, message_id: query.message.message_id, parse_mode: 'Markdown' });
            bot.answerCallbackQuery(query.id, { text: "Tebrikler! 25.000 GEP hesabına eklendi." }); sharedState.activeDrop = null;
        }
    });

    bot.on('message', async (msg) => {
        if (!msg.text || msg.chat.type === 'private') return;
        const s = await Settings.findOne(); if (!s || msg.chat.id.toString() !== s.mainGroupId) return;
        
        const userId = msg.from.id.toString(); const text = msg.text.toLowerCase().trim();

        // YENİ: Dinamik Oto-Cevap Kontrolü
        if (s.autoReplies && s.autoReplies.size > 0) {
            for (const [key, value] of s.autoReplies.entries()) {
                if (text.includes(key.toLowerCase())) {
                    bot.sendMessage(msg.chat.id, value, { parse_mode: 'Markdown' });
                    break; 
                }
            }
        }

        // YENİ: Dinamik Chat-Kazan Kontrolü (Açıksa çalışır)
        const now = Date.now();
        if (s.isChatEarnEnabled !== false) {
            if (!chatCooldowns.has(userId) || (now - chatCooldowns.get(userId)) > 60000) {
                const user = await User.findOne({ telegramId: userId });
                if (user) { 
                    const min = s.chatEarnMin || 2; const max = s.chatEarnMax || 10;
                    const reward = Math.floor(Math.random() * (max - min + 1)) + min;
                    addPoints(user, reward); await user.save(); chatCooldowns.set(userId, now); 
                }
            }
        }

        // Sabit komutlar
        if (text === "gep" || text.includes("gep nedir") || text.includes("nasil kazanilir") || text.includes("nasıl kazanılır") || text.includes("özetle")) {
            const summary = `💎 **GELİR EVRENİ (GEP) SİSTEM ÖZETİ** 💎\n\n` +
            `⛏️ **Maden:** 4 saatte bir uygulamaya girip GEP topla.\n` +
            `📢 **Benim Projem:** Kendi projeni 1M GEP'e yayınla veya başkalarının projelerine katılıp anında **+10.000 GEP** kazan.\n` +
            `🎮 **Oyunlar:** Kripto Kahini (Tahmin), Gelir Çarkı ve Gelir Kapsülleri ile GEP'lerini katla.\n` +
            `💬 **Chat-Kazan:** Bu grupta sohbet ettikçe arka planda otomatik GEP kazanırsın.\n` +
            `⚔️ **Etkileşim:** \`/duello\`, \`/zar\` ve \`/bahsis\` komutlarıyla grupta diğerleriyle kapış.\n` +
            `🎁 **Siber Drop:** Saatte bir rastgele gruba düşen 25.000 GEP'i ilk tıklayan kapar!\n` +
            `🎫 **Promokod:** Bilet şifrelerini yakalayıp sürpriz ödülleri aç.\n` +
            `👥 **Davet Et:** Profil sekmesindeki linkinle gelen her arkadaşın için ikiniz de anında **10.000 GEP** kazanırsınız.`;
            bot.sendMessage(msg.chat.id, summary, { parse_mode: 'Markdown' });
        } else if (text.includes("günaydın") || text.includes("gunaydin")) {
            bot.sendMessage(msg.chat.id, "☀️ Günaydın! Siber madenler seni bekliyor.");
        } else if (text.includes("bot bozuk") || text.includes("calismiyor") || text.includes("çalışmıyor")) {
            bot.sendMessage(msg.chat.id, "⚡ Sistemler %100 kapasiteyle çalışıyor. Lütfen internet bağlantınızı kontrol edin.");
        }
    });

    bot.onText(/\/start(?:\s+(.*))?/, (msg, match) => {
        if (msg.chat.type !== 'private') return;
        const refId = match[1] ? match[1].trim() : ''; const appUrl = refId ? `${WEBHOOK_URL}?tgWebAppStartParam=${refId}` : WEBHOOK_URL;
        bot.sendMessage(msg.chat.id, "🌟 **Gelir Evreni'ne Hoş Geldin!**", { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: "🚀 Uygulamayı Aç", web_app: { url: appUrl } }]] } });
    });

    // GENEL KOMUTLAR VE DETAYLI KILAVUZ
    bot.onText(/\/(yardim|kilavuz)/, (msg) => { 
        const klavuz = `📚 **GELİR EVRENİ KULLANIM KILAVUZU** 📚\n\n` +
        `🎲 **/zar <miktar>**\n` +
        `Şansına güveniyorsan zarları at! Zar 4, 5 veya 6 gelirse yatırdığın GEP'i ikiye katlarsın. 1, 2 veya 3 gelirse kasanın olur. (Minimum bahis: 100 GEP)\n` +
        `👉 *Örnek Kullanım:* \`/zar 500\`\n\n` +
        `⚔️ **/duello <miktar>**\n` +
        `Gruptaki birine meydan oku! Meydan okumak istediğin kişinin herhangi bir mesajını **yanıtlayarak** bu komutu yaz. Karşı taraf \`/kabul\` yazarsa, sistem kılıçları çarpıştırır ve şanslı olan kazanır.\n` +
        `👉 *Örnek Kullanım:* Birinin mesajını yanıtla ve \`/duello 1000\` yaz.\n\n` +
        `💸 **/bahsis <miktar>**\n` +
        `Bir arkadaşına destek olmak veya borç vermek istersen mesajını yanıtlayarak GEP gönderebilirsin.\n` +
        `👉 *Örnek Kullanım:* Birinin mesajını yanıtla ve \`/bahsis 250\` yaz.\n\n` +
        `⛏️ **/maden**: Madeninin dolmasına ne kadar kaldığını gösterir.\n` +
        `🏆 **/liderler**: Grubun en zengin 5 oyuncusunu listeler.\n` +
        `👤 **/profil**: Kendi güncel bakiyeni gösterir.`;

        bot.sendMessage(msg.chat.id, klavuz, { parse_mode: 'Markdown' }); 
    });
    
    bot.onText(/\/profil/, async (msg) => { const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user) return; bot.sendMessage(msg.chat.id, `👤 **${msg.from.first_name}**\n💰 Bakiye: **${Math.floor(user.points).toLocaleString()} GEP**`, { parse_mode: 'Markdown' }); });
    bot.onText(/\/liderler/, async (msg) => { const topUsers = await User.find().sort({ points: -1 }).limit(5); let text = "🏆 **EN ZENGİN 5 OYUNCU**\n\n"; topUsers.forEach((u, i) => { text += `${i+1}. ${u.firstName} - **${Math.floor(u.points).toLocaleString()} GEP**\n`; }); bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' }); });
    bot.onText(/\/maden/, async (msg) => { const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user) return; const diff = new Date().getTime() - new Date(user.lastMining).getTime(); const cooldown = 4 * 60 * 60 * 1000; if (diff >= cooldown) { bot.sendMessage(msg.chat.id, "⛏️ **Madenin Hazır!**\nUygulamaya gir ve ödülünü topla. 🔥"); } else { const remaining = Math.ceil((cooldown - diff) / (60 * 1000)); bot.sendMessage(msg.chat.id, `⛏️ Maden üretimde...\n⏳ **${remaining} dakika** sonra hazır.`); } });
    bot.onText(/\/bahsis (\d+)/, async (msg, match) => { if (!msg.reply_to_message) return; const amount = parseInt(match[1]); const sender = await User.findOne({ telegramId: msg.from.id.toString() }); const receiver = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() }); if (sender && receiver && sender.points >= amount && sender.telegramId !== receiver.telegramId) { sender.points -= amount; addPoints(receiver, amount); await sender.save(); await receiver.save(); bot.sendMessage(msg.chat.id, `💸 **Transfer Başarılı!**\n${sender.firstName} ➔ ${receiver.firstName}: **${amount} GEP**`); } });

    // OYUN KOMUTLARI (MODÜL KONTROLLÜ)
    bot.onText(/\/zar (\d+)/, async (msg, match) => { 
        const s = await Settings.findOne(); if (s && s.isDiceEnabled === false) return bot.sendMessage(msg.chat.id, "⚠️ Zar oyunu geçici olarak kapatılmıştır.");
        const amount = parseInt(match[1]); const user = await User.findOne({ telegramId: msg.from.id.toString() }); if (!user || user.points < amount || amount < 100) return; user.points -= amount; await user.save(); const diceMsg = await bot.sendDice(msg.chat.id); setTimeout(async () => { if (diceMsg.dice.value >= 4) { const win = amount * 2; addPoints(user, win); await user.save(); bot.sendMessage(msg.chat.id, `🎉 **KAZANDIN!** +${win} GEP!`, { reply_to_message_id: diceMsg.message_id }); } else { bot.sendMessage(msg.chat.id, `💀 **KAYBETTİN...**`, { reply_to_message_id: diceMsg.message_id }); } }, 4000); 
    });

    bot.onText(/\/duello (\d+)/, async (msg, match) => { 
        const s = await Settings.findOne(); if (s && s.isDuelEnabled === false) return bot.sendMessage(msg.chat.id, "⚠️ Düello sistemi geçici olarak kapatılmıştır.");
        if (!msg.reply_to_message) return bot.sendMessage(msg.chat.id, "Meydan okumak istediğin kişinin mesajını yanıtlayarak /duello <miktar> yazmalısın.");
        const amount = parseInt(match[1]); const challenger = await User.findOne({ telegramId: msg.from.id.toString() }); const opponent = await User.findOne({ telegramId: msg.reply_to_message.from.id.toString() }); 
        if (!challenger || !opponent) return; if (challenger.points < amount) return bot.sendMessage(msg.chat.id, "Bakiyen bu düello için yetersiz."); if (opponent.points < amount) return bot.sendMessage(msg.chat.id, "Karşı tarafın bakiyesi bu düello için yetersiz."); if (challenger.telegramId === opponent.telegramId) return bot.sendMessage(msg.chat.id, "Kendinle düello yapamazsın!");
        activeDuels.set(opponent.telegramId, { challengerId: challenger.telegramId, amount: amount, chatId: msg.chat.id });
        bot.sendMessage(msg.chat.id, `⚔️ **DÜELLO DAVETİ!**\n\n@${msg.from.username}, @${msg.reply_to_message.from.username} kullanıcısına **${amount} GEP** değerinde meydan okudu!\n\nKabul etmek için bu mesajı yanıtlayıp \`/kabul\` yazın!`); 
    });
    
    bot.onText(/\/kabul/, async (msg) => { 
        if (!msg.reply_to_message || !msg.reply_to_message.text.includes("DÜELLO DAVETİ!")) return; 
        const opponentId = msg.from.id.toString(); const duelData = activeDuels.get(opponentId); if (!duelData) return bot.sendMessage(msg.chat.id, "Geçerli bir düello davetin yok veya süresi geçmiş."); activeDuels.delete(opponentId); 
        const challenger = await User.findOne({ telegramId: duelData.challengerId }); const opponent = await User.findOne({ telegramId: opponentId });
        if (!challenger || !opponent || challenger.points < duelData.amount || opponent.points < duelData.amount) { return bot.sendMessage(msg.chat.id, "Taraflardan birinin bakiyesi yetersiz olduğu için düello iptal edildi."); }
        bot.sendMessage(msg.chat.id, "⚔️ Kılıçlar çekildi! Sistem bir kazanan belirliyor..."); 
        setTimeout(async () => { const isChallengerWin = Math.random() > 0.5; let winner, loser; if (isChallengerWin) { winner = challenger; loser = opponent; } else { winner = opponent; loser = challenger; } winner.points += duelData.amount; loser.points -= duelData.amount; await winner.save(); await loser.save(); bot.sendMessage(msg.chat.id, `🎉 **DÜELLO BİTTİ!**\n\nKazanan: **${winner.firstName}** (+${duelData.amount} GEP)\nKaybeden: **${loser.firstName}** (-${duelData.amount} GEP)`); }, 3000); 
    });

    // ==========================================
    // 🛡️ SADECE SANA ÖZEL GRUP YÖNETİM KOMUTLARI
    // ==========================================
    
    bot.onText(/\/grububagla/, async (msg) => { if (String(msg.from.id) !== String(ADMIN_ID)) return; if (msg.chat.type === 'private') return; const s = await Settings.findOne() || await Settings.create({}); s.mainGroupId = msg.chat.id.toString(); await s.save(); bot.sendMessage(msg.chat.id, "✅ **Sistem Entegre Edildi!**", { parse_mode: 'Markdown' }); });

    bot.onText(/\/grupdurumu/, async (msg) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const s = await Settings.findOne(); if (!s) return;
        const text = `⚙️ **SİSTEM DURUMU**\n\n` +
        `👋 Karşılama: **${s.isWelcomeEnabled !== false ? "AÇIK" : "KAPALI"}**\n` +
        `💬 Chat-Kazan: **${s.isChatEarnEnabled !== false ? "AÇIK" : "KAPALI"}** (Ödül: ${s.chatEarnMin || 2}-${s.chatEarnMax || 10} GEP)\n` +
        `🎲 Zar Modülü: **${s.isDiceEnabled !== false ? "AÇIK" : "KAPALI"}**\n` +
        `⚔️ Düello Modülü: **${s.isDuelEnabled !== false ? "AÇIK" : "KAPALI"}**\n` +
        `🤖 Oto-Cevap Sayısı: **${s.autoReplies ? s.autoReplies.size : 0}**`;
        bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/karsilama (kapat|ac)/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const durum = match[1] === "ac";
        await Settings.updateOne({}, { $set: { isWelcomeEnabled: durum } });
        bot.sendMessage(msg.chat.id, `✅ Karşılama mesajı **${durum ? "AÇILDI" : "KAPATILDI"}**.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/karsilamametni ([\s\S]+)/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const yeniMetin = match[1];
        await Settings.updateOne({}, { $set: { welcomeMessage: yeniMetin } });
        bot.sendMessage(msg.chat.id, `✅ Yeni karşılama metni kaydedildi!\n*(Kullanıcı adı {isim} olarak gösterilecek)*`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/sohbetkazanc (kapat|ac)/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const durum = match[1] === "ac";
        await Settings.updateOne({}, { $set: { isChatEarnEnabled: durum } });
        bot.sendMessage(msg.chat.id, `✅ Chat'ten GEP kazanımı **${durum ? "AÇILDI" : "KAPATILDI"}**.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/sohbetodulu (\d+) (\d+)/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const min = parseInt(match[1]); const max = parseInt(match[2]);
        await Settings.updateOne({}, { $set: { chatEarnMin: min, chatEarnMax: max } });
        bot.sendMessage(msg.chat.id, `✅ Grupta mesaj başı ödül **${min} ile ${max} GEP** arası olarak güncellendi!`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/modul (zar|duello) (kapat|ac)/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const modul = match[1]; const durum = match[2] === "ac";
        if (modul === "zar") await Settings.updateOne({}, { $set: { isDiceEnabled: durum } });
        if (modul === "duello") await Settings.updateOne({}, { $set: { isDuelEnabled: durum } });
        bot.sendMessage(msg.chat.id, `✅ ${modul.toUpperCase()} modülü **${durum ? "AÇILDI" : "KAPATILDI"}**.`, { parse_mode: 'Markdown' });
    });

    bot.onText(/\/otocevapekle "(.+)" "([\s\S]+)"/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const s = await Settings.findOne(); if(!s) return;
        const kelime = match[1].toLowerCase(); const cevap = match[2];
        if(!s.autoReplies) s.autoReplies = new Map();
        s.autoReplies.set(kelime, cevap); await s.save();
        bot.sendMessage(msg.chat.id, `✅ Biri "${kelime}" yazarsa bot belirlediğin cevabı verecek.`);
    });

    bot.onText(/\/otocevapsil "(.+)"/, async (msg, match) => {
        if (String(msg.from.id) !== String(ADMIN_ID)) return;
        const s = await Settings.findOne(); if(!s || !s.autoReplies) return;
        const kelime = match[1].toLowerCase();
        s.autoReplies.delete(kelime); await s.save();
        bot.sendMessage(msg.chat.id, `🗑️ "${kelime}" için olan oto-cevap silindi.`);
    });
};
