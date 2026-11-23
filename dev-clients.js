// Developer side: client list and the per-client tabs.
window.DevClients = (function () {
  const { sb, pad, esc, toast } = DC;
  const ST = [['queued', 'Queued'], ['reviewing', 'Reviewing'], ['in_progress', 'In progress'], ['feedback', 'Needs feedback'], ['done', 'Done']];
  const lbl = s => (ST.find(x => x[0] === s) || [0, s])[1];
  const none = t => '<div class="item sub" style="grid-template-columns:1fr">' + t + '</div>';
  let main, ws, list = [], stop = null;
  let onOpen = () => {};
  function init(m, w, cb) { main = m; ws = w; onOpen = cb; }

  async function show() {
    if (stop) { stop(); stop = null; }
    const [c, q] = await Promise.all([
      sb.from('clients').select('id,display_name,stage,created_at').eq('workspace_id', ws.id).order('created_at'),
      sb.from('queue_entries').select('client_id,ticket_no').eq('workspace_id', ws.id)]);
    if (c.error) return toast('Could not load clients: ' + c.error.message);
    list = c.data; const t = {}; (q.data || []).forEach(e => t[e.client_id] = e.ticket_no);
    main.innerHTML = '<header class="page-h"><div><h1>Clients</h1><p class="sub small">' + list.length + ' total</p></div></header>' + (list.length ? '<div class="panel">' + list.map(x => '<div class="item" style="grid-template-columns:72px 1fr auto"><span class="tno">' + pad(t[x.id] || 0) + '</span><span>' + esc(x.display_name) + '<br><span class="muted small">' + lbl(x.stage) + '</span></span><span class="row-gap"><button class="btn ghost sm" data-open="' + x.id + '" data-tab="Chat">Chat</button><button class="btn sm" data-open="' + x.id + '" data-tab="Overview">Open</button></span></div>').join('') + '</div>' : '<div class="panel empty"><h2>No clients yet</h2><p class="sub small">Create an invite to get your first one.</p></div>');
    main.onclick = e => { const b = e.target.closest('[data-open]'); if (b) onOpen(list.find(x => x.id === b.dataset.open), b.dataset.tab); };
  }

  // Shows one client's page. The sidebar picks the tab.
  async function open(c, tab) {
    if (stop) { stop(); stop = null; }
    main.onclick = null;
    const [f, q, ses] = await Promise.all([
      sb.from('clients').select('id,display_name,stage,created_at').eq('id', c.id).maybeSingle(),
      sb.from('queue_entries').select('ticket_no').eq('client_id', c.id).maybeSingle(),
      sb.auth.getSession()]);
    if (!f.data) { main.innerHTML = '<div class="panel empty"><h2>That client is no longer here</h2></div>'; return false; }
    const cl = f.data, uid = ses.data.session.user.id;
    main.innerHTML = '<header class="page-h"><div><h1>' + esc(cl.display_name) + '</h1><p class="sub small">' + pad(q.data ? q.data.ticket_no : 0) + ' &middot; ' + tab + '</p></div></header><div id="tb"></div>';
    await TABS[tab](main.querySelector('#tb'), cl, uid);
    return true;
  }

  const TABS = {
    Overview(tb, c) {
      tb.innerHTML = '<div class="panel pad stack"><label>Stage<select id="st" style="width:auto;height:36px">' + ST.map(([v, l]) => '<option value="' + v + '"' + (v === c.stage ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label><p class="muted small">Joined ' + new Date(c.created_at).toLocaleDateString() + '</p></div>';
      tb.querySelector('#st').onchange = async e => { const { error } = await sb.from('clients').update({ stage: e.target.value }).eq('id', c.id); if (error) toast(error.message); else { c.stage = e.target.value; toast('Stage updated.'); } };
    },
    Chat(tb, c, uid) { Chat.mount(tb, { clientId: c.id, workspaceId: ws.id, kind: 'developer', uid }).then(f => stop = f); },
    async Requirements(tb, c) {
      const [r, p, s] = await Promise.all([sb.from('requirements').select('body').eq('client_id', c.id).order('position'), sb.from('style_picks').select('style_card_id,kind').eq('client_id', c.id), sb.from('style_cards').select('id,title').eq('workspace_id', ws.id)]);
      const nm = {}; (s.data || []).forEach(x => nm[x.id] = x.title);
      tb.innerHTML = '<p class="sec">Wish list</p><div class="panel">' + ((r.data || []).map(x => '<div class="item" style="grid-template-columns:1fr">' + esc(x.body) + '</div>').join('') || none('Nothing added yet.')) + '</div><p class="sec">Style picks</p><div class="panel">' + ((p.data || []).map(x => '<div class="item" style="grid-template-columns:1fr auto"><span>' + esc(nm[x.style_card_id] || 'Style') + '</span><span class="muted small">' + x.kind + '</span></div>').join('') || none('No picks yet.')) + '</div>';
    },
    async Notes(tb, c, uid) {
      const draw = async () => {
        const { data } = await sb.from('notes').select('*').eq('client_id', c.id).order('created_at', { ascending: false });
        tb.innerHTML = '<form class="stack panel pad"><textarea name="b" required placeholder="Write a note"></textarea><div class="row-gap"><select name="v" style="width:auto;height:36px"><option value="private">Private</option><option value="shared">Shared with client</option></select><button class="btn primary">Add note</button></div></form><div class="panel" style="margin-top:16px">' + ((data || []).map(n => '<div class="item" style="grid-template-columns:1fr auto"><span>' + esc(n.body) + '</span><span class="muted small">' + n.visibility + '</span></div>').join('') || none('No notes yet.')) + '</div>';
        tb.querySelector('form').onsubmit = async e => { e.preventDefault(); const f = e.target; const { error } = await sb.from('notes').insert({ client_id: c.id, workspace_id: ws.id, author_id: uid, body: f.b.value.trim(), visibility: f.v.value }); if (error) toast(error.message); draw(); };
      };
      draw();
    },
    AI(tb, c, uid) {
      const K = [['catch_up', 'Catch me up'], ['draft_reply', 'Draft a reply'], ['tasks', 'Pull out tasks'], ['spec', 'Write the brief'], ['scope_check', 'Check scope']];
      tb.innerHTML = '<p class="sub small" style="margin-bottom:12px">Client messages are sent to an AI to do this. Nothing reaches the client until you send it.</p><div class="row-gap" style="flex-wrap:wrap">' + K.map(([k, l]) => '<button class="btn" data-k="' + k + '">' + l + '</button>').join('') + '</div><div id="out" style="margin-top:16px"></div>';
      const out = tb.querySelector('#out'); let last = '';
      const draw = (k, text) => {
        last = text;
        if (k === 'draft_reply') { out.innerHTML = '<div class="panel pad stack"><textarea style="min-height:140px">' + esc(text) + '</textarea><div class="row-gap"><button class="btn primary" data-send>Send to client</button></div></div>'; return; }
        let items = []; if (k === 'tasks') { try { items = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim()); } catch (e) {} }
        if (Array.isArray(items) && items.length) { out.innerHTML = '<div class="panel">' + items.map(t => '<div class="item" style="grid-template-columns:1fr">' + esc(String(t)) + '</div>').join('') + '</div><button class="btn primary" style="margin-top:12px" data-tasks>Add all to checklist</button>'; last = items; return; }
        out.innerHTML = '<div class="panel pad stack"><div style="white-space:pre-wrap">' + esc(text) + '</div><div class="row-gap"><button class="btn" data-note>Save as private note</button></div></div>';
      };
      tb.onclick = async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.k) {
          const all = tb.querySelectorAll('[data-k]'); all.forEach(x => x.disabled = true); out.innerHTML = '<p class="muted">Working on it</p>';
          const { data, error } = await sb.functions.invoke('ai', { body: { client_id: c.id, kind: b.dataset.k } });
          all.forEach(x => x.disabled = false);
          if (error || !data || data.error) { out.innerHTML = '<p class="err">Could not run the AI. Check that the ai function is deployed and its API key is set.</p>'; return; }
          draw(b.dataset.k, data.text);
        } else if (b.hasAttribute('data-send')) {
          const body = out.querySelector('textarea').value.trim(); if (!body) return;
          const { error } = await sb.from('messages').insert({ client_id: c.id, workspace_id: ws.id, sender_id: uid, sender_kind: 'developer', body });
          toast(error ? error.message : 'Sent to the client.');
        } else if (b.hasAttribute('data-note')) {
          const { error } = await sb.from('notes').insert({ client_id: c.id, workspace_id: ws.id, author_id: uid, body: last, visibility: 'private' });
          toast(error ? error.message : 'Saved as a private note.');
        } else if (b.hasAttribute('data-tasks')) {
          const { error } = await sb.from('checklist_items').insert(last.map(t => ({ client_id: c.id, workspace_id: ws.id, text: String(t) })));
          toast(error ? error.message : 'Added to the checklist.');
        }
      };
    },
    async Checklist(tb, c) {
      const draw = async () => {
        const { data } = await sb.from('checklist_items').select('*').eq('client_id', c.id).order('created_at');
        tb.innerHTML = '<form class="row-gap panel pad"><input name="t" required placeholder="Add a task"><button class="btn primary">Add</button></form><div class="panel" style="margin-top:16px">' + ((data || []).map(i => '<div class="item" style="grid-template-columns:auto 1fr auto auto"><input type="checkbox" style="width:auto;height:auto" data-done="' + i.id + '"' + (i.done ? ' checked' : '') + '><span' + (i.done ? ' class="muted"' : '') + '>' + esc(i.text) + '</span><button class="btn ghost sm" data-share="' + i.id + '" data-v="' + i.visible_to_client + '">' + (i.visible_to_client ? 'Shared' : 'Share') + '</button><button class="btn ghost sm" data-del="' + i.id + '">Delete</button></div>').join('') || none('No tasks yet.')) + '</div>';
        tb.querySelector('form').onsubmit = async e => { e.preventDefault(); const { error } = await sb.from('checklist_items').insert({ client_id: c.id, workspace_id: ws.id, text: e.target.t.value.trim() }); if (error) toast(error.message); draw(); };
        tb.onchange = async e => { const d = e.target.dataset.done; if (d) { await sb.from('checklist_items').update({ done: e.target.checked }).eq('id', d); draw(); } };
        tb.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.del) await sb.from('checklist_items').delete().eq('id', b.dataset.del); else if (b.dataset.share) await sb.from('checklist_items').update({ visible_to_client: b.dataset.v !== 'true' }).eq('id', b.dataset.share); else return; draw(); };
      };
      draw();
    }
  };
  return { init, show, open };
})();
