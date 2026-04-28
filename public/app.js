const tg = window.Telegram.WebApp; 
tg.expand(); 
tg.setHeaderColor('#000109'); 
const API = window.location.origin;
let user, tasks = [], miningInterval; 
let lbAllTime = [], lbWeekly = []; 
let currentLbTab = 'all'; 
const AdController = window.Adsgram ? window.Adsgram.init({ blockId: "27433" }) : null; 
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
            
            const refLinkInput = document.getElementById('ref-link');
            if(refLinkInput) refLinkInput.value = `https://t.me/${data.botUsername}?start=${user.telegramId}`;
            
            if(user.isAdmin) {
                const adminBtn = document.getElementById('admin-panel-btn');
                if(adminBtn) adminBtn.style.display = 'block';
            }
            
            const headerName = document.getElementById('header-name');
            if(headerName) headerName.innerText = (user.username ? '@'+user.username : user.firstName).toUpperCase();
            
            await refreshTasks(); updateUI(); checkMiningTimer(); renderStreak(); loadAirdrops(); 
            if (data.announcements) renderAnnouncements(data.announcements);
        } else {
            tg.showAlert(data.message);
        }
    } catch (e) { 
        console.error("Init Hatası:", e); 
    } finally { 
        setTimeout(() => { 
            const loader = document.getElementById('loader'); 
            if(loader) {
                loader.style.opacity = '0'; 
                setTimeout(()=> loader.style.display='none', 500);
            }
        }, 800); 
    }
}

function updateUI() {
    if (!user) return; 
    
    const balanceEl = document.getElementById('balance');
    if(balanceEl) balanceEl.innerText = Math.floor(user.points).toLocaleString(); 
    
    const usdEl = document.getElementById('usd');
    if(usdEl) usdEl.innerText = `≈ ${(user.points / 100000).toFixed(2)} USDT`; 
    
    const userLvl = document.getElementById('user-level');
    if(userLvl) userLvl.innerText = `${user.level || 'STANDART'} ÜYE`; 
    
    const refCount = document.getElementById('stat-ref-count');
    if (refCount) refCount.innerText = user.referralCount || 0; 
    
    const uiMineLevel = document.getElementById('ui-mine-level');
    if(uiMineLevel) uiMineLevel.innerText = user.miningLevel || 1; 
    
    const uiMineReward = document.getElementById('ui-mine-reward');
    if(uiMineReward) uiMineReward.innerText = `${(1000 + (((user.miningLevel || 1) - 1) * 500)).toLocaleString()}`; 
    
    const uiUpgradeCost = document.getElementById('ui-upgrade-cost');
    if(uiUpgradeCost) uiUpgradeCost.innerText = `GEREKEN: ${((user.miningLevel || 1) * 10000).toLocaleString()} GEP`; 
    
    const uiAdTickets = document.getElementById('ui-ad-tickets');
    if(uiAdTickets) uiAdTickets.innerText = user.adTickets || 0;
    
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
    const targetPage = document.getElementById(`page-${p}`);
    if(targetPage) targetPage.classList.add('active'); 
    if(el) el.classList.add('active'); 
    if(p === 'network') loadLeaderboard();
    if(p === 'admin') loadAdminStats(); 
}

async function joinProject(projectId, url) {
    const btn = document.querySelector(`#ad-${projectId} .btn-join`);
    if(!btn) return;

    if (btn.innerText.includes("KATIL")) {
        triggerHaptic('light');
        try { tg.openLink(url); } catch(e) { window.open(url, '_blank'); }
        btn.innerText = "🔄 KONTROL ET";
        btn.style.background = "#f59e0b"; 
    } 
    else if (btn.innerText.includes("KONTROL ET")) {
        triggerHaptic('medium');
        btn.disabled = true;
        btn.style.background = "#10b981"; 
        btn.style.opacity = "0.6";
        btn.innerText = "⏳ BEKLENİYOR...";

        setTimeout(async () => {
            try {
                const res = await fetch(`${API}/api/airdrop/join`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ projectId, initData: tg.initData }) });
                const data = await res.json();
                if(data.success) {
                    user.points = data.points; updateUI(); triggerHaptic('success'); spawnFloatingText(null, "+10.000 GEP", "var(--success)"); tg.showAlert("Tebrikler! Projeye katıldığın için 10.000 GEP kazandın.");
                    btn.innerText = "✅ KATILINDI"; btn.style.opacity = "0.6";
                } else {
                    btn.innerText = "❌ HATA"; tg.showAlert(data.message); loadAirdrops(); 
                }
            } catch(e) { btn.innerText = "🔄 KONTROL ET"; btn.disabled = false; btn.style.background = "#f59e0b"; btn.style.opacity = "1"; }
        }, 2000);
    }
}

