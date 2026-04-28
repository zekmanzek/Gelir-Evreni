const tg = window.Telegram.WebApp; 
tg.expand(); 
tg.setHeaderColor('#000109'); 
const API = window.location.origin;
let user, tasks = [], miningInterval; 
let lbAllTime = [], lbDaily = [], lbYesterday = []; 
let currentLbTab = 'all'; 
const AdController = window.Adsgram ? window.Adsgram.init({ blockId: "27433" }) : null; 
let tvWidgetCreated = false;

// ... (index.html içindeki <script> etiketleri arasındaki tüm JS kodlarını buraya yapıştır) ...
