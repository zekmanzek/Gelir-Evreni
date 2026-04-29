const tg = window.Telegram.WebApp; 
tg.expand(); 
tg.setHeaderColor('#000109'); 
const API = window.location.origin;
let user, tasks = [], miningInterval; 
let lbAllTime = [], lbDaily = []; 
let currentLbTab = 'all'; 
const AdController = window.Adsgram ? window.Adsgram.init({ blockId: "28938" }) : null; 
let tvWidgetCreated = false;

const hScript = document.createElement('script');
hScript.src = '[https://js.hcaptcha.com/1/api.js?render=explicit](https://js.hcaptcha.com/1/api.js?render=explicit)';
hScript.async = true; hScript.defer = true; document.head.appendChild(hScript);

let tonConnectUI;
try {
    tonConnectUI = new TON_CONNECT_UI.TonConnectUI({ manifestUrl: '[https://gelir-evreni.onrender.com/tonconnect-manifest.json](https://gelir-evreni.onrender.com/tonconnect-manifest.json)', buttonRootId: 'ton-connect' });
    tonConnectUI.onStatusChange(async (wallet) => {
        if (wallet) {
            const address = wallet.account.address;
            try {
                const res = await fetch(`${API}/api/user/save-wallet`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ walletAddress: address, initData: tg.initData }) });
                const data = await res.json();
                if(data.success) { triggerHaptic('success'); tg.showAlert("✅ Siber cüzdan başarıyla ağa bağlandı!"); }
            } catch (e) { console.error("Cüzdan kayıt hatası:", e); }
        }
    });
} catch (e) {}

function triggerHaptic(type = 'light') { if(tg.HapticFeedback) { if(type === 'success') tg.HapticFeedback.notificationOccurred('success'); else if(type === 'error') tg.HapticFeedback.notificationOccurred('error'); else tg.HapticFeedback.impactOccurred(type); } }
function spawnFloatingText(e, text, color) { let x = window.innerWidth / 2; let y = window.innerHeight / 2; if(e && e.touches && e.touches.length > 0) { x = e.touches[0].clientX; y = e.touches[0].clientY; } else if (e && e.clientX) { x = e.clientX; y = e.clientY; } const el = document.createElement("div"); el.className = "floating-text"; el.innerText = text; el.style.left = (x - 40) + "px"; el.style.top = (y - 20) + "px"; el.style.color = color || "var(--gold)"; document.body.appendChild(el); setTimeout(() => el.remove(), 1000); }
function checkLockdown(data) { if (data && data.isLocked) { document.getElementById('lockdown-screen').style.display = 'flex'; triggerHaptic('error'); return true; } return false; }

async function init() {
    try {
        const tgUser = tg.initDataUnsafe?.user;
        if (!tgUser) { document.body.innerHTML = "<div style='display:flex; height:100vh; align-items:center; justify-content:center; color:var(--danger); font-family:Outfit;'><h2 style='text-align:center;'>SİSTEME ERİŞİM REDDEDİLDİ.</h2></div>"; return; }
        let refId = tg.initDataUnsafe?.start_param || new URLSearchParams(window.location.search).get('tgWebAppStartParam') || "";
        const res = await fetch(`${API}/api/user/auth`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: tgUser.username || "", firstName: tgUser.first_name || "Kullanıcı", referrerId: refId, initData: tg.initData }) });
        const data = await res.json();
        if (checkLockdown(data)) return;

        if (data.success) {
            user = data.user;
            if(user.isBanned) { document.body.innerHTML = "<div style='display:flex; height:100vh; align-items:center; justify-content:center; color:var(--danger); font-family:Outfit;'><h2 style='text-align:center;'>🚫 HESAP YASAKLANDI</h2></div>"; return; }
            document.getElementById('ref-link').value = `https://t.me/${data.botUsername}?start=${user.telegramId}`;
            document.getElementById('header-name').innerText = (user.username ? '@'+user.username : user.firstName).toUpperCase();
            if (data.isBoostActive) { document.getElementById('boost-banner').style.display = 'block'; document.getElementById('boost-multiplier').innerText = data.boostMultiplier; } else { document.getElementById('boost-banner').style.display = 'none'; }

            await refreshTasks(); updateUI(); checkMiningTimer(); renderStreak(); loadAirdrops(); 
            if (data.announcements) renderAnnouncements(data.announcements);
        } else tg.showAlert(data.message);
    } catch (e) {} finally { setTimeout(() => { const loader = document.getElementById('loader'); if(loader) loader.style.opacity = '0'; setTimeout(()=> loader.style.display='none',500) }, 800); }
}