async function loadAirdrops() {
    try {
        const res = await fetch(`${API}/api/airdrop/list`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
        const data = await res.json(); const listDiv = document.getElementById('airdrop-list');
        if(data.success && data.links.length > 0) {
            listDiv.innerHTML = data.links.map(l => {
                let btnHtml = '';
                if (l.isOwner) { btnHtml = `<button class="btn-join" style="background:#475569; cursor:not-allowed;" disabled>SENİN PROJEN</button>`; } 
                else if (l.hasJoined) { btnHtml = `<button class="btn-join" style="background:#10b981; cursor:not-allowed; opacity:0.6;" disabled>✅ KATILINDI</button>`; } 
                else { btnHtml = `<button class="btn-join" onclick="joinProject('${l._id}', '${l.url}')">🚀 KATIL (+10.000 GEP)</button>`; }
                return `<div class="airdrop-item" id="ad-${l._id}"><div style="flex:1;"><div class="ad-user">@${l.username}</div><div class="ad-title">${l.title}</div><div class="ad-desc">${l.description}</div>${btnHtml}</div>${user.isAdmin ? `<button class="btn-delete-ad" onclick="deleteAirdrop('${l._id}')">SİL</button>` : ''}</div>`;
            }).join('');
        } else { if(listDiv) listDiv.innerHTML = "<div style='text-align:center; color:var(--text-dim); font-size:12px; padding:10px;'>Henüz hiç proje eklenmemiş. İlk sen ol!</div>"; }
    } catch(e) {}
}

async function postAirdrop() {
    const btn = document.getElementById('btn-post-ad');
    if(btn && btn.disabled) return;
    triggerHaptic('medium'); 
    if (user.points < 1000000) return tg.showAlert("Yetersiz GEP! 1.000.000 GEP gerekli.");
    const title = document.getElementById('ad-title').value.trim(); const desc = document.getElementById('ad-desc').value.trim(); const url = document.getElementById('ad-link').value.trim();
    if(!title || !desc || !url) return tg.showAlert("Tüm alanları doldurmalısın.");
    if(!url.startsWith("http://") && !url.startsWith("https://")) return tg.showAlert("Geçerli bir link (https:// veya http://) girmelisin.");
    if(btn) { btn.disabled = true; btn.style.opacity = "0.5"; btn.innerText = "YÜKLENİYOR..."; }
    try {
        const res = await fetch(`${API}/api/airdrop/share`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title, description: desc, url, initData: tg.initData }) });
        const data = await res.json();
        if(data.success) { user.points = data.points; updateUI(); triggerHaptic('success'); tg.showAlert(data.message); document.getElementById('ad-title').value = ''; document.getElementById('ad-desc').value = ''; document.getElementById('ad-link').value = ''; loadAirdrops(); } 
        else { triggerHaptic('error'); tg.showAlert(data.message); }
    } catch(e) { tg.showAlert("Bağlantı hatası oluştu!"); } finally { if(btn) { btn.disabled = false; btn.style.opacity = "1"; btn.innerText = "YAYINLA (1M GEP)"; } }
}

async function deleteAirdrop(id) { if(!user.isAdmin) return; await fetch(`${API}/api/admin/delete-airdrop`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ id, initData: tg.initData }) }); document.getElementById(`ad-${id}`).remove(); }

async function refreshTasks() { const tRes = await fetch(`${API}/api/tasks`); const tData = await tRes.json(); tasks = tData.tasks || []; renderTasks(); }

