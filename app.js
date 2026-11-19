(function () {
  const cfg = window.DEVCHAT_CONFIG || {};
  const sb = supabase.createClient(cfg.url, cfg.anonKey);
  const $ = (s, r) => (r || document).querySelector(s);
  const pad = n => '#' + String(n).padStart(3, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // side: 'dev' defaults to dark, 'client' defaults to light. The choice is remembered per side.
  function initTheme(side) {
    const key = 'devchat-theme-' + side;
    const apply = t => document.documentElement.setAttribute('data-theme', t);
    let t; try { t = localStorage.getItem(key); } catch (e) {}
    apply(t || (side === 'dev' ? 'dark' : 'light'));
    return { toggle() {
      const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      apply(n); try { localStorage.setItem(key, n); } catch (e) {}
    } };
  }

  function toast(msg) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function openAuth(mode) {
    return new Promise(resolve => {
      let m = mode || 'up';
      const d = document.createElement('dialog'); d.className = 'modal';
      d.innerHTML = `<form class="stack">
        <h2></h2><p class="sub small">You need an account to do that.</p>
        <label>Email<input type="email" name="email" required autocomplete="email"></label>
        <label>Password<input type="password" name="password" required minlength="6"></label>
        <p class="err" role="alert"></p>
        <button class="btn primary lg go" type="submit"></button>
        <button class="btn ghost swap" type="button"></button>
      </form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form'), err = d.querySelector('.err'), go = d.querySelector('.go');
      const paint = () => {
        d.querySelector('h2').textContent = m === 'up' ? 'Create your account' : 'Sign in';
        go.textContent = m === 'up' ? 'Create account' : 'Sign in';
        d.querySelector('.swap').textContent = m === 'up' ? 'I already have an account' : 'Create an account instead';
        form.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
      };
      paint();
      d.querySelector('.swap').onclick = () => { m = m === 'up' ? 'in' : 'up'; err.textContent = ''; paint(); };
      d.addEventListener('close', () => d.remove());
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
      form.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = ''; go.disabled = true;
        const creds = { email: form.email.value.trim(), password: form.password.value };
        const { data, error } = m === 'up' ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
        go.disabled = false;
        if (error) { err.textContent = error.message; return; }
        if (!data.session) { err.textContent = 'Check your email to confirm your account, then sign in.'; m = 'in'; paint(); return; }
        d.close(); resolve(data.session);
      });
      d.showModal(); form.email.focus();
    });
  }

  async function ensureAuth(mode) {
    const { data: { session } } = await sb.auth.getSession();
    return session || openAuth(mode);
  }
  async function requireSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = 'index.html'; return null; }
    return session;
  }
  async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }

  // Where should this signed-in person go?
  async function route() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const uid = session.user.id;
    const w = await sb.from('workspaces').select('id').eq('owner_id', uid).limit(1);
    if (w.data && w.data.length) return 'dev.html';
    const c = await sb.from('clients').select('id').eq('user_id', uid).limit(1);
    if (c.data && c.data.length) return 'client.html';
    return null;
  }

  window.DC = { sb, $, pad, esc, initTheme, toast, openAuth, ensureAuth, requireSession, signOut, route };
})();
