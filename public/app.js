const tg = window.Telegram.WebApp; 
tg.expand(); 
tg.setHeaderColor('#000109'); 
const API = window.location.origin;
let user, tasks = [], miningInterval; 
let lbAllTime = [], lbDaily = []; 
let currentLbTab = 'all'; 
const AdController = window.Adsgram ? window.Adsgram.init({ blockId: "28938" }) : null; 
let tvWidgetCreated = false;

function triggerHaptic(type = 'light') { 
    if(tg.HapticFeedback) { 
        if(type === 'success') tg.HapticFeedback.notificationOccurred('success'); 
        else if(type === 'error') tg.HapticFeedback.notificationOccurred('error'); 
        else tg.HapticFeedback.impactOccurred(type); 
    } 
}

function spawnFloatingText(e, text, color) { 
    let x = window.innerWidth / 2; let y = window.innerHeight / 2; 
    if(e && e.touches && e.touches.length > 0) { x = e.touches[0].clientX; y = e.touches[0].clientY; } 
    else if (e && e.clientX) { x = e.clientX; y = e.clientY; } 
    const el = document.createElement("div"); el.className = "floating-text"; el.innerText = text; el.style.left = (x - 40) + "px"; el.style.top = (y - 20) + "px"; el.style.color = color || "var(--gold)"; 
    document.body.appendChild(el); 
    setTimeout(() => el.remove(), 1000); 
}

async function init() {
    try {
        const tgUser = tg.initDataUnsafe?.user;
        if (!tgUser) { document.body.innerHTML = "<div style='display:flex; height:100vh; align-items:center; justify-content:center; color:var(--danger); font-family:Outfit;'><h2 style='text-align:center;'>SİSTEME ERİŞİM REDDEDİLDİ.</h2></div>"; return; }
        let refId = tg.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('tgWebAppStartParam') || "";
        const res = await fetch(`${API}/api/user/auth`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: tgUser.username || "", firstName: tgUser.first_name || "Kullanıcı", referrerId: refId, initData: tg.initData }) });
        const data = await res.json();
        if (data.success) {
            user = data.user; user.isAdmin = data.isAdmin;
            if(user.isBanned) { document.body.innerHTML = "<h1>🚫 HESAP YASAKLANDI</h1>"; return; }
            document.getElementById('ref-link').value = `https://t.me/${data.botUsername}?start=${user.telegramId}`;
            if(user.isAdmin) document.getElementById('admin-panel-btn').style.display = 'block';
            document.getElementById('header-name').innerText = (user.username ? '@'+user.username : user.firstName).toUpperCase();
            await refreshTasks(); updateUI(); checkMiningTimer(); renderStreak(); loadAirdrops(); 
            if (data.announcements) renderAnnouncements(data.announcements);
        } else tg.showAlert(data.message);
    } catch (e) { 
        console.error("Init Hatası:", e); 
    } finally { 
        setTimeout(() => { const loader = document.getElementById('loader'); if(loader) loader.style.opacity = '0'; setTimeout(()=> loader.style.display='none',500) }, 800); 
    }
}

function updateUI() {
    if (!user) return; 
    document.getElementById('balance').innerText = Math.floor(user.points).toLocaleString(); 
    document.getElementById('usd').innerText = `≈ ${(user.points / 100000).toFixed(2)} USDT`; 
    document.getElementById('user-level').innerText = `${user.level} ÜYE`; 
    if (document.getElementById('stat-ref-count')) document.getElementById('stat-ref-count').innerText = user.referralCount || 0; 
    document.getElementById('ui-mine-level').innerText = user.miningLevel || 1; 
    document.getElementById('ui-mine-reward').innerText = `${(1000 + (((user.miningLevel || 1) - 1) * 500)).toLocaleString()}`; 
    document.getElementById('ui-upgrade-cost').innerText = `GEREKEN: ${((user.miningLevel || 1) * 10000).toLocaleString()} GEP`; 
    document.getElementById('ui-ad-tickets').innerText = user.adTickets || 0;
    
    const now = new Date();
    const diff1 = (now - new Date(user.lastLootbox1 || 0)) / (1000 * 60 * 60);
    const diff2 = (now - new Date(user.lastLootbox2 || 0)) / (1000 * 60 * 60);
    const diff3 = (now - new Date(user.lastLootbox3 || 0)) / (1000 * 60 * 60);

    const btn1 = document.getElementById('lb-btn-1');
    const btn2 = document.getElementById('lb-btn-2');
    const btn3 = document.getElementById('lb-btn-3');

    if(btn1) { if(diff1 < 24) { btn1.disabled = true; btn1.style.opacity = "0.5"; } else { btn1.disabled = false; btn1.style.opacity = "1"; } }
    if(btn2) { if(diff2 < 24) { btn2.disabled = true; btn2.style.opacity = "0.5"; } else { btn2.disabled = false; btn2.style.opacity = "1"; } }
    if(btn3) { if(diff3 < 24) { btn3.disabled = true; btn3.style.opacity = "0.5"; } else { btn3.disabled = false; btn3.style.opacity = "1"; } }

    renderStreak();
}