function renderTasks() { 
    const cont = document.getElementById('task-list'); 
    if(!cont) return; 
    cont.innerHTML = tasks.map(tData => { 
        const isDone = user.completedTasks.includes(tData.taskId); 
        return `<div class="task-card" style="${isDone ? 'opacity:0.5;' : ''}"><div><div style="font-weight: 800; font-size:14px; margin-bottom: 4px;">${tData.title}</div><div style="font-family: 'Space Grotesk'; color: ${isDone ? 'var(--text-dim)' : 'var(--gold)'}; font-weight: 700;">+${tData.reward} GEP</div></div><button id="task-btn-${tData.taskId}" class="game-btn ${isDone ? '' : 'btn-outline'}" style="${isDone ? 'background:#1e293b; color:#64748b; padding:10px 20px; width:auto; font-size:12px; box-shadow:none;' : 'padding:10px 20px; width:auto; font-size:12px;'}" ${isDone ? 'disabled' : ''} onclick="completeTask(event, '${tData.taskId}','${tData.target}')">${isDone ? '✅ BİTTİ' : '🚀 GİT'}</button></div>`; 
    }).join(''); 
}

async function completeTask(e, tid, link) { 
    const btn = document.getElementById(`task-btn-${tid}`);
    if (!btn) return;
    if (btn.innerText.includes("GİT")) {
        triggerHaptic('light'); 
        try { tg.openLink(link); } catch(err) { window.open(link, '_blank'); }
        btn.innerText = "🔄 KONTROL ET"; btn.style.background = "#f59e0b"; btn.style.color = "#fff"; btn.classList.remove('btn-outline');
    } 
    else if (btn.innerText.includes("KONTROL ET")) {
        triggerHaptic('medium'); btn.disabled = true; btn.innerText = "⏳ BEKLENİYOR..."; btn.style.opacity = "0.6"; btn.style.background = "#10b981";
        setTimeout(async () => { 
            try {
                const res = await fetch(`${API}/api/tasks/complete`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ taskId: tid, initData: tg.initData }) }); 
                const data = await res.json(); 
                if(data.success) { triggerHaptic('success'); spawnFloatingText(e, "GÖREV TAMAM!", "var(--success)"); init(); } 
                else { btn.innerText = "🚀 GİT"; btn.disabled = false; btn.style.opacity = "1"; btn.style.background = "transparent"; btn.classList.add('btn-outline'); }
            } catch(err) { btn.innerText = "🔄 KONTROL ET"; btn.disabled = false; btn.style.opacity = "1"; btn.style.background = "#f59e0b"; }
        }, 2000); 
    }
}

let isBuyingPkg = false;
async function buyAdPackage(pid) { 
    if (isBuyingPkg) return; triggerHaptic('light'); let cost = pid === 1 ? 10000 : (pid === 2 ? 50000 : 100000); 
    if (user.points < cost) return tg.showAlert("Yetersiz GEP Bakiye!"); isBuyingPkg = true;
    try {
        const res = await fetch(`${API}/api/buy-ad-package`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ packageId: pid, initData: tg.initData }) }); 
        const data = await res.json(); 
        if(data.success) { user.points = data.points; user.adTickets = data.adTickets; updateUI(); triggerHaptic('success'); tg.showAlert("Bilet Paketi Satın Alındı!"); } 
        else { triggerHaptic('error'); tg.showAlert(data.message); } 
    } catch (e) { tg.showAlert("Bağlantı hatası!"); } finally { isBuyingPkg = false; }
}

async function redeemPromo() { 
    const btn = document.getElementById('btn-redeem-promo'); if (btn && btn.disabled) return;
    triggerHaptic('medium'); const codeInput = document.getElementById('ui-promo-code'); const code = codeInput.value.trim(); 
    if(!code) return tg.showAlert("Lütfen bir kod girin."); if(btn) { btn.disabled = true; btn.style.opacity = "0.5"; }
    try {
        const res = await fetch(`${API}/api/redeem-promo`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ code: code, initData: tg.initData }) }); 
        const data = await res.json(); 
        if(data.success) { user.points = data.points; updateUI(); codeInput.value = ''; triggerHaptic('success'); spawnFloatingText(null, `+${data.reward} GEP`, "var(--success)"); tg.showAlert(`Tebrikler! ${data.reward} GEP Kazandın!`); } 
        else { triggerHaptic('error'); tg.showAlert(data.message); } 
    } catch (e) { tg.showAlert("Bağlantı hatası!"); } finally { if(btn) { btn.disabled = false; btn.style.opacity = "1"; } }
}

function openGame(game) { 
    triggerHaptic('light'); 
    const modal = document.getElementById(`modal-${game}`);
    if(modal) modal.style.display = 'flex'; 
    
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
}

