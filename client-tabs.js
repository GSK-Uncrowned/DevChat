// Client side: Chat (files live inside it), Requirements (wish list + style picker) and Progress.
window.ClientTabs = (function () {
  const { sb, esc, toast } = DC;
  const row = h => '<div class="item" style="grid-template-columns:1fr">' + h + '</div>';
  let stop = null;

  async function show(t, root, me, uid) {
    if (stop) { stop(); stop = null; }
    root.innerHTML = '<div class="pane" id="pn"></div>'; const pn = root.querySelector('#pn');
    if (t === 'chat') Chat.mount(pn, { clientId: me.id, workspaceId: me.workspace_id, kind: 'client', uid, canDelete: false, afterSend: async () => {
      // Check the developer's status fresh each time, so switching to Away takes effect right away.
      const { data: w } = await sb.from('workspaces').select('status,away_ai').eq('id', me.workspace_id).single();
      if (!(w && w.status === 'away' && w.away_ai)) return null;
      const { data, error } = await sb.functions.invoke('away', { body: { client_id: me.id } });
      if (error) console.error('Away reply failed:', error);
      return data;
    } }).then(f => stop = f);
    if (t === 'req') req(pn, me);
    if (t === 'upd') upd(pn, me).then(f => stop = f);
  }

  async function req(pn, me) {
    const draw = async () => {
      const [r, c, p] = await Promise.all([sb.from('requirements').select('id,body').eq('client_id', me.id).order('created_at'), sb.from('style_cards').select('id,title,palette').eq('workspace_id', me.workspace_id), sb.from('style_picks').select('style_card_id,kind').eq('client_id', me.id)]);
      const R = r.data || [], pick = {}; (p.data || []).forEach(x => pick[x.style_card_id] = x.kind);
      const cards = (c.data || []).map(s => '<div class="scard' + (pick[s.id] && pick[s.id] !== 'dislike' ? ' sel' : '') + '"><div class="sw big">' + (s.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><strong>' + esc(s.title) + '</strong><div class="pick">' + ['like', 'favorite', 'dislike'].map(k => '<button class="btn sm" data-sc="' + s.id + '" data-k="' + k + '" aria-pressed="' + (pick[s.id] === k) + '">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div></div>').join('');
      pn.innerHTML = '<div class="sh" style="margin-top:0"><h2>Your wish list</h2><span class="badge">' + R.length + '</span></div><form class="row-gap" style="margin-bottom:12px"><input name="b" required maxlength="200" placeholder="Add something you want on your site"><button class="btn primary">Add</button></form><div class="wl">' +
        (R.map((x, i) => '<div class="wi"><span class="wn">' + String(i + 1).padStart(2, '0') + '</span><span>' + esc(x.body) + '</span><button class="btn ghost sm" data-rm="' + x.id + '">Remove</button></div>').join('') || '<div class="panel empty"><p class="sub">Nothing here yet. Add pages, features or anything you have in mind.</p></div>') +
        '</div><div class="sh"><h2>Pick a style</h2></div><p class="sub small" style="margin:-4px 0 12px">Inspiration only, not an exact design.</p><div class="cards">' + cards + '</div>';
      pn.querySelector('form').onsubmit = async e => { e.preventDefault(); const { error } = await sb.from('requirements').insert({ client_id: me.id, workspace_id: me.workspace_id, body: e.target.b.value.trim() }); if (error) toast(error.message); draw(); };
      pn.onclick = async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.rm) await sb.from('requirements').delete().eq('id', b.dataset.rm);
        else if (b.dataset.sc) {
          if (b.getAttribute('aria-pressed') === 'true') await sb.from('style_picks').delete().eq('client_id', me.id).eq('style_card_id', b.dataset.sc);
          else await sb.from('style_picks').upsert({ client_id: me.id, workspace_id: me.workspace_id, style_card_id: b.dataset.sc, kind: b.dataset.k }, { onConflict: 'client_id,style_card_id' });
        } else return;
        draw();
      };
    };
    draw();
  }

  // Progress: a live "what is happening right now" line (set by the developer or by @ai in the chat),
  // a progress bar, the live preview, shared checklist and notes. Returns a function that stops live updates.
  async function upd(pn, me) {
    pn.innerHTML = '<div class="panel pad stack"><div class="live"><i class="pulse" aria-hidden="true"></i><div><p class="muted small">Right now</p><p class="st" id="lv" aria-live="polite"></p></div></div>' +
      '<div class="row-gap" style="justify-content:space-between"><strong>Project progress</strong><span class="muted small" id="pc"></span></div><div class="prog"><i id="pb" style="width:0%"></i></div></div>' +
      '<div class="sh"><h2>Live preview</h2></div><div id="pv"></div>' +
      '<div class="sh"><h2>Checklist</h2></div><div class="panel" id="cl"></div>' +
      '<div class="sh"><h2>Notes</h2></div><div class="panel" id="nt"></div>';
    const $$ = s => pn.querySelector(s);
    const setLive = note => {
      const el = $$('#lv'); el.textContent = '';
      if (note) { const w = document.createElement('span'); w.className = 'shim'; w.textContent = note; el.append(w); const d = document.createElement('span'); d.className = 'dots'; d.innerHTML = '<i></i><i></i><i></i>'; el.append(d); el.classList.remove('idle'); }
      else { el.textContent = 'Waiting for the first update'; el.classList.add('idle'); }
    };
    let shownUrl;
    const refresh = async () => {
      const [cl, n, k] = await Promise.all([
        sb.from('clients').select('preview_url,status_note').eq('id', me.id).single(),
        sb.from('notes').select('body').eq('client_id', me.id).eq('visibility', 'shared').order('created_at', { ascending: false }),
        sb.from('checklist_items').select('text,done').eq('client_id', me.id).eq('visible_to_client', true).order('created_at')]);
      if (!pn.isConnected) return;
      const K = k.data || [], done = K.filter(x => x.done).length, pct = K.length ? Math.round(done / K.length * 100) : 0, c = cl.data || {};
      setLive(c.status_note);
      $$('#pc').textContent = K.length ? done + ' of ' + K.length + ' done' : 'No tasks shared yet'; $$('#pb').style.width = pct + '%';
      let url = null; try { const u = new URL(c.preview_url || ''); if (/^https?:$/.test(u.protocol)) url = u.href; } catch (e) {}
      if (url !== shownUrl) { // only touch the iframe when the link changes, so it never reloads by itself
        shownUrl = url;
        $$('#pv').innerHTML = url ? '<div class="panel prev"><iframe src="' + esc(url) + '" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy" title="Live preview"></iframe></div><p class="sub small" style="margin-top:8px">If the preview is blank, <a href="' + esc(url) + '" target="_blank" rel="noopener">open it in a new tab</a>.</p>' : '<div class="panel empty"><p class="sub">Your developer has not shared a preview yet.</p></div>';
      }
      $$('#cl').innerHTML = K.map(i => row((i.done ? 'Done: ' : 'To do: ') + esc(i.text))).join('') || row('<span class="sub">Nothing shared yet.</span>');
      $$('#nt').innerHTML = (n.data || []).map(x => row(esc(x.body))).join('') || row('<span class="sub">No notes yet.</span>');
    };
    await refresh();
    // The clients table is in the realtime publication, so a new status appears the moment it is set. The poll catches checklist ticks.
    const ch = sb.channel('st-' + me.id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients', filter: 'id=eq.' + me.id }, () => refresh()).subscribe();
    const iv = setInterval(refresh, 20000);
    return () => { clearInterval(iv); sb.removeChannel(ch); };
  }
  return { show };
})();