function showPage(p, el) { 
    triggerHaptic('light'); 
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active')); 
    document.querySelectorAll('.dock-item').forEach(nav => nav.classList.remove('active')); 
    document.getElementById(`page-${p}`).classList.add('active'); 
    if(el) el.classList.add('active'); 
    if(p === 'network') loadLeaderboard();
    if(p === 'admin') loadAdminStats(); 
}

// ... joinProject, loadAirdrops, postAirdrop, deleteAirdrop, refreshTasks, renderTasks, completeTask, buyAdPackage, redeemPromo fonksiyonları aynı kalacak ...
// (Kopyalama kalabalığı yapmamak için diğer fonksiyonları buraya aynen eklediğini varsayıyorum, sadece openGame'e odaklanıyoruz)

function openGame(game) { 
    triggerHaptic('light'); document.getElementById(`modal-${game}`).style.display = 'flex'; 
    if(game === 'predict') { 
        if(!tvWidgetCreated) { 
            new TradingView.widget({ "width": "100%", "height": 220, "symbol": "BINANCE:BTCUSDT", "interval": "1", "timezone": "Etc/UTC", "theme": "dark", "style": "2", "locale": "tr", "enable_publishing": false, "backgroundColor": "rgba(0, 1, 9, 0)", "gridColor": "rgba(255, 255, 255, 0.05)", "hide_top_toolbar": true, "hide_legend": true, "save_image": false, "container_id": "tv_chart_container" }); 
            tvWidgetCreated = true; 
        } 
        document.getElementById('predict-price').innerHTML = '<div class="loader-ring" style="width:25px;height:25px;border-width:2px;display:inline-block;"></div> Çekiliyor...'; 
        document.getElementById('predict-buttons').style.display = 'none'; 
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT').then(r => r.json()).then(d => { document.getElementById('predict-price').innerText = `Anlık: $${parseFloat(d.price).toFixed(2)}`; document.getElementById('predict-buttons').style.display = 'flex'; }).catch(e => { document.getElementById('predict-price').innerText = "Bağlantı Hatası"; }); 
    } 
    if(game === 'spin') { document.getElementById('spin-result').innerText = "Şansını Dene!"; } 
    if(game === 'lootbox') { resetLootbox(); } 
    if(game === 'zarzara') { document.getElementById('zarzara-result').innerText = "Bahsini Gir ve At!"; document.getElementById('zarzara-display').innerText = "🎲"; }
    
    // GEPÇÖZ ENTEGRASYONU
    if(game === 'gepcoz') { 
        document.getElementById('gepcoz-result').innerText = "Terminal Hazır. Şifreyi Çöz.";
        // Burada hCaptcha widget'ını yükleyecek kod tetiklenecek.
    }
}

// GEPÇÖZ DOĞRULAMA (Arka plandan gelecek yanıtı burası işleyecek)
async function verifyGepcoz(token) {
    const res = await fetch(`${API}/api/arcade/gepcoz`, { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify({ token, initData: tg.initData }) 
    });
    const data = await res.json();
    if (data.success) {
        user.points = data.points;
        updateUI();
        triggerHaptic('success');
        document.getElementById('gepcoz-result').innerText = "✅ BAŞARILI! +" + data.reward + " GEP";
        spawnFloatingText(null, "+" + data.reward + " GEP", "var(--success)");
    } else {
        triggerHaptic('error');
        document.getElementById('gepcoz-result').innerText = "❌ HATALI ÇÖZÜM";
    }
}

function closeGame(game) { triggerHaptic('light'); document.getElementById(`modal-${game}`).style.display = 'none'; }

// ... diğer tüm fonksiyonlar (playZarzara, playSpin, playPredict, resetLootbox, playLootbox, startMining, checkMiningTimer, runTimer, upgradeMine, showAd, renderStreak, claimDaily, renderAnnouncements, loadLeaderboard, switchLB, renderLB, copyRef, loadAdminStats, createPromo, addTask, deleteTask, addAnnouncement, deleteAnnouncement, manageUser) aynen kalmalı ...

// ADMIN DÜZELTME (Tarafımdan farkedilen ufak yazım hatası):
async function deleteAnnouncement(index) { await fetch(`${API}/api/admin/announcement`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ action: 'delete', index, initData: tg.initData }) }); loadAdminStats(); }

window.onload = init;