function closeGame(game) { 
    triggerHaptic('light'); 
    const modal = document.getElementById(`modal-${game}`);
    if(modal) modal.style.display = 'none'; 
}

async function playSpin() { 
    if (user.points < 500) return tg.showAlert("Yetersiz GEP!"); 
    const btn = document.getElementById('btn-do-spin'); const wheel = document.getElementById('spin-wheel'); const resText = document.getElementById('spin-result'); 
    btn.disabled = true; resText.style.color = "#fff"; resText.innerText = "Dönüyor..."; triggerHaptic('heavy'); 
    
    wheel.style.transition = 'none';
    let currentRotation = parseFloat(wheel.getAttribute('data-rotation') || 0);
    let normalized = currentRotation % 360;
    wheel.style.transform = `rotate(${normalized}deg)`;
    void wheel.offsetWidth; 
    
    wheel.style.transition = 'transform 4s cubic-bezier(0.15, 0.9, 0.15, 1)';
    
    try {
        const res = await fetch(`${API}/api/arcade/spin`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
        const data = await res.json(); 
        if(!data.success) { resText.innerText = "Hata oluştu."; tg.showAlert(data.message); btn.disabled = false; return; } 
        
        const prizeAngles = { 0: 36, 250: 108, 500: 180, 1000: 252, 5000: 324 }; 
        const targetAngle = prizeAngles[data.prize]; 
        const offset = 360 - targetAngle;
        const jitter = Math.floor(Math.random() * 40) - 20; 
        
        const newRotation = currentRotation + (360 * 5) + offset + jitter - normalized;
        
        wheel.style.transform = `rotate(${newRotation}deg)`;
        wheel.setAttribute('data-rotation', newRotation);
        
        setTimeout(() => { 
            user.points = data.points; updateUI(); resText.innerText = data.msg; 
            if(data.prize > 0) { resText.style.color = "var(--success)"; triggerHaptic('success'); spawnFloatingText(null, `+${data.prize} GEP`, "var(--success)"); } 
            else { resText.style.color = "var(--danger)"; triggerHaptic('error'); } 
            btn.disabled = false; 
        }, 4000); 
    } catch(e) { resText.innerText = "Bağlantı Hatası!"; btn.disabled = false; }
}

async function playPredict(guess) {
    if (user.points < 1000) return tg.showAlert("Yetersiz GEP!");
    document.getElementById('predict-buttons').style.display = 'none';
    document.getElementById('predict-loading').style.display = 'flex';
    document.getElementById('predict-price').innerText = "Fiyat Alınıyor...";
    triggerHaptic('medium');

    const resStart = await fetch(`${API}/api/arcade/predict/start`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ guess, initData: tg.initData }) });
    const dataStart = await resStart.json();

    if(!dataStart.success) {
        document.getElementById('predict-loading').style.display = 'none';
        document.getElementById('predict-buttons').style.display = 'flex';
        document.getElementById('predict-price').innerText = "Tekrar Dene";
        return tg.showAlert(dataStart.message || "Hata oluştu.");
    }

    user.points = dataStart.points; updateUI();
    let timeLeft = 10;
    document.getElementById('predict-price').innerHTML = `<span style="color:var(--cyan); font-size:24px;">Giriş: $${dataStart.price1}</span><br>Sonuç bekleniyor: ${timeLeft}s`;

    const timer = setInterval(() => {
        timeLeft--;
        document.getElementById('predict-price').innerHTML = `<span style="color:var(--cyan); font-size:24px;">Giriş: $${dataStart.price1}</span><br>Sonuç bekleniyor: ${timeLeft}s`;
    }, 1000);

    setTimeout(async () => {
        clearInterval(timer);
        document.getElementById('predict-price').innerText = "Sonuç Analiz Ediliyor...";

        const resResult = await fetch(`${API}/api/arcade/predict/result`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
        const dataResult = await resResult.json();

        document.getElementById('predict-loading').style.display = 'none';

        if(dataResult.success) {
            user.points = dataResult.points; updateUI(); const emoji = dataResult.won ? '🎉' : '💀'; const color = dataResult.won ? 'var(--success)' : 'var(--danger)';
            document.getElementById('predict-price').innerHTML = `<span style="color:${color}; font-size:24px;">Giriş: $${dataResult.price1}<br>Kapanış: $${dataResult.price2}</span><br>${emoji}`;
            if(dataResult.won) { triggerHaptic('success'); spawnFloatingText(null, "+2000 GEP", "var(--success)"); } else { triggerHaptic('error'); }
        } else {
            if(dataResult.points) { user.points = dataResult.points; updateUI(); }
            document.getElementById('predict-price').innerText = "HATA!"; tg.showAlert(dataResult.message);
        }

        setTimeout(() => { document.getElementById('predict-buttons').style.display = 'flex'; document.getElementById('predict-price').innerText = "Tekrar Dene"; }, 4000);
    }, 10000);
}

