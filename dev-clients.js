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
      let sess = [], cur = null, hist = [];
      const CH = [['Catch me up', 'Catch me up on this client.'], ['Draft a reply', "Draft a reply to the client's latest message."], ['Pull out tasks', 'Pull out the concrete tasks from the conversation and wish list.'], ['Write the brief', 'Write a project brief for this client.'], ['Check scope', 'Is anything the client asked for beyond the original wish list?']];
      tb.innerHTML = '<div class="aiwrap"><aside><button class="btn" id="nc" style="width:100%;margin-bottom:12px">New chat</button><div class="sess" id="sl"></div></aside><div class="aichat"><p class="sub small">Client messages are sent to an AI. It can only suggest changes. Nothing happens until you approve it.</p><div class="msgs" id="am"></div><div class="row-gap" style="flex-wrap:wrap">' + CH.map(([l, q]) => '<button class="btn sm" data-q="' + esc(q) + '">' + l + '</button>').join('') + '</div><form class="chat-in" id="af"><input name="q" placeholder="Ask about this client" autocomplete="off" required><button class="btn primary">Ask</button></form></div></div>';
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
