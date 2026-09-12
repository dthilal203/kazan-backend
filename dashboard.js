let data = null;
let ui = { redirected:false, visListener:null, accountFilter:'all' };

function toast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=> el.remove(), 3600);
}
function paraFmt(n){ return '₺' + Number(n||0).toLocaleString('tr-TR', {minimumFractionDigits: n%1===0?0:2, maximumFractionDigits:2}); }
function trTarih(iso){
  const AY=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  const d = new Date(iso); return d.getDate()+' '+AY[d.getMonth()];
}
function monthlyValue(it){ return it.cadence==='yearly' ? it.amount/12 : it.amount; }

async function api(path, opts={}){
  const res = await fetch(path, { credentials:'include', headers:{'Content-Type':'application/json'}, ...opts });
  if(res.status === 401){ window.location.href = '/index.html'; return null; }
  const body = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(body.error || 'İstek başarısız');
  return body;
}

async function loadData(){
  data = await api('/api/subscriptions');
}

/* ============================================================
   ONBOARDING (no account connected yet)
============================================================ */
function renderConnectPrompt(){
  document.getElementById('app').innerHTML = `
    <div class="onboard-wrap">
      <div class="onboard-head">
        <h1>E-posta hesabını bağla</h1>
        <p>Deneme onay maillerini ve tekrarlayan fatura maillerini tarayarak unutulmuş abonelikleri buluyoruz. Birden fazla adresin varsa hepsini bağlayabilirsin.</p>
      </div>
      <div class="accounts-panel">
        <div class="empty-accounts">Henüz bağlı bir hesap yok.</div>
        <div class="add-account-row">
          <a href="/auth/google" class="add-account-btn" style="display:block;text-decoration:none;text-align:center">+ E-posta hesabı bağla</a>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   ACCOUNTS MODAL
============================================================ */
function openAccountsModal(){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-panel">
      <h3>Bağlı hesaplar</h3>
      <p class="modal-sub">Birden fazla e-posta adresini bağlayabilirsin — hepsi ayrı ayrı taranır.</p>
      <div class="accounts-panel" id="accountsList"></div>
      <a href="/auth/google" class="add-account-btn" style="display:block;text-decoration:none;text-align:center;margin-bottom:14px">+ Yeni hesap bağla</a>
      <button class="modal-close" id="closeAccModal">Kapat</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('closeAccModal').onclick = ()=> overlay.remove();

  const list = document.getElementById('accountsList');
  if(data.accounts.length === 0){
    list.innerHTML = `<div class="empty-accounts">Henüz bağlı bir hesap yok.</div>`;
  } else {
    list.innerHTML = data.accounts.map(a => `
      <div class="account-row">
        <div class="account-info">
          <span class="account-dot"></span>
          <div>
            <div class="account-addr">${a.address}</div>
            <div class="account-meta">${a.lastSyncAt ? 'Son tarama: '+new Date(a.lastSyncAt).toLocaleString('tr-TR') : 'Henüz taranmadı'}</div>
          </div>
        </div>
        <button class="remove-account" data-remove="${a.address}">Kaldır</button>
      </div>`).join('');
    list.querySelectorAll('[data-remove]').forEach(btn=>{
      btn.onclick = async ()=>{
        await api('/api/google-accounts/'+encodeURIComponent(btn.dataset.remove), { method:'DELETE' });
        toast('Hesap kaldırıldı');
        overlay.remove();
        await loadData();
        renderApp();
      };
    });
  }
}

/* ============================================================
   MAIN DASHBOARD
============================================================ */
function renderApp(){
  if(!data.accounts || data.accounts.length === 0){ renderConnectPrompt(); return; }

  const scopeTrials = ui.accountFilter==='all' ? data.trials : data.trials.filter(t=> t.sourceAccount===ui.accountFilter);
  const scopeForgotten = ui.accountFilter==='all' ? data.forgotten : data.forgotten.filter(f=> f.sourceAccount===ui.accountFilter);
  const trials = scopeTrials;
  const forgotten = scopeForgotten;
  const urgentCount = trials.filter(t=> t.daysLeft<=2).length;
  const totalOpen = trials.length + forgotten.length;
  const initials = (data.user && data.user.firstName) ? data.user.firstName[0].toUpperCase() : data.accounts[0].address[0].toUpperCase();
  const scopeLabel = ui.accountFilter==='all' ? 'Tüm hesaplar' : ui.accountFilter;

  document.getElementById('app').innerHTML = `
    <div class="wrap">
      <header>
        <span class="wordmark">kazan.</span>
        <div class="header-actions">
          ${data.accounts.length>1 ? `
          <button class="switcher-btn" id="switcherBtn">
            <span class="switcher-dot">${data.accounts.length}</span>
            <span style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${scopeLabel}</span>
          </button>` : ''}
          <button class="icon-btn" id="bellBtn" aria-label="Bildirimler">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
            ${urgentCount>0 ? `<span class="bell-badge">${urgentCount}</span>` : ''}
          </button>
          <button class="avatar" id="avatarBtn">${initials}</button>
        </div>
      </header>

      <section class="hero">
        <div>
          <p class="hero-label">Bu yıl tasarruf ettiğin toplam</p>
          <p class="hero-amount">${paraFmt(Math.round(data.realizedYearly))}</p>
          <div class="hero-stats">
            <span class="stat-chip"><strong>${data.cancelledCount}</strong> abonelik iptal edildi</span>
            <span class="stat-chip"><strong>${totalOpen}</strong> öğe incelemeni bekliyor</span>
            <span class="stat-chip"><strong>${data.accounts.length}</strong> bağlı e-posta</span>
          </div>
        </div>
        <div class="hero-chart">
          <svg viewBox="0 0 200 64" preserveAspectRatio="none">
            <polyline points="0,58 30,52 60,48 90,40 120,34 150,20 200,8" fill="none" stroke="#0E6E4F" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Acil: deneme süresi bitiyor</h2>
          <span class="section-total">Toplam <strong>${paraFmt(trials.reduce((s,t)=>s+monthlyValue(t),0))}</strong>/ay değerinde</span>
        </div>
        <div class="ledger">
          ${trials.length===0 ? `<div class="ledger-empty">Şu an acil bir öğe yok.</div>` :
            trials.map(t=>{
              const critical = t.daysLeft<=2;
              return `
              <div class="entry">
                <span class="entry-dot ${critical?'critical':'warning'}"></span>
                <div>
                  <div class="entry-name-row">
                    <span class="entry-name">${t.name}</span>
                    <span class="badge ${critical?'critical':'warning'}">${t.daysLeft<=0?'bugün bitiyor':t.daysLeft+' gün kaldı'}</span>
                    ${t.confidence==='low' ? `<span class="badge neutral">tarih tahmini</span>` : ''}
                  </div>
                  <div class="entry-meta">Deneme ${trTarih(t.trialEnd)} tarihinde bitiyor · ${t.sourceAccount||''}</div>
                </div>
                <div class="entry-amount">
                  <div class="amount-value">${paraFmt(t.amount)}</div>
                  <div class="amount-cadence">aylık</div>
                </div>
                <div class="entry-actions">
                  <button class="text-link" data-snooze="${t.id}">Hatırlat</button>
                  <button class="btn-row" data-cancel="${t.id}" data-url="${t.cancelUrl}" data-name="${t.name}">Şimdi iptal et</button>
                </div>
              </div>`;
            }).join('')}
        </div>
      </section>

      <section class="section">
        <div class="section-head">
          <h2 class="section-title">Unutulmuş abonelikler</h2>
          <span class="section-total">Toplam <strong>${paraFmt(forgotten.reduce((s,f)=>s+monthlyValue(f),0))}</strong>/ay değerinde</span>
        </div>
        <div class="ledger">
          ${forgotten.length===0 ? `<div class="ledger-empty">Şu an unutulmuş bir abonelik yok.</div>` :
            forgotten.map(f=> `
              <div class="entry">
                <span class="entry-dot"></span>
                <div>
                  <div class="entry-name-row">
                    <span class="entry-name">${f.name}</span>
                    <span class="badge neutral">${f.occurrences} kez fatura görüldü</span>
                  </div>
                  <div class="entry-meta">Son fatura: ${trTarih(f.lastSeenReceiptAt)} · ${f.sourceAccount||''}</div>
                </div>
                <div class="entry-amount">
                  <div class="amount-value">${paraFmt(f.amount)}</div>
                  <div class="amount-cadence">${f.cadence==='yearly'?'yıllık':'aylık'}</div>
                </div>
                <div class="entry-actions">
                  <button class="text-link" data-keep="${f.id}">Kullanıyorum</button>
                  <button class="btn-row" data-cancel="${f.id}" data-url="${f.cancelUrl}" data-name="${f.name}">İptal et</button>
                </div>
              </div>`).join('')}
        </div>
      </section>
    </div>

    ${totalOpen>0 ? `
      <div class="action-bar">
        <div class="action-bar-inner">
          <span class="action-bar-text">${totalOpen} öğeyi gözden geçirerek <strong>${paraFmt(data.potentialMonthly)}</strong> daha tasarruf edebilirsin</span>
          <button class="btn-bar" id="reviewAll">İlk öğeyi incele</button>
        </div>
      </div>` : ''}
  `;

  document.querySelectorAll('[data-cancel]').forEach(b=> b.onclick = ()=> openCancelModal(b.dataset.cancel, b.dataset.name, b.dataset.url));
  document.querySelectorAll('[data-keep]').forEach(b=> b.onclick = ()=> markFalsePositive(b.dataset.keep));
  document.querySelectorAll('[data-snooze]').forEach(b=> b.onclick = ()=> snoozeTrial(b.dataset.snooze));
  const reviewAll = document.getElementById('reviewAll');
  if(reviewAll) reviewAll.onclick = ()=>{
    const first = [...trials, ...forgotten][0];
    if(first) openCancelModal(first.id, first.name, first.cancelUrl);
  };
  document.getElementById('bellBtn').onclick = (e)=>{ e.stopPropagation(); toggleBellDropdown(trials); };
  document.getElementById('avatarBtn').onclick = (e)=>{ e.stopPropagation(); toggleAccountMenu(); };
  const switcherBtn = document.getElementById('switcherBtn');
  if(switcherBtn) switcherBtn.onclick = (e)=>{ e.stopPropagation(); toggleAccountSwitcher(); };
  document.addEventListener('click', ()=> document.querySelectorAll('.dropdown').forEach(d=>d.remove()), { once:true });
}

function toggleAccountSwitcher(){
  document.querySelectorAll('.dropdown').forEach(d=>d.remove());
  const container = document.getElementById('switcherBtn').parentElement;
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  const allActive = ui.accountFilter==='all';
  dd.innerHTML = `<h4>Görünüm — hesap değiştir</h4>
    <div class="switcher-item ${allActive?'active':''}" data-scope="all">
      <span>Tüm hesaplar (birleşik)</span>${allActive?'<span class="switcher-check">✓</span>':''}
    </div>
    ${data.accounts.map(a=>{
      const active = ui.accountFilter===a.address;
      return `<div class="switcher-item ${active?'active':''}" data-scope="${a.address}">
        <span>${a.address}</span>${active?'<span class="switcher-check">✓</span>':''}
      </div>`;
    }).join('')}`;
  container.appendChild(dd);
  dd.onclick = (e)=> e.stopPropagation();
  dd.querySelectorAll('[data-scope]').forEach(item=>{
    item.onclick = ()=>{
      ui.accountFilter = item.dataset.scope;
      dd.remove();
      renderApp();
    };
  });
}

function toggleBellDropdown(trials){
  document.querySelectorAll('.dropdown').forEach(d=>d.remove());
  const container = document.getElementById('bellBtn').parentElement;
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  dd.innerHTML = `<h4>Yaklaşan bitişler</h4>` +
    (trials.length===0 ? `<div class="dropdown-empty">Yaklaşan bir bitiş yok.</div>` :
      trials.map(t=> `
        <div class="dropdown-item">
          <div><strong>${t.name}</strong> — ${t.daysLeft<=0?'bugün bitiyor':t.daysLeft+' gün kaldı'}</div>
          <button class="go" data-cancel="${t.id}" data-url="${t.cancelUrl}" data-name="${t.name}">Şimdi incele</button>
        </div>`).join(''));
  container.appendChild(dd);
  dd.onclick = (e)=> e.stopPropagation();
  const goBtn = dd.querySelector('[data-cancel]');
  if(goBtn) goBtn.onclick = ()=>{ dd.remove(); openCancelModal(goBtn.dataset.cancel, goBtn.dataset.name, goBtn.dataset.url); };
}

function toggleAccountMenu(){
  document.querySelectorAll('.dropdown').forEach(d=>d.remove());
  const container = document.getElementById('avatarBtn').parentElement;
  const dd = document.createElement('div');
  dd.className = 'dropdown';
  dd.innerHTML = `<h4>${data.user && data.user.firstName ? data.user.firstName+' '+(data.user.lastName||'') : data.accounts[0].address}</h4>
    <div class="account-menu">
      <button id="menuAccounts">Bağlı hesaplar</button>
      <button id="menuSync">Şimdi tara</button>
      <button id="menuLogout">Çıkış yap</button>
    </div>`;
  container.appendChild(dd);
  dd.onclick = (e)=> e.stopPropagation();
  dd.querySelector('#menuAccounts').onclick = ()=>{ dd.remove(); openAccountsModal(); };
  dd.querySelector('#menuSync').onclick = async ()=>{
    dd.remove();
    toast('Taranıyor…');
    try{
      const r = await api('/api/sync/now', { method:'POST' });
      toast(r.scanned + ' mail tarandı, ' + r.totalSubs + ' öğe bulundu');
      await loadData(); renderApp();
    }catch(e){ toast(e.message); }
  };
  dd.querySelector('#menuLogout').onclick = async ()=>{
    await api('/api/auth/logout', { method:'POST' });
    window.location.href = '/index.html';
  };
}

/* ============================================================
   ITEM ACTIONS
============================================================ */
async function markFalsePositive(id){
  await api('/api/subscriptions/'+id+'/dismiss', { method:'POST' });
  toast('Teşekkürler — bunu bir daha önermeyeceğiz');
  await loadData(); renderApp();
}
async function snoozeTrial(id){
  await api('/api/subscriptions/'+id+'/snooze', { method:'POST' });
  toast('Hatırlatma 2 gün sonraya ertelendi');
  await loadData(); renderApp();
}

function openCancelModal(id, name, cancelUrl){
  ui.redirected = false;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-panel">
      <h3>${name}</h3>
      <p class="modal-sub">Bu servis kazan. üzerinden otomatik iptal edilemiyor — resmi hesap sayfasına yönlendireceğiz.</p>
      <ul class="modal-steps">
        <li data-n="1">${name} hesabına giriş yap</li>
        <li data-n="2">Hesap / Ayarlar bölümüne git</li>
        <li data-n="3">Abonelik veya Üyelik sekmesini bul</li>
        <li data-n="4">İptal et'e tıkla ve onayla</li>
      </ul>
      <a href="${cancelUrl}" target="_blank" rel="noopener" class="modal-go" id="goServiceLink">Servise git ↗</a>
      <div class="waiting-box" id="waitingBox">Geri döndün — iptal işlemini tamamladıysan aşağıdan onayla.</div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="laterBtn" style="flex:1">Henüz etmedim</button>
        <button class="btn-row" id="confirmBtn" style="flex:1">İptal ettim, onayla</button>
      </div>
      <button class="modal-close" id="closeModalBtn">Kapat</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('goServiceLink').addEventListener('click', ()=>{ ui.redirected = true; });
  ui.visListener = ()=>{
    if(document.visibilityState === 'visible' && ui.redirected){
      const box = document.getElementById('waitingBox');
      if(box) box.classList.add('show','pulse');
    }
  };
  document.addEventListener('visibilitychange', ui.visListener);

  document.getElementById('confirmBtn').onclick = async ()=>{
    const r = await api('/api/subscriptions/'+id+'/cancel-confirm', { method:'POST' });
    closeCancelModal(overlay);
    toast('Onaylandı — ' + paraFmt(r.addedToSavings) + ' yıllık tasarrufa eklendi 🎉');
    await loadData(); renderApp();
  };
  document.getElementById('laterBtn').onclick = ()=>{ toast('Tamam, sonra hatırlatırız'); closeCancelModal(overlay); };
  document.getElementById('closeModalBtn').onclick = ()=> closeCancelModal(overlay);
}
function closeCancelModal(overlay){
  if(ui.visListener) document.removeEventListener('visibilitychange', ui.visListener);
  overlay.remove();
}

/* ============================================================
   BOOT
============================================================ */
async function boot(){
  document.getElementById('app').innerHTML = `<div class="center-screen"><p style="color:var(--ink-soft)">Yükleniyor…</p></div>`;
  const params = new URLSearchParams(window.location.search);
  await loadData();
  if(!data) return; // api() zaten /index.html'e yönlendirdi
  renderApp();
  if(params.get('connected')) toast(params.get('connected') + ' bağlandı, taranıyor…');
  if(params.get('connect_error')) toast('Bağlantı hatası: ' + params.get('connect_error'));
  if(params.toString()) window.history.replaceState({}, '', '/dashboard.html');
}
boot();