function resetLootbox() { 
    const lbSelection = document.getElementById('lootbox-selection');
    if(lbSelection) lbSelection.style.display = 'flex'; 
    const lbAnim = document.getElementById('lootbox-animation');
    if(lbAnim) lbAnim.style.display = 'none'; 
    const btnBack = document.getElementById('btn-back-lootbox');
    if(btnBack) btnBack.style.display = 'none'; 
    updateUI(); 
}

async function playLootbox(boxType) { 
    const costs = { 1: 1000, 2: 5000, 3: 25000 }; const icons = { 1: "📦", 2: "🎁", 3: "💎" }; const colors = { 1: "var(--text-main)", 2: "#3b82f6", 3: "#f59e0b" }; 
    if (user.points < costs[boxType]) return tg.showAlert("Yetersiz GEP!");
    document.getElementById('lootbox-selection').style.display = 'none';
    const animDiv = document.getElementById('lootbox-animation'); const boxIcon = document.getElementById('lootbox-icon'); const resText = document.getElementById('lootbox-result'); const backBtn = document.getElementById('btn-back-lootbox');
    animDiv.style.display = 'flex'; boxIcon.innerText = icons[boxType]; boxIcon.style.filter = `drop-shadow(0 0 20px ${colors[boxType]})`; resText.style.color = colors[boxType]; resText.innerText = "Kilit Çözülüyor...";
    boxIcon.classList.add('shake-box'); triggerHaptic('heavy');
    const res = await fetch(`${API}/api/arcade/lootbox`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ boxType, initData: tg.initData }) });
    const data = await res.json();
    setTimeout(() => {
        boxIcon.classList.remove('shake-box');
        if(data.success) {
            user.points = data.points; if(data.lastLootbox1) user.lastLootbox1 = data.lastLootbox1; if(data.lastLootbox2) user.lastLootbox2 = data.lastLootbox2; if(data.lastLootbox3) user.lastLootbox3 = data.lastLootbox3;
            updateUI(); resText.innerText = data.msg; boxIcon.innerText = "✨";
            if(data.prize > 0) { resText.style.color = "var(--success)"; triggerHaptic('success'); spawnFloatingText(null, `+${data.prize} GEP`, "var(--success)"); } 
            else { resText.style.color = "var(--danger)"; boxIcon.innerText = "🗑️"; triggerHaptic('error'); }
        } else { resText.innerText = "KİLİTLİ!"; tg.showAlert(data.message); }
        backBtn.style.display = 'block';
    }, 1500); 
}