function updateUI() {
    if (!user) return; 
    document.getElementById('balance').innerText = Math.floor(user.points).toLocaleString(); document.getElementById('usd').innerText = `≈ ${(user.points / 100000).toFixed(2)} USDT`; document.getElementById('user-level').innerText = `${user.level} ÜYE`; 
    if (document.getElementById('stat-ref-count')) document.getElementById('stat-ref-count').innerText = user.referralCount || 0; 
    document.getElementById('ui-mine-level').innerText = user.miningLevel || 1; document.getElementById('ui-mine-reward').innerText = `${(1000 + (((user.miningLevel || 1) - 1) * 500)).toLocaleString()}`; document.getElementById('ui-upgrade-cost').innerText = `GEREKEN: ${((user.miningLevel || 1) * 10000).toLocaleString()} GEP`; document.getElementById('ui-ad-tickets').innerText = user.adTickets || 0;
    const now = new Date(); const diff1 = (now - new Date(user.lastLootbox1 || 0)) / (1000 * 60 * 60); const diff2 = (now - new Date(user.lastLootbox2 || 0)) / (1000 * 60 * 60); const diff3 = (now - new Date(user.lastLootbox3 || 0)) / (1000 * 60 * 60);
    const btn1 = document.getElementById('lb-btn-1'); const btn2 = document.getElementById('lb-btn-2'); const btn3 = document.getElementById('lb-btn-3');
    if(btn1) { if(diff1 < 24) { btn1.disabled = true; btn1.style.opacity = "0.5"; } else { btn1.disabled = false; btn1.style.opacity = "1"; } }
    if(btn2) { if(diff2 < 24) { btn2.disabled = true; btn2.style.opacity = "0.5"; } else { btn2.disabled = false; btn2.style.opacity = "1"; } }
    if(btn3) { if(diff3 < 24) { btn3.disabled = true; btn3.style.opacity = "0.5"; } else { btn3.disabled = false; btn3.style.opacity = "1"; } }
    renderStreak();
}

function showPage(p, el) { triggerHaptic('light'); document.querySelectorAll('.page').forEach(page => page.classList.remove('active')); document.querySelectorAll('.dock-item').forEach(nav => nav.classList.remove('active')); document.getElementById(`page-${p}`).classList.add('active'); if(el) el.classList.add('active'); if(p === 'network') loadLeaderboard(); }

async function joinProject(projectId, url) {
    const btn = document.querySelector(`#ad-${projectId} .btn-join`); if(!btn) return;
    if (btn.innerText.includes("KATIL")) { triggerHaptic('light'); try { tg.openLink(url); } catch(e) { window.open(url, '_blank'); } btn.innerText = "🔄 KONTROL ET"; btn.style.background = "#f59e0b"; } 
    else if (btn.innerText.includes("KONTROL ET")) {
        triggerHaptic('medium'); btn.disabled = true; btn.style.background = "#10b981"; btn.style.opacity = "0.6"; btn.innerText = "⏳ BEKLENİYOR...";
        setTimeout(async () => {
            try {
                const res = await fetch(`${API}/api/airdrop/join`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ projectId, initData: tg.initData }) });
                const data = await res.json(); if (checkLockdown(data)) return;
                if(data.success) { user.points = data.points; updateUI(); triggerHaptic('success'); spawnFloatingText(null, "+10.000 GEP", "var(--success)"); tg.showAlert("Tebrikler! Projeye katıldığın için 10.000 GEP kazandın."); btn.innerText = "✅ KATILINDI"; btn.style.opacity = "0.6"; } 
                else { btn.innerText = "❌ HATA"; tg.showAlert(data.message); loadAirdrops(); }
            } catch(e) { btn.innerText = "🔄 KONTROL ET"; btn.disabled = false; btn.style.background = "#f59e0b"; btn.style.opacity = "1"; }
        }, 2000);
    }
}

