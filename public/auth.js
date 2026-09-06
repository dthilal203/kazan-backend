let mode = 'login';

function toast(msg){
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  root.appendChild(el);
  setTimeout(()=> el.remove(), 3600);
}

function render(){
  const isLogin = mode === 'login';
  document.getElementById('app').innerHTML = `
    <div class="center-screen">
      <div class="auth-card">
        <span class="wordmark">kazan.</span>
        <p class="auth-sub">${isLogin ? 'Tekrar hoş geldin' : 'Tasarrufunu takip etmeye başla'}</p>
        <form id="authForm" autocomplete="on">
          <div class="field">
            <label for="email">E-posta</label>
            <input type="email" id="email" name="email" autocomplete="username" placeholder="ornek@mail.com" required>
            <div class="field-error hidden" id="err-email"></div>
          </div>
          <div class="field">
            <label for="pass">Şifre</label>
            <input type="password" id="pass" name="password"
              autocomplete="${isLogin ? 'current-password' : 'new-password'}"
              placeholder="••••••••" required>
            <div class="field-error hidden" id="err-pass"></div>
          </div>
          <div class="field-checkbox">
            <label><input type="checkbox" id="rememberMe" checked> Beni hatırla — bu cihazda 90 gün oturumum açık kalsın</label>
          </div>
          <button type="submit" class="btn btn-primary">${isLogin ? 'Giriş yap' : 'Hesap oluştur'}</button>
        </form>
        <p class="auth-switch">
          ${isLogin ? 'Hesabın yok mu?' : 'Zaten hesabın var mı?'}
          <button id="switchBtn">${isLogin ? 'Hesap oluştur' : 'Giriş yap'}</button>
        </p>
      </div>
    </div>`;
  document.getElementById('switchBtn').onclick = ()=>{ mode = isLogin ? 'signup' : 'login'; render(); };
  document.getElementById('authForm').addEventListener('submit', (e)=>{ e.preventDefault(); submit(); });
}

async function submit(){
  const email = document.getElementById('email').value.trim().toLowerCase();
  const password = document.getElementById('pass').value;
  const rememberMe = document.getElementById('rememberMe').checked;
  document.getElementById('err-email').classList.add('hidden');
  document.getElementById('err-pass').classList.add('hidden');

  const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
  try{
    const res = await fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ email, password, rememberMe })
    });
    const data = await res.json();
    if(!res.ok){
      const box = document.getElementById('err-pass');
      box.textContent = data.error || 'Bir şeyler ters gitti';
      box.classList.remove('hidden');
      return;
    }
    // Formun gerçekten submit edilmiş olması (preventDefault'a rağmen) tarayıcının
    // "şifreyi kaydetmek ister misin?" istemini tetiklemesine yardımcı olur;
    // ardından gelen bu yönlendirme tarayıcıya girişin başarılı olduğunu gösterir.
    window.location.href = '/dashboard.html';
  }catch(e){
    toast('Sunucuya ulaşılamadı');
  }
}

render();