async function startMining(event) { 
    triggerHaptic('heavy'); 
    const btn = document.getElementById('btn-mine'); 
    if(btn.disabled) return; 
    btn.disabled = true; 
    const res = await fetch(`${API}/api/mine`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
    const data = await res.json(); 
    if(data.success) { 
        user.points = data.points; 
        user.lastMining = new Date().toISOString(); 
        updateUI(); 
        triggerHaptic('success'); 
        spawnFloatingText(event, "+" + data.reward, "var(--cyan)"); 
        runTimer(4 * 60 * 60 * 1000); 
    } else { 
        triggerHaptic('error'); 
        if(event.target && event.target.id === 'btn-mine') tg.showAlert(data.message); 
        btn.disabled = false; 
    } 
}

function checkMiningTimer() { 
    if (!user.lastMining || new Date(user.lastMining).getTime() === 0) return; 
    const diff = new Date().getTime() - new Date(user.lastMining).getTime(); 
    if (diff < 4*60*60*1000) runTimer(4*60*60*1000 - diff); 
}

function runTimer(timeLeft) { 
    const btn = document.getElementById('btn-mine'); 
    const timerDiv = document.getElementById('mining-timer'); 
    const statusText = document.getElementById('mine-status-text'); 
    const glow = document.getElementById('core-glow'); 
    const icon = document.getElementById('mine-icon'); 
    
    if(btn) btn.disabled = true; 
    if(timerDiv) timerDiv.style.display = "block"; 
    if(statusText) { statusText.innerText = "ÜRETİM DEVAM EDİYOR"; statusText.style.color = "var(--text-dim)"; }
    if(glow) glow.style.animation = "none"; 
    if(icon) icon.style.filter = "grayscale(100%) opacity(0.5)"; 
    
    clearInterval(miningInterval); 
    miningInterval = setInterval(() => { 
        timeLeft -= 1000; 
        if (timeLeft <= 0) { 
            clearInterval(miningInterval); 
            if(btn) btn.disabled = false; 
            if(timerDiv) timerDiv.style.display = "none"; 
            if(statusText) { statusText.innerText = "SİSTEM HAZIR"; statusText.style.color = "#fff"; }
            if(glow) glow.style.animation = "pulse 3s infinite"; 
            if(icon) icon.style.filter = "drop-shadow(0 10px 20px rgba(0,0,0,0.5))"; 
            triggerHaptic('notification'); 
            return; 
        } 
        const h = Math.floor(timeLeft / 3600000); 
        const m = Math.floor((timeLeft % 3600000) / 60000); 
        const s = Math.floor((timeLeft % 60000) / 1000); 
        if(timerDiv) timerDiv.innerText = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`; 
    }, 1000); 
}

async function upgradeMine(event) { 
    triggerHaptic('light'); 
    const upgradeCost = (user.miningLevel || 1) * 10000; 
    tg.showConfirm(`SEVİYE YÜKSELT ${(user.miningLevel || 1) + 1}?\n\nGEREKEN: ${upgradeCost.toLocaleString()} GEP`, async (confirmed) => { 
        if (!confirmed) return; 
        const btn = document.getElementById('btn-upgrade'); 
        btn.disabled = true; 
        const res = await fetch(`${API}/api/upgrade-mine`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
        const data = await res.json(); 
        if(data.success) { 
            user.points = data.points; 
            user.miningLevel = data.newLevel; 
            updateUI(); 
            triggerHaptic('success'); 
            spawnFloatingText(event, "LVL UP!", "var(--gold)"); 
            tg.showAlert(`GÜNCELLEME TAMAM! LVL: ${data.newLevel}`); 
        } else { 
            triggerHaptic('error'); 
            tg.showAlert(data.message); 
        } 
        btn.disabled = false; 
    }); 
}

async function showAd(event) { 
    triggerHaptic('medium'); 
    if (user.adTickets <= 0) return tg.showAlert("Hiç reklam biletiniz kalmadı!"); 
    if(!AdController) return tg.showAlert("Reklam hazır değil."); 
    AdController.show().then(async (result) => { 
        if (result.done) { 
            const res = await fetch(`${API}/api/adsgram-reward`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
            if (res.ok) { 
                const data = await res.json(); 
                if(data.success) { 
                    user.points = data.points; 
                    user.adTickets = data.adTickets; 
                    updateUI(); 
                    triggerHaptic('success'); 
                    spawnFloatingText(event, "+5000", "var(--success)"); 
                    tg.showAlert("Tebrikler! +5000 GEP eklendi."); 
                } else { 
                    tg.showAlert(data.message); 
                } 
            } 
        } 
    }).catch(e => {}); 
}

async function claimDaily(event) { 
    triggerHaptic('medium'); 
    const res = await fetch(`${API}/api/daily-reward`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) }); 
    const data = await res.json(); 
    if(data.success) { 
        triggerHaptic('success'); 
        spawnFloatingText(event, "+" + data.reward, "var(--gold)"); 
        tg.showAlert(`🎉 Ödül Alındı! Seri: ${data.streak}. GÜN (+${data.reward} GEP)`); 
        init(); 
    } else { 
        triggerHaptic('error'); 
        tg.showAlert(data.message); 
    } 
}

function renderAnnouncements(annList) { 
    const annContainer = document.getElementById('ann-container'); 
    const annScroll = document.getElementById('ann-scroll'); 
    if (annList && annList.length > 0) { 
        if(annScroll) annScroll.innerText = annList.join(" 🔔 ") + " 🔔 "; 
        if(annContainer) annContainer.style.display = 'flex'; 
    } else { 
        if(annContainer) annContainer.style.display = 'none';