async function loadAirdrops() { try { const res = await fetch(`${API}/api/airdrop/list`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; const listDiv = document.getElementById('airdrop-list'); if(data.success && data.links.length > 0) { listDiv.innerHTML = data.links.map(l => { let btnHtml = ''; if (l.isOwner) { btnHtml = `<button class="btn-join" style="background:#475569; cursor:not-allowed;" disabled>SENİN PROJEN</button>`; } else if (l.hasJoined) { btnHtml = `<button class="btn-join" style="background:#10b981; cursor:not-allowed; opacity:0.6;" disabled>✅ KATILINDI</button>`; } else { btnHtml = `<button class="btn-join" onclick="joinProject('${l._id}', '${l.url}')">🚀 KATIL (+10.000 GEP)</button>`; } return `<div class="airdrop-item" id="ad-${l._id}"><div style="flex:1;"><div class="ad-user">@${l.username}</div><div class="ad-title">${l.title}</div><div class="ad-desc">${l.description}</div>${btnHtml}</div></div>`; }).join(''); } else { listDiv.innerHTML = "<div style='text-align:center; color:var(--text-dim); font-size:12px; padding:10px;'>Henüz hiç proje eklenmemiş. İlk sen ol!</div>"; } } catch(e) {} }
async function postAirdrop() { const btn = document.getElementById('btn-post-ad'); if(btn && btn.disabled) return; triggerHaptic('medium'); const title = document.getElementById('ad-title').value.trim(); const desc = document.getElementById('ad-desc').value.trim(); const url = document.getElementById('ad-link').value.trim(); if(!title || !desc || !url) return tg.showAlert("Tüm alanları doldurmalısın."); if(!url.startsWith("http://") && !url.startsWith("https://")) return tg.showAlert("Geçerli bir link (https:// veya http://) girmelisin."); if(btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.innerText = "YÜKLENİYOR..."; } try { const res = await fetch(`${API}/api/airdrop/share`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title, description: desc, url, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; updateUI(); triggerHaptic('success'); tg.showAlert(data.message); document.getElementById('ad-title').value = ''; document.getElementById('ad-desc').value = ''; document.getElementById('ad-link').value = ''; loadAirdrops(); } else { triggerHaptic('error'); tg.showAlert(data.message || "Yetersiz GEP"); } } catch(e) { tg.showAlert("Bağlantı hatası oluştu!"); } finally { if(btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerText = "YAYINLA"; } } }
async function refreshTasks() { const tRes = await fetch(`${API}/api/tasks`); const tData = await tRes.json(); tasks = tData.tasks || []; renderTasks(); }
function renderTasks() { const cont = document.getElementById('task-list'); if(!cont) return; cont.innerHTML = tasks.map(tData => { const isDone = user.completedTasks.includes(tData.taskId); return `<div class="task-card" style="${isDone ? 'opacity:0.5;' : ''}"><div><div style="font-weight: 800; font-size:14px; margin-bottom: 4px;">${tData.title}</div><div style="font-family: 'Space Grotesk'; color: ${isDone ? 'var(--text-dim)' : 'var(--gold)'}; font-weight: 700;">+${tData.reward} GEP</div></div><button id="task-btn-${tData.taskId}" class="game-btn ${isDone ? '' : 'btn-outline'}" style="${isDone ? 'background:#1e293b; color:#64748b; padding:10px 20px; width:auto; font-size:12px; box-shadow:none;' : 'padding:10px 20px; width:auto; font-size:12px;'}" ${isDone ? 'disabled' : ''} onclick="completeTask(event, '${tData.taskId}','${tData.target}')">${isDone ? '✅ BİTTİ' : '🚀 GİT'}</button></div>`; }).join(''); }
async function completeTask(e, tid, link) { const btn = document.getElementById(`task-btn-${tid}`); if (!btn) return; if (btn.innerText.includes("GİT")) { triggerHaptic('light'); try { tg.openLink(link); } catch(err) { window.open(link, '_blank'); } btn.innerText = "🔄 KONTROL ET"; btn.style.background = "#f59e0b"; btn.style.color = "#fff"; btn.classList.remove('btn-outline'); } else if (btn.innerText.includes("KONTROL ET")) { triggerHaptic('medium'); btn.disabled = true; btn.innerText = "⏳ BEKLENİYOR..."; btn.style.opacity = "0.6"; btn.style.background = "#10b981"; setTimeout(async () => { try { const res = await fetch(`${API}/api/tasks/complete`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ taskId: tid, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { triggerHaptic('success'); spawnFloatingText(e, "GÖREV TAMAM!", "var(--success)"); init(); } else { btn.innerText = "🚀 GİT"; btn.disabled = false; btn.style.opacity = "1"; btn.style.background = "transparent"; btn.classList.add('btn-outline'); } } catch(err) { btn.innerText = "🔄 KONTROL ET"; btn.disabled = false; btn.style.opacity = "1"; btn.style.background = "#f59e0b"; } }, 2000); } }
async function buyAdPackage(pid) { if (isBuyingPkg) return; triggerHaptic('light'); let cost = pid === 1 ? 10000 : (pid === 2 ? 50000 : 100000); if (user.points < cost) return tg.showAlert("Yetersiz GEP Bakiye!"); isBuyingPkg = true; try { const res = await fetch(`${API}/api/buy-ad-package`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ packageId: pid, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; user.adTickets = data.adTickets; updateUI(); triggerHaptic('success'); tg.showAlert("Bilet Paketi Satın Alındı!"); } else { triggerHaptic('error'); tg.showAlert(data.message); } } catch (e) { tg.showAlert("Bağlantı hatası!"); } finally { isBuyingPkg = false; } }
async function redeemPromo() { const btn = document.getElementById('btn-redeem-promo'); if (btn && btn.disabled) return; triggerHaptic('medium'); const codeInput = document.getElementById('ui-promo-code'); const code = codeInput.value.trim(); if(!code) return tg.showAlert("Lütfen bir kod girin."); if(btn) { btn.disabled = true; btn.style.opacity = "0.5"; } try { const res = await fetch(`${API}/api/redeem-promo`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code: code, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; updateUI(); codeInput.value = ''; triggerHaptic('success'); spawnFloatingText(null, `+${data.reward} GEP`, "var(--success)"); tg.showAlert(`Tebrikler! ${data.reward} GEP Kazandın!`); } else { triggerHaptic('error'); tg.showAlert(data.message); } } catch (e) { tg.showAlert("Bağlantı hatası!"); } finally { if(btn) { btn.disabled = false; btn.style.opacity = "1"; } } }

let hcaptchaWidgetId;

function openGame(game) { 
    triggerHaptic('light'); document.getElementById(`modal-${game}`).style.display = 'flex'; 
    if(game === 'predict') { if(!tvWidgetCreated) { new TradingView.widget({ "width": "100%", "height": 220, "symbol": "BINANCE:BTCUSDT", "interval": "1", "timezone": "Etc/UTC", "theme": "dark", "style": "2", "locale": "tr", "enable_publishing": false, "backgroundColor": "rgba(0, 1, 9, 0)", "gridColor": "rgba(255, 255, 255, 0.05)", "hide_top_toolbar": true, "hide_legend": true, "save_image": false, "container_id": "tv_chart_container" }); tvWidgetCreated = true; } document.getElementById('predict-price').innerHTML = '<div class="loader-ring" style="width:25px;height:25px;border-width:2px;display:inline-block;"></div> Çekiliyor...'; document.getElementById('predict-buttons').style.display = 'none'; fetch('[https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT](https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT)').then(r => r.json()).then(d => { document.getElementById('predict-price').innerText = `Anlık: $${parseFloat(d.price).toFixed(2)}`; document.getElementById('predict-buttons').style.display = 'flex'; }).catch(e => { document.getElementById('predict-price').innerText = "Bağlantı Hatası"; }); } 
    if(game === 'spin') { document.getElementById('spin-result').innerText = "Şansını Dene!"; } 
    if(game === 'lootbox') { resetLootbox(); } 
    if(game === 'zarzara') { document.getElementById('zarzara-result').innerText = "Bahsini Gir ve At!"; document.getElementById('zarzara-display').innerText = "🎲"; }
    if(game === 'gepcoz') { document.getElementById('gepcoz-result').innerText = "Terminal Hazır. Şifreyi Çöz."; document.getElementById('gepcoz-result').style.color = "#fff"; document.getElementById('hcaptcha-widget').innerHTML = ''; if(window.hcaptcha) { hcaptchaWidgetId = hcaptcha.render('hcaptcha-widget', { 'sitekey': '10b4d376-fcd6-43a0-a0ac-6388f0c418a4', 'theme': 'dark', 'callback': function(token) { verifyGepcoz(token); } }); } else { document.getElementById('gepcoz-result').innerText = "Güvenlik ağı yüklenemedi."; } }
    
    // --- GEP ROKETİ SIFIRLAMA VE GÖRSEL HAZIRLIK ---
    if(game === 'crash') {
        clearInterval(crashInterval);
        isCrashed = false;
        crashPath = [];
        
        // Görselleri Sıfırla
        document.getElementById('crash-display').innerText = "1.00x";
        document.getElementById('crash-display').style.color = "#fff";
        document.getElementById('crash-result').innerText = "Bahsini Gir ve Uç!";
        document.getElementById('crash-result').style.color = "#fff";
        document.getElementById('btn-start-crash').style.display = 'block';
        document.getElementById('btn-start-crash').disabled = false;
        document.getElementById('btn-cashout-crash').style.display = 'none';
        
        // Canvas Temizle
        let canvas = document.getElementById('rocket-canvas');
        if(canvas) { let ctx = canvas.getContext('2d'); ctx.clearRect(0,0, canvas.width, canvas.height); }
        
        // 3D Roketi Başlangıca Döndür
        let rocket = document.getElementById('rocket-ship');
        rocket.style.display = 'flex';
        rocket.style.left = '10px';
        rocket.style.top = '160px'; // Alt köşe
        rocket.style.transform = 'translate(-50%, -50%) rotate(0deg)';
        document.getElementById('rocket-fire').style.display = 'none'; // Ateşi söndür
        
        document.getElementById('explosion-icon').style.display = 'none';
    }
}

// --- YENİ: GEP ROKETİ (CRASH) ANİMASYON VE BUG FIX MOTORU ---
let crashInterval;
let currentCrashMultiplier = 1.00;
let crashPoint = 1.00;
let isCrashed = false;
let crashBet = 0;
let crashPath = [];

async function playCrash() {
    const betInput = document.getElementById('crash-bet').value;
    crashBet = parseInt(betInput);
    if (!crashBet || isNaN(crashBet) || crashBet < 100) return tg.showAlert("Min bahis 100 GEP.");
    if (user.points < crashBet) return tg.showAlert("Yetersiz GEP bakiye!");

    const btnStart = document.getElementById('btn-start-crash');
    const btnCashout = document.getElementById('btn-cashout-crash');
    const display = document.getElementById('crash-display');
    const resText = document.getElementById('crash-result');

    btnStart.disabled = true;
    resText.innerText = "Roket Hazırlanıyor...";
    resText.style.color = "#fff";
    
    try {
        const res = await fetch(`${API}/api/arcade/crash/start`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ bet: crashBet, initData: tg.initData }) });
        const data = await res.json();
        if (checkLockdown(data)) return;
        
        if (!data.success) { 
            resText.innerText = "Hata!"; tg.showAlert(data.message); btnStart.disabled = false; return; 
        }

        user.points = data.points;
        updateUI();
        
        crashPoint = parseFloat(data.crashPoint);
        currentCrashMultiplier = 1.00;
        isCrashed = false;
        crashPath = [];
        
        btnStart.style.display = 'none';
        btnCashout.style.display = 'block';
        btnCashout.disabled = false;
        btnCashout.innerText = `ÇEKİL (${crashBet} GEP)`;
        resText.innerText = "Uçuş başladı!";
        display.style.color = "var(--success)";
        
        // Canvas Kurulumu
        let canvas = document.getElementById('rocket-canvas');
        let ctx = canvas.getContext('2d');
        let cw = canvas.width; let ch = canvas.height;
        let rocket = document.getElementById('rocket-ship');
        let explosion = document.getElementById('explosion-icon');
        
        rocket.style.display = 'flex'; // Roketi göster
        explosion.style.display = 'none'; // Patlamayı gizle
        document.getElementById('rocket-fire').style.display = 'block'; // Ateşi yak
        
        let tick = 0;
        clearInterval(crashInterval);
        
        crashInterval = setInterval(() => {
            if (isCrashed) return;
            tick += 0.05;
            
            // Çarpan Eğrisi (Üstel Büyüme)
            currentCrashMultiplier = Math.exp(0.15 * tick);
            
            // Roketin Konumunu Hesapla (Pro Çizim)
            let currentX = Math.min((tick / 20) * (cw * 0.8), cw * 0.9) + 10; 
            let progressY = 1 - (1 / currentCrashMultiplier); 
            let currentY = ch - (progressY * ch * 0.8) - 20; 
            
            crashPath.push({x: currentX, y: currentY});
            
            // Grafik Çizgisi Oluştur (Siber Kırmızı)
            ctx.clearRect(0, 0, cw, ch);
            ctx.beginPath();
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 3;
            ctx.shadowBlur = 10;
            ctx.shadowColor = "#ef4444";
            for(let i=0; i<crashPath.length; i++) {
                if(i===0) ctx.moveTo(crashPath[i].x, crashPath[i].y);
                else ctx.lineTo(crashPath[i].x, crashPath[i].y);
            }
            ctx.stroke();
            ctx.shadowBlur = 0; // Gölgeyi sıfırla
            
            // 3D Roketi Hareket Ettir ve Döndür
            rocket.style.left = currentX + "px";
            rocket.style.top = currentY + "px";
            // İlerlemeye göre açıyı ayarla (-45 dereceden -90 dereceye kadar dikleşir)
            let angle = -45 + (progressY * -45); 
            rocket.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;

            // Patlama Anı Geldi mi?
            if (currentCrashMultiplier >= crashPoint) {
                currentCrashMultiplier = crashPoint;
                processCrash(currentX, currentY);
            } else {
                display.innerText = currentCrashMultiplier.toFixed(2) + "x";
                btnCashout.innerText = `ÇEKİL (${Math.floor(crashBet * currentCrashMultiplier)} GEP)`;
            }
        }, 50);

    } catch (e) { resText.innerText = "Bağlantı Hatası!"; btnStart.disabled = false; }
}

