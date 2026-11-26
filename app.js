(function () {
  const cfg = window.DEVCHAT_CONFIG || {};
  const sb = supabase.createClient(cfg.url, cfg.anonKey);
  const $ = (s, r) => (r || document).querySelector(s);
  const pad = n => '#' + String(n).padStart(3, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
        <div class="between">
          <div><h2></h2><p class="sub sm" style="margin-top:4px">Sign in or create an account to continue.</p></div>
          <button type="button" class="btn ghost sm" data-x aria-label="Close">&times;</button>
        </div>
        <label>Email<input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
        <label>Password<input type="password" name="password" required minlength="6" placeholder="At least 6 characters"></label>
        <p class="err" role="alert"></p>
        <button class="btn primary lg go" type="submit"></button>
        <button class="btn ghost sm swap" type="button"></button>
      </form>`;
      document.body.appendChild(d);
      const form = d.querySelector('form'), err = d.querySelector('.err'), go = d.querySelector('.go');
      const paint = () => {
        d.querySelector('h2').textContent = m === 'up' ? 'Create your account' : 'Welcome back';
        go.textContent = m === 'up' ? 'Create account' : 'Sign in';
        d.querySelector('.swap').textContent = m === 'up' ? 'I already have an account' : 'Create an account instead';
        form.password.autocomplete = m === 'up' ? 'new-password' : 'current-password';
      };
      paint();
      d.querySelector('.swap').onclick = () => { m = m === 'up' ? 'in' : 'up'; err.textContent = ''; paint(); };
      d.querySelector('[data-x]').onclick = () => d.close();
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
    if (session) {
      const { error } = await sb.auth.getUser();
      if (!error) return session;
      await sb.auth.signOut({ scope: 'local' });
    }
    return openAuth(mode);
  }
  async function requireSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { location.href = 'index.html'; return null; }
    const { error } = await sb.auth.getUser();
    if (error) { await sb.auth.signOut({ scope: 'local' }); location.href = 'index.html'; return null; }
    return session;
  }
  async function signOut() { await sb.auth.signOut(); location.href = 'index.html'; }

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

  const seen = new WeakMap();
  const tooSoon = (el, ms) => { const n = Date.now(); if (n - (seen.get(el) || 0) < ms) return true; seen.set(el, n); return false; };
  document.addEventListener('submit', e => { if (tooSoon(e.target, 1000)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && !b.hasAttribute('data-fast') && tooSoon(b, 600)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  async function log(ws, client, kind, meta, visible) {
    const { data: { session } } = await sb.auth.getSession();
    return sb.from('activity_log').insert({ workspace_id: ws, client_id: client, actor_id: session.user.id, kind, meta: meta || {}, client_visible: !!visible });
  }
  const actText = a => ({ client_joined: 'Joined the queue', stage_changed: 'Stage changed to ' + String((a.meta || {}).stage || '').replace('_', ' '), task_done: 'Completed: ' + ((a.meta || {}).text || 'a task'), file_uploaded: 'File uploaded: ' + ((a.meta || {}).name || ''), preview_updated: 'Preview or status updated' }[a.kind] || a.kind);

  window.DC = { log, actText, sb, $, pad, esc, initTheme, toast, openAuth, ensureAuth, requireSession, signOut, route };
})();