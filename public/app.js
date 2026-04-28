const tg = window.Telegram.WebApp; 
tg.expand(); 
const API = window.location.origin;
let user, miningInterval, lbAll = [], lbWeekly = []; 

async function init() {
    const tgUser = tg.initDataUnsafe?.user;
    if (!tgUser) return;
    const res = await fetch(`${API}/api/user/auth`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData, username: tgUser.username, firstName: tgUser.first_name }) });
    const data = await res.json();
    if (data.success) {
        user = data.user;
        document.getElementById('header-name').innerText = (user.username || user.firstName).toUpperCase();
        if(data.isAdmin) document.getElementById('admin-panel-btn').style.display='block';
        document.getElementById('ref-link').value = `https://t.me/${data.botUsername}?start=${user.telegramId}`;
        updateUI(); checkMiningTimer(); renderStreak(); refreshTasks(); loadAirdrops();
    }
    document.getElementById('loader').style.display='none';
}

function updateUI() {
    if(!user) return;
    document.getElementById('balance').innerText = Math.floor(user.points).toLocaleString();
    document.getElementById('usd').innerText = `≈ ${(user.points / 100000).toFixed(2)} USDT`;
    document.getElementById('ui-mine-level').innerText = user.miningLevel;
    document.getElementById('ui-mine-reward').innerText = 1000 + ((user.miningLevel-1)*500);
}

function showPage(p, el) {
    document.querySelectorAll('.page').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.dock-item').forEach(x => x.classList.remove('active'));
    document.getElementById(`page-${p}`).classList.add('active');
    if(el) el.classList.add('active');
    if(p === 'network') loadLeaderboard();
}

async function startMining(e) {
    const res = await fetch(`${API}/api/mine`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
    const data = await res.json();
    if(data.success) { user.points = data.points; updateUI(); runTimer(4*60*60*1000); }
}

function runTimer(ms) {
    const div = document.getElementById('mining-timer');
    div.style.display = 'block';
    clearInterval(miningInterval);
    miningInterval = setInterval(() => {
        ms -= 1000;
        if(ms <= 0) { clearInterval(miningInterval); div.style.display='none'; return; }
        let h = Math.floor(ms/3600000), m = Math.floor((ms%3600000)/60000), s = Math.floor((ms%60000)/1000);
        div.innerText = `${h}:${m}:${s}`;
    }, 1000);
}

async function loadLeaderboard() {
    const res = await fetch(`${API}/api/leaderboard`);
    const data = await res.json();
    lbAll = data.leaderboard; lbWeekly = data.dailyLeaderboard;
    renderLB('all');
}

function switchLB(tab) {
    document.getElementById('tab-lb-all').classList.toggle('active', tab==='all');
    document.getElementById('tab-lb-weekly').classList.toggle('active', tab==='weekly');
    document.getElementById('weekly-reward-info').style.display = tab==='weekly' ? 'block' : 'none';
    renderLB(tab);
}

function renderLB(tab) {
    const list = document.getElementById('leader-list');
    const data = tab === 'all' ? lbAll : lbWeekly;
    list.innerHTML = data.map((u, i) => {
        let pts = tab === 'all' ? u.points : u.dailyPoints;
        let tag = (tab === 'weekly' && i < 5) ? `<span style="color:lawngreen; margin-left:10px;">+$5 💵</span>` : '';
        return `<div class="list-row"><span>${i+1}. ${u.username || u.firstName} ${tag}</span><span>${Math.floor(pts).toLocaleString()}</span></div>`;
    }).join('');
}

function openGame(g) { document.getElementById(`modal-${g}`).style.display='flex'; }
function closeGame(g) { document.getElementById(`modal-${g}`).style.display='none'; }

async function playSpin() {
    const res = await fetch(`${API}/api/arcade/spin`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ initData: tg.initData }) });
    const data = await res.json();
    if(data.success) {
        document.getElementById('spin-result').innerText = data.msg;
        user.points = data.points; updateUI();
    }
}

window.onload = init;