async function processCrash(x, y) {
    isCrashed = true;
    clearInterval(crashInterval);
    triggerHaptic('heavy');
    
    // 🔥 BUG FIX AŞAMASI: Sunucuya patlamayı bildir ve oturumu sildir 🔥
    try {
        await fetch(`${API}/api/arcade/crash/notify-loss`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ initData: tg.initData }) 
        });
        // Yanıtı beklemiyoruz, sadece bildirip oturumu temizlemesini sağlıyoruz.
    } catch (e) { console.error("Sunucuya bildirim hatası"); }

    let display = document.getElementById('crash-display');
    display.innerText = crashPoint.toFixed(2) + "x";
    display.style.color = "var(--danger)";
    
    let resText = document.getElementById('crash-result');
    resText.innerText = "💥 GEP ROKETİ PATLADI!";
    resText.style.color = "var(--danger)";
    
    // Görsel Patlama Değişimi
    let rocket = document.getElementById('rocket-ship');
    let explosion = document.getElementById('explosion-icon');
    
    rocket.style.display = 'none'; // Roketi gizle
    explosion.style.left = rocket.style.left; // Patlamayı roketin olduğu yere koy
    explosion.style.top = rocket.style.top;
    explosion.style.display = 'block'; // Patlamayı göster
    
    document.getElementById('btn-cashout-crash').style.display = 'none';
    const btnStart = document.getElementById('btn-start-crash');
    btnStart.style.display = 'block';
    btnStart.disabled = false;
}

