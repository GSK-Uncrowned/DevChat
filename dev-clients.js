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
    async Overview(tb, c) {
      const [m, k, r, p, s, n, q] = await Promise.all([
        sb.from('messages').select('sender_kind,body,created_at').eq('client_id', c.id).order('created_at', { ascending: false }).limit(200),
        sb.from('checklist_items').select('done').eq('client_id', c.id),
        sb.from('requirements').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
        sb.from('style_picks').select('style_card_id,kind').eq('client_id', c.id),
        sb.from('style_cards').select('id,title,palette').eq('workspace_id', ws.id),
        sb.from('notes').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
        sb.from('queue_entries').select('ticket_no').eq('client_id', c.id).maybeSingle()]);
      const msgs = m.data || [], cl = k.data || [], done = cl.filter(x => x.done).length, pct = cl.length ? Math.round(done / cl.length * 100) : 0;
      const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return { l: d.toLocaleDateString(undefined, { weekday: 'short' }), n: msgs.filter(x => new Date(x.created_at).toDateString() === d.toDateString()).length }; });
      const mx = Math.max(1, ...days.map(d => d.n)), card = {}; (s.data || []).forEach(x => card[x.id] = x);
      const picks = (p.data || []).filter(x => x.kind !== 'dislike' && card[x.style_card_id]).map(x => ({ ...card[x.style_card_id], kind: x.kind }));
      const since = Math.max(0, Math.floor((Date.now() - new Date(c.created_at)) / 864e5));
      const kpi = (v, l) => '<div class="panel kpi c3"><span class="num">' + v + '</span><span class="muted small">' + l + '</span></div>';
      const hd = (t, extra) => '<div class="sh" style="margin:0"><h2>' + t + '</h2>' + (extra || '') + '</div>';
      tb.innerHTML = '<div class="ov">' + kpi(q.data ? pad(q.data.ticket_no) : '-', 'Ticket') + kpi(lbl(c.stage), 'Stage') + kpi(since + 'd', 'With you') + kpi(msgs.length, 'Messages') +
        '<div class="panel pad c8 stack">' + hd('Messages, last 7 days') + '<div class="bars">' + days.map(d => '<div><i class="' + (d.n ? 'on' : '') + '" style="height:' + Math.max(4, d.n / mx * 100) + '%" title="' + d.n + '"></i><span class="muted small">' + d.l + '</span></div>').join('') + '</div></div>' +
        '<div class="panel pad c4 stack">' + hd('Checklist', '<span class="badge">' + done + '/' + cl.length + '</span>') + '<div class="prog"><i style="width:' + pct + '%"></i></div><p class="muted small">' + (cl.length ? pct + '% complete' : 'No tasks yet.') + '</p>' + hd('Brief') + '<p class="muted small">' + (r.count || 0) + ' wish-list items, ' + (n.count || 0) + ' notes</p></div>' +
        '<div class="panel pad c6 stack">' + hd('Style direction') + (picks.length ? picks.map(x => '<div class="stack" style="gap:6px"><div class="sw">' + (x.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><span class="small">' + esc(x.title) + ' <span class="muted">' + x.kind + '</span></span></div>').join('') : '<p class="muted small">No style picks yet.</p>') + '</div>' +
        '<div class="panel pad c6 stack">' + hd('Latest messages') + (msgs.slice(0, 3).map(x => '<div class="small"><span class="muted">' + (x.sender_kind === 'client' ? 'Client' : x.sender_kind === 'ai' ? 'AI' : 'You') + ':</span> ' + esc(x.body.slice(0, 120)) + '</div>').join('') || '<p class="muted small">No messages yet.</p>') + '</div>' +
        '<div class="panel pad c12"><label style="grid-auto-flow:column;justify-content:start;align-items:center;gap:12px">Stage<select id="st" style="height:36px">' + ST.map(([v, l]) => '<option value="' + v + '"' + (v === c.stage ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div></div>';
      tb.querySelector('#st').onchange = async e => { const { error } = await sb.from('clients').update({ stage: e.target.value }).eq('id', c.id); if (error) toast(error.message); else { c.stage = e.target.value; toast('Stage updated.'); } };
    },
    Chat(tb, c, uid) { Chat.mount(tb, { clientId: c.id, workspaceId: ws.id, kind: 'developer', uid }).then(f => stop = f); },
    async Requirements(tb, c) {
      const [r, p, s] = await Promise.all([sb.from('requirements').select('body').eq('client_id', c.id).order('position'), sb.from('style_picks').select('style_card_id,kind').eq('client_id', c.id), sb.from('style_cards').select('id,title,palette').eq('workspace_id', ws.id)]);
      const cd = {}; (s.data || []).forEach(x => cd[x.id] = x);
      const R = r.data || [], P = (p.data || []).filter(x => cd[x.style_card_id]);
      tb.innerHTML = '<div class="sh" style="margin-top:0"><h2>Wish list</h2><span class="badge">' + R.length + '</span></div><div class="wl">' + (R.map((x, i) => '<div class="wi" style="grid-template-columns:28px 1fr"><span class="wn">' + String(i + 1).padStart(2, '0') + '</span><span>' + esc(x.body) + '</span></div>').join('') || '<div class="panel empty"><p class="sub">The client has not added anything yet.</p></div>') + '</div><div class="sh"><h2>Style picks</h2><span class="badge">' + P.length + '</span></div><div class="cards">' +
        (P.map(x => { const k = cd[x.style_card_id]; return '<div class="scard"><div class="sw big">' + (k.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><div class="row-gap" style="justify-content:space-between"><strong>' + esc(k.title) + '</strong><span class="badge' + (x.kind === 'favorite' ? ' on' : '') + '">' + x.kind + '</span></div></div>'; }).join('') || '<div class="panel empty" style="grid-column:1/-1"><p class="sub">No style picks yet.</p></div>') + '</div>';
    },
    async Notes(tb, c, uid) {
      const split = b => { const [t, ...r] = b.split('\n'); return [t.trim() || 'Untitled', r.join('\n').trim()]; };
      const edit = n => {
        const d = document.createElement('dialog'); d.className = 'modal wide';
        d.innerHTML = '<form class="stack"><textarea name="b" required placeholder="Title on the first line, details below" style="min-height:280px">' + esc(n ? n.body : '') + '</textarea><div class="row-gap" style="justify-content:space-between"><select name="v"><option value="private">Private</option><option value="shared">Shared with client</option></select><div class="row-gap">' + (n ? '<button type="button" class="btn ghost" data-del>Delete</button>' : '') + '<button type="button" class="btn ghost" data-x>Close</button><button class="btn primary">Save</button></div></div></form>';
        document.body.appendChild(d); const f = d.querySelector('form'); if (n) f.v.value = n.visibility;
        d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target === d) d.close(); });
        d.querySelector('[data-x]').onclick = () => d.close();
        if (n) d.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this note?')) return; await sb.from('notes').delete().eq('id', n.id); d.close(); draw(); };
        f.onsubmit = async e => {
          e.preventDefault(); const body = f.b.value.trim(); if (!body) return; const row = { body, visibility: f.v.value };
          const { error } = n ? await sb.from('notes').update({ ...row, updated_at: new Date().toISOString() }).eq('id', n.id) : await sb.from('notes').insert({ ...row, client_id: c.id, workspace_id: ws.id, author_id: uid });
          if (error) return toast(error.message); d.close(); draw();
        };
        d.showModal(); f.b.focus();
      };
      let L = [];
      const draw = async () => {
        const { data } = await sb.from('notes').select('*').eq('client_id', c.id).order('updated_at', { ascending: false }); L = data || [];
        tb.innerHTML = '<div class="page-h" style="margin-bottom:16px"><span class="sub small">' + L.length + ' notes</span><button class="btn primary" data-new>New note</button></div><div class="ngrid">' + (L.map(n => { const [t, r] = split(n.body); return '<button class="note" data-n="' + n.id + '"><strong>' + esc(t) + '</strong><span class="np">' + esc(r) + '</span><span class="nf"><span class="badge' + (n.visibility === 'shared' ? ' on' : '') + '">' + (n.visibility === 'shared' ? 'Shared' : 'Private') + '</span><span class="muted small">' + new Date(n.updated_at).toLocaleDateString() + '</span></span></button>'; }).join('') || '<div class="panel empty" style="grid-column:1/-1"><h2>No notes yet</h2><p class="sub small">Keep private notes, or share one with your client.</p></div>') + '</div>';
      };
      tb.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-new')) edit(null); else if (b.dataset.n) edit(L.find(x => x.id === b.dataset.n)); };
      draw();
    },
    AI(tb, c, uid) {
      let sess = [], cur = null, hist = [];
      const CH = [['Catch me up', 'Catch me up on this client.'], ['Draft a reply', "Draft a reply to the client's latest message."], ['Pull out tasks', 'Pull out the concrete tasks from the conversation and wish list.'], ['Write the brief', 'Write a project brief for this client.'], ['Check scope', 'Is anything the client asked for beyond the original wish list?']];
      tb.innerHTML = '<div class="aiwrap"><aside class="aside"><button class="btn" id="nc" style="width:100%;margin-bottom:12px">New chat</button><div class="sess" id="sl"></div></aside><div class="aichat"><div class="ai-h"><strong>Assistant</strong><span class="muted small">Suggests changes. You approve them.</span></div><p class="sub small">Client messages are sent to an AI. It can only suggest changes. Nothing happens until you approve it.</p><div class="msgs" id="am"></div><div class="row-gap" style="flex-wrap:wrap">' + CH.map(([l, q]) => '<button class="btn sm" data-q="' + esc(q) + '">' + l + '</button>').join('') + '</div><form class="chat-in" id="af"><input name="q" placeholder="Ask about this client" autocomplete="off" required><button class="btn primary">Ask</button></form></div></div>';
      const box = tb.querySelector('#am'), sl = tb.querySelector('#sl');
      const drawList = () => { sl.innerHTML = sess.length ? sess.map(x => '<div class="srow"><button class="si" data-s="' + x.id + '"' + (x.id === cur ? ' aria-current="true"' : '') + '>' + esc(x.title) + '</button><button class="sdel" data-del="' + x.id + '" aria-label="Delete chat">&times;</button></div>').join('') : '<p class="muted small" style="padding:0 10px">No chats yet.</p>'; };
      const card = (a, mi, ai, done) => {
        const id = mi + ':' + ai; let body, label;
        if (a.type === 'add_tasks') { body = '<ul>' + a.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'; label = 'Add to checklist'; }
        else if (a.type === 'set_stage') { body = '<span>Move this client to <strong>' + esc(lbl(a.stage)) + '</strong></span>'; label = 'Change stage'; }
        else if (a.type === 'add_note') { body = '<span>' + esc(a.body) + '</span><span class="muted small">' + (a.shared ? 'Visible to the client' : 'Private note') + '</span>'; label = 'Save note'; }
        else { body = '<textarea data-dm="' + id + '">' + esc(a.body) + '</textarea>'; label = 'Send to client'; }
        return '<div class="panel pad act stack"><span class="muted small">Suggestion</span>' + body + '<div><button class="btn sm primary" data-act="' + id + '"' + (done ? ' disabled' : '') + '>' + (done ? 'Done' : label) + '</button></div></div>';
      };
      const draw = () => {
        box.innerHTML = hist.length ? hist.map((m, mi) => m.role === 'user' ? '<div class="msg me">' + esc(m.content) + '</div>' : '<div class="amsg"><div class="msg">' + esc(m.content) + '</div>' + (m.actions || []).map((a, ai) => card(a, mi, ai, m.done && m.done[ai])).join('') + '</div>').join('') : '<p class="muted small">Ask about this client, or use a shortcut below.</p>';
        box.scrollTop = box.scrollHeight;
      };
      const open = async id => {
        cur = id; const { data } = await sb.from('ai_messages').select('id,role,content,actions,done').eq('session_id', id).order('created_at');
        hist = data || []; drawList(); draw();
      };
      const ask = async q => {
        if (!cur) {
          const { data, error } = await sb.from('ai_sessions').insert({ workspace_id: ws.id, client_id: c.id, title: q.slice(0, 40) }).select('id,title,updated_at').single();
          if (error) return toast(error.message);
          cur = data.id; sess.unshift(data); drawList();
        }
        hist.push({ role: 'user', content: q, actions: [], done: {} }); draw();
        box.insertAdjacentHTML('beforeend', '<p class="muted small">Thinking</p>'); box.scrollTop = box.scrollHeight;
        await sb.from('ai_messages').insert({ session_id: cur, workspace_id: ws.id, role: 'user', content: q });
        const { data, error } = await sb.functions.invoke('ai', { body: { client_id: c.id, kind: 'chat', messages: hist.map(m => ({ role: m.role, content: m.content })) } });
        if (error || !data || data.error) hist.push({ role: 'assistant', content: 'Sorry, that did not work. Check that the ai function is deployed and its key is set.', actions: [], done: {} });
        else {
          const m = { role: 'assistant', content: data.reply || '', actions: data.actions || [], done: {} };
          const r = await sb.from('ai_messages').insert({ session_id: cur, workspace_id: ws.id, role: 'assistant', content: m.content, actions: m.actions }).select('id').single();
          m.id = r.data && r.data.id; hist.push(m);
          sb.from('ai_sessions').update({ updated_at: new Date().toISOString() }).eq('id', cur).then(() => {});
        }
        draw();
      };
      tb.querySelector('#af').onsubmit = e => { e.preventDefault(); const f = e.target, q = f.q.value.trim(); if (!q) return; f.q.value = ''; ask(q); };
      tb.onclick = async e => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.id === 'nc') { cur = null; hist = []; drawList(); draw(); return; }
        if (b.dataset.s) return open(b.dataset.s);
        if (b.dataset.del) {
          if (!confirm('Delete this chat?')) return;
          const { error } = await sb.from('ai_sessions').delete().eq('id', b.dataset.del);
          if (error) return toast(error.message);
          sess = sess.filter(x => x.id !== b.dataset.del);
          if (cur === b.dataset.del) { cur = null; hist = []; }
          drawList(); draw(); return;
        }
        if (b.dataset.q) return ask(b.dataset.q);
        if (!b.dataset.act) return;
        const [mi, ai] = b.dataset.act.split(':').map(Number), m = hist[mi], a = m.actions[ai];
        b.disabled = true; let error;
        if (a.type === 'add_tasks') ({ error } = await sb.from('checklist_items').insert(a.items.map(t => ({ client_id: c.id, workspace_id: ws.id, text: t }))));
        else if (a.type === 'set_stage') { ({ error } = await sb.from('clients').update({ stage: a.stage }).eq('id', c.id)); if (!error) c.stage = a.stage; }
        else if (a.type === 'add_note') ({ error } = await sb.from('notes').insert({ client_id: c.id, workspace_id: ws.id, author_id: uid, body: a.body, visibility: a.shared ? 'shared' : 'private' }));
        else { const el = tb.querySelector('[data-dm="' + b.dataset.act + '"]'); const body = ((el && el.value) || a.body).trim(); if (body) ({ error } = await sb.from('messages').insert({ client_id: c.id, workspace_id: ws.id, sender_id: uid, sender_kind: 'developer', body })); }
        if (error) { b.disabled = false; toast(error.message); return; }
        (m.done = m.done || {})[ai] = true;
        if (m.id) sb.from('ai_messages').update({ done: m.done }).eq('id', m.id).then(() => {});
        draw(); toast('Done.');
      };
      drawList(); draw();
      sb.from('ai_sessions').select('id,title,updated_at').eq('client_id', c.id).order('updated_at', { ascending: false }).then(({ data, error }) => {
        if (error) return toast('Could not load chats: ' + error.message);
        sess = data || []; if (sess.length) open(sess[0].id); else drawList();
      });
    },
    async Checklist(tb, c) {
      const row = i => '<div class="crow' + (i.done ? ' d' : '') + '"><input type="checkbox" data-done="' + i.id + '"' + (i.done ? ' checked' : '') + ' aria-label="Done"><span>' + esc(i.text) + '</span><button class="btn ghost sm" data-share="' + i.id + '" data-v="' + i.visible_to_client + '">' + (i.visible_to_client ? 'Shared' : 'Share') + '</button><button class="btn ghost sm" data-del="' + i.id + '">Delete</button></div>';
      const draw = async () => {
        const { data } = await sb.from('checklist_items').select('*').eq('client_id', c.id).order('created_at');
        const L = data || [], todo = L.filter(i => !i.done), dn = L.filter(i => i.done), pct = L.length ? Math.round(dn.length / L.length * 100) : 0;
        tb.innerHTML = '<div class="panel pad stack"><div class="row-gap" style="justify-content:space-between"><strong>Progress</strong><span class="muted small">' + dn.length + ' of ' + L.length + ' done</span></div><div class="prog"><i style="width:' + pct + '%"></i></div></div>' +
          '<form class="row-gap" style="margin-top:16px"><input name="t" required maxlength="200" placeholder="Add a task"><button class="btn primary">Add</button></form>' +
          '<div class="sh"><h2>To do</h2><span class="badge">' + todo.length + '</span></div><div class="panel">' + (todo.map(row).join('') || none('All caught up.')) + '</div>' +
          (dn.length ? '<div class="sh"><h2>Done</h2><span class="badge">' + dn.length + '</span></div><div class="panel">' + dn.map(row).join('') + '</div>' : '');
        tb.querySelector('form').onsubmit = async e => { e.preventDefault(); const { error } = await sb.from('checklist_items').insert({ client_id: c.id, workspace_id: ws.id, text: e.target.t.value.trim() }); if (error) toast(error.message); draw(); };
        tb.onchange = async e => { const d = e.target.dataset.done; if (d) { await sb.from('checklist_items').update({ done: e.target.checked }).eq('id', d); draw(); } };
        tb.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.del) await sb.from('checklist_items').delete().eq('id', b.dataset.del); else if (b.dataset.share) await sb.from('checklist_items').update({ visible_to_client: b.dataset.v !== 'true' }).eq('id', b.dataset.share); else return; draw(); };
      };
      draw();
    }
  };
  return { init, show, open };
})();
