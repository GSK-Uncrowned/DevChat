// Client side: Chat, Requirements (wish list + style picker) and Progress & Preview.
window.ClientTabs = (function () {
  const { sb, esc, toast } = DC;
  const row = h => '<div class="item" style="grid-template-columns:1fr">' + h + '</div>';
  let stop = null;

  async function show(t, root, me, uid) {
    if (stop) { stop(); stop = null; }
    if (t === 'chat') {
      root.innerHTML = '<div id="pn"></div>';
      Chat.mount(root.querySelector('#pn'), {
        clientId: me.id, workspaceId: me.workspace_id, kind: 'client', uid, canDelete: false,
        afterSend: async () => {
          const { data: w } = await sb.from('workspaces').select('status,away_ai').eq('id', me.workspace_id).single();
          if (!(w && w.away_ai && w.status !== 'paused')) return null;
          const { data, error } = await sb.functions.invoke('away', { body: { client_id: me.id } });
          if (error) console.error('Receptionist reply failed:', error);
          return data;
        }
      }).then(f => stop = f);
      return;
    }
    root.innerHTML = '<div class="c-body" id="pn"></div>';
    const pn = root.querySelector('#pn');
    if (t === 'req') req(pn, me);
    if (t === 'upd') upd(pn, me).then(f => stop = f);
  }

  async function req(pn, me) {
    const draw = async () => {
      const [r, c, p] = await Promise.all([
        sb.from('requirements').select('id,body').eq('client_id', me.id).order('created_at'),
        sb.from('style_cards').select('id,title,palette').eq('workspace_id', me.workspace_id),
        sb.from('style_picks').select('style_card_id,kind').eq('client_id', me.id)
      ]);
      const R = r.data || [], pick = {}; (p.data || []).forEach(x => pick[x.style_card_id] = x.kind);
      const cards = (c.data || []).map(s =>
        '<div class="scard' + (pick[s.id] && pick[s.id] !== 'dislike' ? ' sel' : '') + '">' +
          '<div class="sw big">' + (s.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div>' +
          '<strong>' + esc(s.title) + '</strong>' +
          '<div class="pick">' + ['like', 'favorite', 'dislike'].map(k => '<button class="btn sm" data-sc="' + s.id + '" data-k="' + k + '" aria-pressed="' + (pick[s.id] === k) + '">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div>' +
        '</div>'
      ).join('');
      pn.innerHTML =
        '<div class="card pad stack">' +
          '<div class="between"><div><h3>Your wish list</h3><p class="xs muted">Pages, features, or ideas you want included.</p></div><span class="badge">' + R.length + '</span></div>' +
          '<form class="row"><input name="b" required maxlength="200" placeholder="Add something you want on your site"><button class="btn primary">Add</button></form>' +
          '<div class="wl">' +
            (R.map((x, i) => '<div class="wi"><span class="wn">' + String(i + 1).padStart(2, '0') + '</span><span>' + esc(x.body) + '</span><button class="btn ghost sm" data-rm="' + x.id + '">Remove</button></div>').join('') ||
              '<p class="muted sm" style="padding:4px 0">Nothing here yet. Add your first requirement above.</p>') +
          '</div>' +
        '</div>' +
        '<div><div class="between" style="margin-bottom:10px"><h3>Pick a style direction</h3><span class="xs muted">Inspiration only</span></div><div class="cards">' + cards + '</div></div>';
      pn.querySelector('form').onsubmit = async e => {
        e.preventDefault();
        const { error } = await sb.from('requirements').insert({ client_id: me.id, workspace_id: me.workspace_id, body: e.target.b.value.trim() });
        if (error) toast(error.message); draw();
      };
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

  async function upd(pn, me) {
    pn.innerHTML =
      '<div id="pv"></div>' +
      '<div class="two">' +
        '<div class="stack-sm"><h3>Shared checklist</h3><div class="card clip" id="cl"></div></div>' +
        '<div class="stack-sm"><h3>Shared notes</h3><div class="card clip" id="nt"></div></div>' +
      '</div>';
    const $$ = s => pn.querySelector(s);
    let shownUrl;
    const refresh = async () => {
      const [cl, n, k] = await Promise.all([
        sb.from('clients').select('preview_url').eq('id', me.id).single(),
        sb.from('notes').select('body').eq('client_id', me.id).eq('visibility', 'shared').order('created_at', { ascending: false }),
        sb.from('checklist_items').select('text,done').eq('client_id', me.id).eq('visible_to_client', true).order('created_at')
      ]);
      if (!pn.isConnected) return;
      const K = k.data || [], c = cl.data || {};
      let url = null; try { const u = new URL(c.preview_url || ''); if (/^https?:$/.test(u.protocol)) url = u.href; } catch (e) {}
      if (url !== shownUrl) {
        shownUrl = url;
        $$('#pv').innerHTML = url
          ? '<div class="prev-frame"><div class="prev-chrome"><div class="prev-dots"><i></i><i></i><i></i></div><span class="prev-url">' + esc(url) + '</span><a class="btn sm ghost" href="' + esc(url) + '" target="_blank" rel="noopener">Open tab</a></div><div class="prev"><iframe src="' + esc(url) + '" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy" title="Live preview"></iframe></div></div>'
          : '<div class="card empty"><p class="sub">Your developer has not shared a live preview link yet.</p></div>';
      }
      $$('#cl').innerHTML = K.map(i => '<div class="crow' + (i.done ? ' d' : '') + '" style="grid-template-columns:auto 1fr"><span class="badge' + (i.done ? ' on' : '') + '">' + (i.done ? 'Done' : 'To do') + '</span><span>' + esc(i.text) + '</span></div>').join('') || row('<span class="sub">Nothing shared yet.</span>');
      $$('#nt').innerHTML = (n.data || []).map(x => row(esc(x.body))).join('') || row('<span class="sub">No shared notes yet.</span>');
    };
    await refresh();
    const ch = sb.channel('st-' + me.id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clients', filter: 'id=eq.' + me.id }, () => refresh()).subscribe();
    const iv = setInterval(refresh, 20000);
    return () => { clearInterval(iv); sb.removeChannel(ch); };
  }
  return { show };
})();