async function cashoutCrash() {
    if (isCrashed) return;
    isCrashed = true;
    clearInterval(crashInterval);
    triggerHaptic('success');
    
    const btnCashout = document.getElementById('btn-cashout-crash');
    btnCashout.disabled = true;
    btnCashout.innerText = "BEKLENİYOR...";
    
    const display = document.getElementById('crash-display');
    display.style.color = "var(--gold)";
    
    try {
        const res = await fetch(`${API}/api/arcade/crash/cashout`, { 
            method: 'POST', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify({ multiplier: currentCrashMultiplier.toFixed(2), initData: tg.initData }) 
        });
        const data = await res.json();
        if (checkLockdown(data)) return;
        
        if (data.success) {
            user.points = data.points;
            updateUI();
            document.getElementById('crash-result').innerText = `✅ ÇEKİLDİN! +${data.winAmount} GEP`;
            document.getElementById('crash-result').style.color = "var(--success)";
            spawnFloatingText(null, `+${data.winAmount} GEP`, "var(--success)");
            // Ateşi söndür
            document.getElementById('rocket-fire').style.display = 'none';
        } else {
            // Sunucu çoktan patlamış dediyse (Senkronizasyon farkı)
            processCrash(0, 0); 
            document.getElementById('crash-result').innerText = "💥 ZATEN PATLAMIŞTI!";
            display.style.color = "var(--danger)";
            return;
        }
    } catch (e) { document.getElementById('crash-result').innerText = "Bağlantı Hatası!"; }
    
    document.getElementById('btn-cashout-crash').style.display = 'none';
    const btnStart = document.getElementById('btn-start-crash');
    btnStart.style.display = 'block';
    btnStart.disabled = false;
}
// ----------------------------------------

