const tg = window.Telegram.WebApp; 
tg.expand(); 
tg.setHeaderColor('#000109'); 
const API = window.location.origin;
let user, tasks = [], lbAllTime = [], lbWeekly = []; 
let currentLbTab = 'all'; 

function triggerHaptic(type = 'light') { if(tg.HapticFeedback) { if(type === 'success') tg.HapticFeedback.notificationOccurred('success'); else if(type === 'error') tg.HapticFeedback.notificationOccurred('error'); else tg.HapticFeedback.impactOccurred(type); } }

async function init() {
    try {
        const tgUser = tg.initDataUnsafe?.user;
        if (!tgUser) return;
        const res = await fetch(`${API}/api/user/auth`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ username: tgUser.username || "", firstName: tgUser.first_name || "Kullanıcı", initData: tg.initData }) });
        const data = await res.json();
        if (data.success) {
            user = data.user;
            document.getElementById('header-name').innerText = (user.username ? '@'+user.username : user.firstName).toUpperCase();
            updateUI(); refreshTasks(); loadLeaderboard();
        }
    } catch (e) { } finally { document.getElementById('loader').style.display='none'; }
}

function updateUI() {
    if (!user) return; 
    document.getElementById('balance').innerText = Math.floor(user.points).toLocaleString(); 
    document.getElementById('usd').innerText = `≈ ${(user.points / 100000).toFixed(2)} USDT`; 
}

function showPage(p, el) { 
    triggerHaptic('light'); 
    document.querySelectorAll('.page').forEach(page => page.classList.remove('active')); 
    document.querySelectorAll('.dock-item').forEach(nav => nav.classList.remove('active')); 
    document.getElementById(`page-${p}`).classList.add('active'); 
    if(el) el.classList.add('active'); 
    if(p === 'network') loadLeaderboard();
}

async function loadLeaderboard() {
    const res = await fetch(`${API}/api/leaderboard`);
    const data = await res.json();
    if(data.success) {
        lbAllTime = data.leaderboard || [];
        lbWeekly = data.dailyLeaderboard || [];
        renderLB();
    }
}

function switchLB(tab) { 
    triggerHaptic('light'); currentLbTab = tab; 
    document.getElementById('tab-lb-all').classList.toggle('active', tab === 'all');
    document.getElementById('tab-lb-weekly').classList.toggle('active', tab === 'weekly');
    document.getElementById('weekly-reward-info').style.display = (tab === 'weekly') ? 'block' : 'none';
    renderLB(); 
}

function renderLB() { 
    const list = document.getElementById('leader-list'); 
    let dataToRender = (currentLbTab === 'all') ? lbAllTime : lbWeekly; 
    
    if(dataToRender.length === 0) { list.innerHTML = `<p style='text-align:center; padding: 30px; color: var(--text-dim);'>KAYIT BULUNAMADI.</p>`; return; } 
    
    list.innerHTML = dataToRender.map((u, i) => { 
        let points = (currentLbTab === 'all') ? u.points : u.dailyPoints;
        let rewardTag = (currentLbTab === 'weekly' && i < 5) ? `<span style="background: var(--success); color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 6px; margin-left: 8px; font-weight: 800;">+$5 💵</span>` : '';

        return `<div class="list-row ${i < 3 ? 'rank-top' : ''}"><span style="color: ${i < 3 ? 'var(--gold)' : 'var(--text-main)'}; font-weight: 800; font-size:15px; display:flex; align-items:center;">${i+1}. ${u.username || u.firstName} ${rewardTag}</span><span style="font-family:'Space Grotesk'; font-weight:700;">${Math.floor(points).toLocaleString()}</span></div>`; 
    }).join(''); 
}

window.onload = init;
