// Client side: Chat, Requirements (wish list + style picker) and Updates.
window.ClientTabs = (function () {
  const { sb, esc, toast } = DC;
  const row = h => '<div class="item" style="grid-template-columns:1fr">' + h + '</div>';
  let stop = null;

  async function show(t, root, me, uid) {
    if (stop) { stop(); stop = null; }
    root.innerHTML = '<div class="pane" id="pn"></div>'; const pn = root.querySelector('#pn');
    if (t === 'chat') Chat.mount(pn, { clientId: me.id, workspaceId: me.workspace_id, kind: 'client', uid }).then(f => stop = f);
    if (t === 'req') req(pn, me);
    if (t === 'upd') upd(pn, me);
  }

  async function req(pn, me) {
    const draw = async () => {
      const [r, c, p] = await Promise.all([sb.from('requirements').select('id,body').eq('client_id', me.id).order('created_at'), sb.from('style_cards').select('id,title,palette').eq('workspace_id', me.workspace_id), sb.from('style_picks').select('style_card_id,kind').eq('client_id', me.id)]);
      const pick = {}; (p.data || []).forEach(x => pick[x.style_card_id] = x.kind);
      pn.innerHTML = '<h2>Your wish list</h2><form class="row-gap" style="margin:12px 0"><input name="b" required placeholder="Something you want on the site"><button class="btn primary">Add</button></form><div class="panel">' + ((r.data || []).map(x => '<div class="item" style="grid-template-columns:1fr auto"><span>' + esc(x.body) + '</span><button class="btn ghost sm" data-rm="' + x.id + '">Remove</button></div>').join('') || row('<span class="sub">Nothing yet.</span>')) + '</div><h2 style="margin-top:32px">Pick a style</h2><p class="sub small" style="margin:4px 0 12px">Inspiration only, not an exact design.</p><div class="cards">' + (c.data || []).map(s => '<div class="panel card"><div class="sw">' + (s.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><strong>' + esc(s.title) + '</strong><div class="pick">' + ['like', 'favorite', 'dislike'].map(k => '<button class="btn sm" data-sc="' + s.id + '" data-k="' + k + '" aria-pressed="' + (pick[s.id] === k) + '">' + k[0].toUpperCase() + k.slice(1) + '</button>').join('') + '</div></div>').join('') + '</div>';
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

  async function upd(pn, me) {
    const [n, k] = await Promise.all([sb.from('notes').select('body').eq('client_id', me.id).eq('visibility', 'shared').order('created_at', { ascending: false }), sb.from('checklist_items').select('text,done').eq('client_id', me.id).eq('visible_to_client', true).order('created_at')]);
    pn.innerHTML = '<h2>Updates</h2><p class="sec">Checklist</p><div class="panel">' + ((k.data || []).map(i => row((i.done ? 'Done: ' : 'To do: ') + esc(i.text))).join('') || row('<span class="sub">Nothing shared yet.</span>')) + '</div><p class="sec">Notes</p><div class="panel">' + ((n.data || []).map(x => row(esc(x.body))).join('') || row('<span class="sub">No notes yet.</span>')) + '</div>';
  }
  return { show };
})();