async function verifyGepcoz(token) { const resText = document.getElementById('gepcoz-result'); resText.innerText = "Doğrulanıyor..."; resText.style.color = "var(--cyan)"; try { const res = await fetch(`${API}/api/arcade/gepcoz`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ token, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if (data.success) { user.points = data.points; updateUI(); triggerHaptic('success'); resText.innerText = `✅ AĞ KIRILDI! +${data.reward} GEP`; resText.style.color = "var(--success)"; spawnFloatingText(null, `+${data.reward} GEP`, "var(--success)"); setTimeout(() => { if(hcaptchaWidgetId !== undefined && window.hcaptcha) hcaptcha.reset(hcaptchaWidgetId); resText.innerText = "Yeni şifre bekleniyor..."; resText.style.color = "#fff"; }, 3000); } else { triggerHaptic('error'); resText.innerText = `❌ HATA: ${data.message || "Bilinmiyor"}`; resText.style.color = "var(--danger)"; setTimeout(() => { if(hcaptchaWidgetId !== undefined && window.hcaptcha) hcaptcha.reset(hcaptchaWidgetId); }, 2000); } } catch(e) { resText.innerText = "❌ Bağlantı koptu."; resText.style.color = "var(--danger)"; } }
async function playZarzara() { const amount = parseInt(document.getElementById('zarzara-bet').value); if (!amount || isNaN(amount) || amount < 100) return tg.showAlert("Min bahis 100 GEP."); const btn = document.getElementById('btn-do-zarzara'); const display = document.getElementById('zarzara-display'); const resultText = document.getElementById('zarzara-result'); btn.disabled = true; resultText.innerText = "Zar atılıyor..."; resultText.style.color = "#fff"; display.classList.add('shake-box'); triggerHaptic('heavy'); try { const res = await fetch(`${API}/api/arcade/zarzara`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ bet: amount, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if (!data.success) { display.classList.remove('shake-box'); resultText.innerText = "Hata!"; tg.showAlert(data.message); btn.disabled = false; return; } setTimeout(() => { display.classList.remove('shake-box'); user.points = data.points; updateUI(); const diceEmojis = { 1: "⚀", 2: "⚁", 3: "⚂", 4: "⚃", 5: "⚄", 6: "⚅" }; display.innerText = diceEmojis[data.diceValue] || "🎲"; if (data.winAmount > 0) { resultText.innerText = `KAZANDIN! (+${data.winAmount} GEP)`; resultText.style.color = "var(--success)"; triggerHaptic('success'); spawnFloatingText(null, `+${data.winAmount} GEP`, "var(--success)"); } else { resultText.innerText = "KAYBETTİN!"; resultText.style.color = "var(--danger)"; triggerHaptic('error'); } btn.disabled = false; }, 1500); } catch(e) { display.classList.remove('shake-box'); resultText.innerText = "Bağlantı Hatası!"; btn.disabled = false; } }
async function playSpin() { const btn = document.getElementById('btn-do-spin'); const wheel = document.getElementById('spin-wheel'); const resText = document.getElementById('spin-result'); btn.disabled = true; resText.style.color = "#fff"; resText.innerText = "Dönüyor..."; triggerHaptic('heavy'); wheel.style.transition = 'none'; let currentRotation = parseFloat(wheel.getAttribute('data-rotation') || 0); let normalized = currentRotation % 360; wheel.style.transform = `rotate(${normalized}deg)`; void wheel.offsetWidth; wheel.style.transition = 'transform 4s cubic-bezier(0.15, 0.9, 0.15, 1)'; try { const res = await fetch(`${API}/api/arcade/spin`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(!data.success) { resText.innerText = "Hata oluştu."; tg.showAlert(data.message); btn.disabled = false; return; } const prizeAngles = { 0: 36, 2500: 108, 5000: 180, 10000: 252, 50000: 324 }; const targetAngle = prizeAngles[data.prize]; const offset = 360 - targetAngle; const jitter = Math.floor(Math.random() * 40) - 20; const newRotation = currentRotation + (360 * 5) + offset + jitter - normalized; wheel.style.transform = `rotate(${newRotation}deg)`; wheel.setAttribute('data-rotation', newRotation); setTimeout(() => { user.points = data.points; updateUI(); resText.innerText = data.msg; if(data.prize > 0) { resText.style.color = "var(--success)"; triggerHaptic('success'); spawnFloatingText(null, `+${data.prize} GEP`, "var(--success)"); } else { resText.style.color = "var(--danger)"; triggerHaptic('error'); } btn.disabled = false; }, 4000); } catch(e) { resText.innerText = "Bağlantı Hatası!"; btn.disabled = false; } }
async function playPredict(guess) { document.getElementById('predict-buttons').style.display = 'none'; document.getElementById('predict-loading').style.display = 'flex'; document.getElementById('predict-price').innerText = "Fiyat Alınıyor..."; triggerHaptic('medium'); const resStart = await fetch(`${API}/api/arcade/predict/start`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ guess, initData: tg.initData }) }); const dataStart = await resStart.json(); if (checkLockdown(dataStart)) return; if(!dataStart.success) { document.getElementById('predict-loading').style.display = 'none'; document.getElementById('predict-buttons').style.display = 'flex'; document.getElementById('predict-price').innerText = "Tekrar Dene"; return tg.showAlert(dataStart.message || "Hata oluştu."); } user.points = dataStart.points; updateUI(); let timeLeft = 10; document.getElementById('predict-price').innerHTML = `<span style="color:var(--cyan); font-size:24px;">Giriş: $${dataStart.price1}</span><br>Sonuç bekleniyor: ${timeLeft}s`; const timer = setInterval(() => { timeLeft--; document.getElementById('predict-price').innerHTML = `<span style="color:var(--cyan); font-size:24px;">Giriş: $${dataStart.price1}</span><br>Sonuç bekleniyor: ${timeLeft}s`; }, 1000); setTimeout(async () => { clearInterval(timer); document.getElementById('predict-price').innerText = "Sonuç Analiz Ediliyor..."; const resResult = await fetch(`${API}/api/arcade/predict/result`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const dataResult = await resResult.json(); if (checkLockdown(dataResult)) return; document.getElementById('predict-loading').style.display = 'none'; if(dataResult.success) { user.points = dataResult.points; updateUI(); const emoji = dataResult.won ? '🎉' : '💀'; const color = dataResult.won ? 'var(--success)' : 'var(--danger)'; document.getElementById('predict-price').innerHTML = `<span style="color:${color}; font-size:24px;">Giriş: $${dataResult.price1}<br>Kapanış: $${dataResult.price2}</span><br>${emoji}`; if(dataResult.won) { triggerHaptic('success'); spawnFloatingText(null, "+ Kazanıldı", "var(--success)"); } else { triggerHaptic('error'); } } else { if(dataResult.points) { user.points = dataResult.points; updateUI(); } document.getElementById('predict-price').innerText = "HATA!"; tg.showAlert(dataResult.message); } setTimeout(() => { document.getElementById('predict-buttons').style.display = 'flex'; document.getElementById('predict-price').innerText = "Tekrar Dene"; }, 4000); }, 10000); }
function resetLootbox() { document.getElementById('lootbox-selection').style.display = 'flex'; document.getElementById('lootbox-animation').style.display = 'none'; document.getElementById('btn-back-lootbox').style.display = 'none'; updateUI(); }
async function playLootbox(boxType) { const icons = { 1: "📦", 2: "🎁", 3: "💎" }; const colors = { 1: "var(--text-main)", 2: "#3b82f6", 3: "#f59e0b" }; document.getElementById('lootbox-selection').style.display = 'none'; const animDiv = document.getElementById('lootbox-animation'); const boxIcon = document.getElementById('lootbox-icon'); const resText = document.getElementById('lootbox-result'); const backBtn = document.getElementById('btn-back-lootbox'); animDiv.style.display = 'flex'; boxIcon.innerText = icons[boxType]; boxIcon.style.filter = `drop-shadow(0 0 20px ${colors[boxType]})`; resText.style.color = colors[boxType]; resText.innerText = "Kilit Çözülüyor..."; boxIcon.classList.add('shake-box'); triggerHaptic('heavy'); const res = await fetch(`${API}/api/arcade/lootbox`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ boxType, initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; setTimeout(() => { boxIcon.classList.remove('shake-box'); if(data.success) { user.points = data.points; if(data.lastLootbox1) user.lastLootbox1 = data.lastLootbox1; if(data.lastLootbox2) user.lastLootbox2 = data.lastLootbox2; if(data.lastLootbox3) user.lastLootbox3 = data.lastLootbox3; updateUI(); resText.innerText = `KAZANDIN: +${data.prize}`; boxIcon.innerText = "✨"; if(data.prize > 0) { resText.style.color = "var(--success)"; triggerHaptic('success'); spawnFloatingText(null, `+${data.prize} GEP`, "var(--success)"); } else { resText.style.color = "var(--danger)"; boxIcon.innerText = "🗑️"; triggerHaptic('error'); } } else { resText.innerText = "KİLİTLİ!"; tg.showAlert(data.message); } backBtn.style.display = 'block'; }, 1500); }
async function startMining(event) { triggerHaptic('heavy'); const btn = document.getElementById('btn-mine'); if(btn.disabled) return; btn.disabled = true; const res = await fetch(`${API}/api/mine`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; user.lastMining = new Date().toISOString(); updateUI(); triggerHaptic('success'); spawnFloatingText(event, "+" + data.reward, "var(--cyan)"); runTimer(4 * 60 * 60 * 1000); } else { triggerHaptic('error'); if(event.target && event.target.id === 'btn-mine') tg.showAlert(data.message); btn.disabled = false; } }
function checkMiningTimer() { if (!user.lastMining || new Date(user.lastMining).getTime() === 0) return; const diff = new Date().getTime() - new Date(user.lastMining).getTime(); if (diff < 4*60*60*1000) runTimer(4*60*60*1000 - diff); }
function runTimer(timeLeft) { const btn = document.getElementById('btn-mine'); const timerDiv = document.getElementById('mining-timer'); const statusText = document.getElementById('mine-status-text'); const glow = document.getElementById('core-glow'); const icon = document.getElementById('mine-icon'); btn.disabled = true; timerDiv.style.display = "block"; statusText.innerText = "ÜRETİM DEVAM EDİYOR"; statusText.style.color = "var(--text-dim)"; glow.style.animation = "none"; icon.style.filter = "grayscale(100%) opacity(0.5)"; clearInterval(miningInterval); miningInterval = setInterval(() => { timeLeft -= 1000; if (timeLeft <= 0) { clearInterval(miningInterval); btn.disabled = false; timerDiv.style.display = "none"; statusText.innerText = "SİSTEM HAZIR"; statusText.style.color = "#fff"; glow.style.animation = "pulse 3s infinite"; icon.style.filter = "drop-shadow(0 10px 20px rgba(0,0,0,0.5))"; triggerHaptic('notification'); return; } const h = Math.floor(timeLeft / 3600000); const m = Math.floor((timeLeft % 3600000) / 60000); const s = Math.floor((timeLeft % 60000) / 1000); timerDiv.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; }, 1000); }
async function upgradeMine(event) { triggerHaptic('light'); const upgradeCost = (user.miningLevel || 1) * 10000; tg.showConfirm(`SEVİYE YÜKSELT ${(user.miningLevel || 1) + 1}?\n\nGEREKEN: ${upgradeCost.toLocaleString()} GEP`, async (confirmed) => { if (!confirmed) return; const btn = document.getElementById('btn-upgrade'); btn.disabled = true; const res = await fetch(`${API}/api/upgrade-mine`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; user.miningLevel = data.newLevel; updateUI(); triggerHaptic('success'); spawnFloatingText(event, "LVL UP!", "var(--gold)"); tg.showAlert(`GÜNCELLEME TAMAM! LVL: ${data.newLevel}`); } else { triggerHaptic('error'); tg.showAlert(data.message); } btn.disabled = false; }); }
async function showAd(event) { triggerHaptic('medium'); if (user.adTickets <= 0) return tg.showAlert("Hiç reklam biletiniz kalmadı!"); if(!AdController) return tg.showAlert("Reklam hazır değil."); AdController.show().then(async (result) => { if (result.done) { const res = await fetch(`${API}/api/adsgram-reward`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); if (res.ok) { const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { user.points = data.points; user.adTickets = data.adTickets; updateUI(); triggerHaptic('success'); spawnFloatingText(event, `+${data.reward}`, "var(--success)"); tg.showAlert(`Tebrikler! +${data.reward} GEP eklendi.`); } else { tg.showAlert(data.message); } } } }).catch(e => {}); }
function renderStreak() { const streakBox = document.getElementById('streak-box'); if(!streakBox) return; streakBox.innerHTML = ''; const currentStreak = user.streak || 0; for (let i = 1; i <= 7; i++) { const rewardVal = 1000 * Math.pow(2, i - 1); const displayVal = rewardVal >= 1000 ? (rewardVal / 1000) + 'K' : rewardVal; const dayDiv = document.createElement('div'); dayDiv.className = `streak-day ${i <= currentStreak ? 'completed' : ''}`; dayDiv.innerHTML = `<div style="font-weight:800; font-size:11px; margin-bottom:4px; opacity:0.8">GÜN ${i}</div><div style="font-family:'Space Grotesk'; font-weight:700; font-size:11px; color:var(--gold);">${displayVal}</div>`; streakBox.appendChild(dayDiv); } }
async function claimDaily(event) { triggerHaptic('medium'); const res = await fetch(`${API}/api/daily-reward`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); const data = await res.json(); if (checkLockdown(data)) return; if(data.success) { triggerHaptic('success'); spawnFloatingText(event, "+" + data.reward, "var(--gold)"); tg.showAlert(`🎉 Ödül Alındı! Seri: ${data.streak}. GÜN (+${data.reward} GEP)`); init(); } else { triggerHaptic('error'); tg.showAlert(data.message); } }
function renderAnnouncements(annList) { const annContainer = document.getElementById('ann-container'); const annScroll = document.getElementById('ann-scroll'); if (annList && annList.length > 0) { annScroll.innerText = annList.join(" 🔔 ") + " 🔔 "; annContainer.style.display = 'flex'; } else { annContainer.style.display = 'none'; } }
async function loadLeaderboard() { const list = document.getElementById('leader-list'); list.innerHTML = `<p style='text-align:center; padding: 30px; font-weight:600; color:var(--text-dim);'>YÜKLENİYOR...</p>`; const res = await fetch(`${API}/api/leaderboard`); const data = await res.json(); if(data.success) { lbAllTime = data.leaderboard || []; lbDaily = data.dailyLeaderboard || []; renderLB(); } }
function switchLB(tab) { triggerHaptic('light'); currentLbTab = tab; const tabs = ['all', 'daily']; tabs.forEach(tName => { const btn = document.getElementById(`tab-lb-${tName}`); if (btn) { if (tName === tab) btn.classList.add('active'); else btn.classList.remove('active'); } }); const infoPanel = document.getElementById('weekly-reward-info'); if (infoPanel) { if (tab === 'daily') infoPanel.style.display = 'block'; else infoPanel.style.display = 'none'; } renderLB(); }
function renderLB() { const list = document.getElementById('leader-list'); let dataToRender = []; if(currentLbTab === 'all') dataToRender = lbAllTime; else dataToRender = lbDaily; if(dataToRender.length === 0) { list.innerHTML = `<p style='text-align:center; padding: 30px; color: var(--text-dim); font-weight:600;'>KAYIT BULUNAMADI.</p>`; return; } list.innerHTML = dataToRender.map((u, i) => { const rank = (i + 1); let displayPoints = u.points; if(currentLbTab === 'daily') displayPoints = u.dailyPoints || 0; let rewardTag = ''; if (currentLbTab === 'daily' && i < 5) { rewardTag = `<span style="background: var(--success); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 800;">+$5 💵</span>`; } return `<div class="list-row ${i < 3 ? 'rank-top' : ''}"><span style="color: ${i < 3 ? 'var(--gold)' : 'var(--text-main)'}; font-weight: ${i < 3 ? 800 : 600}; font-size:15px; display:flex; align-items:center;">${rank}. ${u.username || u.firstName} ${rewardTag}</span><span style="font-family:'Space Grotesk'; color: ${i < 3 ? 'var(--gold)' : 'var(--cyan)'}; font-weight:700;">${displayPoints.toLocaleString()}</span></div>`; }).join(''); }
function copyRef(e) { triggerHaptic('success'); document.getElementById('ref-link').select(); document.execCommand('copy'); spawnFloatingText(e, "KOPYALANDI!", "var(--success)"); }
window.onload = init;
