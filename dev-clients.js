// Developer side: client list and the per-client tabs.
window.DevClients = (function () {
  const { sb, pad, esc, toast } = DC;
  const ST = [['queued', 'Queued'], ['reviewing', 'Reviewing'], ['in_progress', 'In progress'], ['feedback', 'Needs feedback'], ['done', 'Done']];
  const lbl = s => (ST.find(x => x[0] === s) || [0, s])[1];
  const none = t => '<div class="item sub" style="grid-template-columns:1fr">' + t + '</div>';
  let main, ws, list = [], stop = null;
  let onOpen = () => {};
  function init(m, w, cb) { main = m; ws = w; onOpen = cb; }

  const PIN = '<svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Pinned" role="img"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>';
  const remPanel = (L, hd) => L.length ? '<div class="panel pad stack" style="grid-column:1/-1">' + hd('Reminders', '<span class="badge">' + L.length + '</span>') + L.map(x => '<div class="rem">' + PIN + '<span>' + esc(x.body.split('\n')[0]) + '</span></div>').join('') + '</div>' : '';

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
      const [m, k, r, p, s, n, q, pn] = await Promise.all([
        sb.from('messages').select('sender_kind,body,created_at').eq('client_id', c.id).order('created_at', { ascending: false }).limit(200),
        sb.from('checklist_items').select('done').eq('client_id', c.id),
        sb.from('requirements').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
        sb.from('style_picks').select('style_card_id,kind').eq('client_id', c.id),
        sb.from('style_cards').select('id,title,palette').eq('workspace_id', ws.id),
        sb.from('notes').select('id', { count: 'exact', head: true }).eq('client_id', c.id),
        sb.from('queue_entries').select('ticket_no').eq('client_id', c.id).maybeSingle(),
        sb.from('notes').select('id,body').eq('client_id', c.id).eq('pinned', true).order('updated_at', { ascending: false }).limit(6)]);
      const msgs = m.data || [], cl = k.data || [], done = cl.filter(x => x.done).length, pct = cl.length ? Math.round(done / cl.length * 100) : 0;
      const days = [...Array(7)].map((_, i) => { const d = new Date(Date.now() - (6 - i) * 864e5); return { l: d.toLocaleDateString(undefined, { weekday: 'short' }), n: msgs.filter(x => new Date(x.created_at).toDateString() === d.toDateString()).length }; });
      const mx = Math.max(1, ...days.map(d => d.n)), card = {}; (s.data || []).forEach(x => card[x.id] = x);
      const picks = (p.data || []).filter(x => x.kind !== 'dislike' && card[x.style_card_id]).map(x => ({ ...card[x.style_card_id], kind: x.kind }));
      const since = Math.max(0, Math.floor((Date.now() - new Date(c.created_at)) / 864e5));
      const kpi = (v, l) => '<div class="panel kpi c3"><span class="num">' + v + '</span><span class="muted small">' + l + '</span></div>';
      const hd = (t, extra) => '<div class="sh" style="margin:0"><h2>' + t + '</h2>' + (extra || '') + '</div>';
      tb.innerHTML = '<div class="ov">' + kpi(q.data ? pad(q.data.ticket_no) : '-', 'Ticket') + kpi(lbl(c.stage), 'Stage') + kpi(since + 'd', 'With you') + kpi(msgs.length, 'Messages') + remPanel(pn.data || [], hd) +
        '<div class="panel pad c8 stack">' + hd('Messages, last 7 days') + '<div class="bars">' + days.map(d => '<div><i class="' + (d.n ? 'on' : '') + '" style="height:' + Math.max(4, d.n / mx * 100) + '%" title="' + d.n + '"></i><span class="muted small">' + d.l + '</span></div>').join('') + '</div></div>' +
        '<div class="panel pad c4 stack">' + hd('Checklist', '<span class="badge">' + done + '/' + cl.length + '</span>') + '<div class="prog"><i style="width:' + pct + '%"></i></div><p class="muted small">' + (cl.length ? pct + '% complete' : 'No tasks yet.') + '</p>' + hd('Brief') + '<p class="muted small">' + (r.count || 0) + ' wish-list items, ' + (n.count || 0) + ' notes</p></div>' +
        '<div class="panel pad c6 stack">' + hd('Style direction') + (picks.length ? picks.map(x => '<div class="stack" style="gap:6px"><div class="sw">' + (x.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><span class="small">' + esc(x.title) + ' <span class="muted">' + x.kind + '</span></span></div>').join('') : '<p class="muted small">No style picks yet.</p>') + '</div>' +
        '<div class="panel pad c6 stack">' + hd('Latest messages') + (msgs.slice(0, 3).map(x => '<div class="small"><span class="muted">' + (x.sender_kind === 'client' ? 'Client' : x.sender_kind === 'ai' ? 'Elara' : 'You') + ':</span> ' + esc(x.body.slice(0, 120)) + '</div>').join('') || '<p class="muted small">No messages yet.</p>') + '</div>' +
        '<div class="panel pad c12"><label style="grid-auto-flow:column;justify-content:start;align-items:center;gap:12px">Stage<select id="st" style="height:36px">' + ST.map(([v, l]) => '<option value="' + v + '"' + (v === c.stage ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div></div>';
      tb.querySelector('#st').onchange = async e => { const { error } = await sb.from('clients').update({ stage: e.target.value }).eq('id', c.id); if (error) toast(error.message); else { c.stage = e.target.value; toast('Stage updated.'); DC.log(ws.id, c.id, 'stage_changed', { stage: e.target.value }, true); } };
    },
    Chat(tb, c, uid) { Chat.mount(tb, { clientId: c.id, workspaceId: ws.id, kind: 'developer', uid, canDelete: true, mention: true, afterSend: async m => {
      // Only messages that call @ai wake the assistant. It replies in the chat, updates the client's live status and ticks finished tasks.
      if (!Chat.isMention(m.body)) return null;
      const { data, error } = await sb.functions.invoke('mention', { body: { client_id: c.id, message_id: m.id } });
      if (error || !data || data.error) { toast('The AI could not answer right now.'); return null; }
      if (data.workspace_status) ws.status = data.workspace_status;
      if (data.workspace_status) toast('Status set to ' + data.workspace_status + (data.status ? '. Client sees: ' + data.status : ''));
      else if (data.status) toast('Client sees: ' + data.status);
      return data;
    } }).then(f => stop = f); },
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
        d.innerHTML = '<form class="stack"><textarea name="b" required placeholder="Title on the first line, details below" style="min-height:280px">' + esc(n ? n.body : '') + '</textarea><label class="chk"><input type="checkbox" name="pin"> Pin as a reminder</label><div class="row-gap" style="justify-content:space-between"><select name="v"><option value="private">Private</option><option value="shared">Shared with client</option></select><div class="row-gap">' + (n ? '<button type="button" class="btn ghost" data-del>Delete</button>' : '') + '<button type="button" class="btn ghost" data-x>Close</button><button class="btn primary">Save</button></div></div></form>';
        document.body.appendChild(d); const f = d.querySelector('form'); if (n) { f.v.value = n.visibility; f.pin.checked = !!n.pinned; }
        d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target === d) d.close(); });
        d.querySelector('[data-x]').onclick = () => d.close();
        if (n) d.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this note?')) return; await sb.from('notes').delete().eq('id', n.id); d.close(); draw(); };
        f.onsubmit = async e => {
          e.preventDefault(); const body = f.b.value.trim(); if (!body) return; const row = { body, visibility: f.v.value, pinned: f.pin.checked };
          const { error } = n ? await sb.from('notes').update({ ...row, updated_at: new Date().toISOString() }).eq('id', n.id) : await sb.from('notes').insert({ ...row, client_id: c.id, workspace_id: ws.id, author_id: uid });
          if (error) return toast(error.message); d.close(); draw();
        };
        d.showModal(); f.b.focus();
      };
      let L = [];
      const draw = async () => {
        const { data } = await sb.from('notes').select('*').eq('client_id', c.id).order('updated_at', { ascending: false }); L = (data || []).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        tb.innerHTML = '<div class="page-h" style="margin-bottom:16px"><span class="sub small">' + L.length + ' notes</span><button class="btn primary" data-new>New note</button></div><div class="ngrid">' + (L.map(n => { const [t, r] = split(n.body); return '<button class="note" data-n="' + n.id + '"><strong>' + (n.pinned ? PIN : '') + esc(t) + '</strong><span class="np">' + esc(r) + '</span><span class="nf"><span class="badge' + (n.visibility === 'shared' ? ' on' : '') + '">' + (n.visibility === 'shared' ? 'Shared' : 'Private') + '</span><span class="muted small">' + new Date(n.updated_at).toLocaleDateString() + '</span></span></button>'; }).join('') || '<div class="panel empty" style="grid-column:1/-1"><h2>No notes yet</h2><p class="sub small">Keep private notes, or share one with your client.</p></div>') + '</div>';
      };
      tb.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-new')) edit(null); else if (b.dataset.n) edit(L.find(x => x.id === b.dataset.n)); };
      draw();
    },
    Elara(tb, c, uid) {
      let sess = [], cur = null, hist = [];
      const CH = [['Catch me up', 'Catch me up on this client.'], ['Draft a reply', "Draft a reply to the client's latest message."], ['Pull out tasks', 'Pull out the concrete tasks from the conversation and wish list.'], ['Write the brief', 'Write a project brief for this client.'], ['Check scope', 'Is anything the client asked for beyond the original wish list?']];
      tb.innerHTML = '<div class="aiwrap"><aside class="aside"><button class="btn" id="nc" style="width:100%;margin-bottom:12px">New chat</button><div class="sess" id="sl"></div></aside><div class="aichat"><div class="ai-h"><strong>Elara</strong><span class="muted small">Suggests changes. You approve them.</span></div><p class="sub small">Client messages are sent to an AI. It can only suggest changes. Nothing happens until you approve it.</p><div class="msgs" id="am"></div><div class="row-gap" style="flex-wrap:wrap">' + CH.map(([l, q]) => '<button class="btn sm" data-q="' + esc(q) + '">' + l + '</button>').join('') + '</div><div class="dump" id="dump" hidden><div class="dump-h"><i class="rec"></i><strong>Listening</strong><span class="muted small">Say everything. Elara sorts it out.</span></div><p class="dump-t" id="dt" aria-live="polite"></p><div class="row-gap" style="justify-content:flex-end"><button type="button" class="btn ghost sm" id="dcancel">Cancel</button><button type="button" class="btn primary sm" id="ddone">Done</button></div></div><form class="chat-in" id="af"><input name="q" placeholder="Ask about this client, or tap the mic and talk" autocomplete="off" required><button type="button" class="btn mic" id="mic" aria-pressed="false" aria-label="Talk to Elara" title="Talk to Elara"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="18" height="18"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="btn primary">Ask</button></form></div></div>';
      const box = tb.querySelector('#am'), sl = tb.querySelector('#sl');
      const drawList = () => { sl.innerHTML = sess.length ? sess.map(x => '<div class="srow"><button class="si" data-s="' + x.id + '"' + (x.id === cur ? ' aria-current="true"' : '') + '>' + esc(x.title) + '</button><button class="sdel" data-del="' + x.id + '" aria-label="Delete chat">&times;</button></div>').join('') : '<p class="muted small" style="padding:0 10px">No chats yet.</p>'; };
      const allBtn = (m, mi) => { const n = (m.actions || []).filter((a, i) => a.type !== 'draft_message' && !(m.done && m.done[i])).length; return n > 1 ? '<div><button class="btn primary sm" data-all="' + mi + '">Apply all (' + n + ')</button></div>' : ''; };
      const card = (a, mi, ai, done) => {
        const id = mi + ':' + ai; let body, label;
        if (a.type === 'add_tasks') { body = '<ul>' + a.items.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'; label = 'Add to checklist'; }
        else if (a.type === 'set_status') { body = '<span>Set your status to <strong>' + esc(a.status === 'open' ? 'Open' : a.status[0].toUpperCase() + a.status.slice(1)) + '</strong></span><span class="muted small">' + (a.status === 'open' ? 'Clients stop getting Away replies.' : a.status === 'away' ? 'Elara can reply to clients for you.' : 'New clients cannot join.') + '</span>'; label = 'Change status'; }
        else if (a.type === 'set_stage') { body = '<span>Move this client to <strong>' + esc(lbl(a.stage)) + '</strong></span>'; label = 'Change stage'; }
        else if (a.type === 'add_reminder') { body = '<span>' + PIN + esc(a.body) + '</span><span class="muted small">Pinned reminder, private</span>'; label = 'Pin reminder'; }
        else if (a.type === 'add_note') { body = '<span>' + esc(a.body) + '</span><span class="muted small">' + (a.shared ? 'Visible to the client' : 'Private note') + '</span>'; label = 'Save note'; }
        else { body = '<textarea data-dm="' + id + '">' + esc(a.body) + '</textarea>'; label = 'Send to client'; }
        return '<div class="panel pad act stack"><span class="muted small">Suggestion</span>' + body + '<div><button class="btn sm primary" data-act="' + id + '"' + (done ? ' disabled' : '') + '>' + (done ? 'Done' : label) + '</button></div></div>';
      };
      const draw = () => {
        box.innerHTML = hist.length ? hist.map((m, mi) => m.role === 'user' ? '<div class="msg me">' + esc(m.content) + '</div>' : '<div class="amsg"><div class="msg">' + esc(m.content) + '</div>' + (m.actions || []).map((a, ai) => card(a, mi, ai, m.done && m.done[ai])).join('') + allBtn(m, mi) + '</div>').join('') : '<p class="muted small">Ask about this client, or use a shortcut below.</p>';
        box.scrollTop = box.scrollHeight;
      };
      const open = async id => {
        cur = id; const { data } = await sb.from('ai_messages').select('id,role,content,actions,done').eq('session_id', id).order('created_at');
        hist = data || []; drawList(); draw();
      };
      const ask = async (q, dump) => {
        if (!cur) {
          const { data, error } = await sb.from('ai_sessions').insert({ workspace_id: ws.id, client_id: c.id, title: q.slice(0, 40) }).select('id,title,updated_at').single();
          if (error) return toast(error.message);
          cur = data.id; sess.unshift(data); drawList();
        }
        hist.push({ role: 'user', content: q, actions: [], done: {} }); draw();
        box.insertAdjacentHTML('beforeend', '<p class="muted small">Thinking</p>'); box.scrollTop = box.scrollHeight;
        await sb.from('ai_messages').insert({ session_id: cur, workspace_id: ws.id, role: 'user', content: q });
        const { data, error } = await sb.functions.invoke('ai', { body: { client_id: c.id, kind: 'chat', mode: dump ? 'dump' : undefined, messages: hist.map(m => ({ role: m.role, content: m.content })) } });
        if (error || !data || data.error) hist.push({ role: 'assistant', content: 'Sorry, that did not work. Check that the ai function is deployed and its key is set.', actions: [], done: {} });
        else {
          const m = { role: 'assistant', content: data.reply || '', actions: data.actions || [], done: {} };
          const r = await sb.from('ai_messages').insert({ session_id: cur, workspace_id: ws.id, role: 'assistant', content: m.content, actions: m.actions }).select('id').single();
          m.id = r.data && r.data.id; hist.push(m);
          sb.from('ai_sessions').update({ updated_at: new Date().toISOString() }).eq('id', cur).then(() => {});
        }
        draw();
      };
      // Runs one suggestion. Returns an error or undefined.
      const exec = async (a, id) => {
        let error;
        if (a.type === 'add_tasks') ({ error } = await sb.from('checklist_items').insert(a.items.map(t => ({ client_id: c.id, workspace_id: ws.id, text: t }))));
        else if (a.type === 'set_stage') { ({ error } = await sb.from('clients').update({ stage: a.stage }).eq('id', c.id)); if (!error) c.stage = a.stage; }
        else if (a.type === 'set_status') { ({ error } = await sb.from('workspaces').update({ status: a.status }).eq('id', ws.id)); if (!error) ws.status = a.status; }
        else if (a.type === 'add_note') ({ error } = await sb.from('notes').insert({ client_id: c.id, workspace_id: ws.id, author_id: uid, body: a.body, visibility: a.shared ? 'shared' : 'private' }));
        else if (a.type === 'add_reminder') ({ error } = await sb.from('notes').insert({ client_id: c.id, workspace_id: ws.id, author_id: uid, body: a.body, visibility: 'private', pinned: true }));
        else { const el = tb.querySelector('[data-dm="' + id + '"]'); const body = ((el && el.value) || a.body).trim(); if (body) ({ error } = await sb.from('messages').insert({ client_id: c.id, workspace_id: ws.id, sender_id: uid, sender_kind: 'developer', body })); }
        return error;
      };
      tb.querySelector('#af').onsubmit = e => { e.preventDefault(); const f = e.target, q = f.q.value.trim(); if (!q) return; f.q.value = ''; ask(q); };

      // Voice brain dump: browser speech recognition (Chrome, Edge, Safari). The transcript goes to Elara as a "dump",
      // she sorts it into tasks, reminders and notes, and you approve them.
      const mic = tb.querySelector('#mic'), dumpEl = tb.querySelector('#dump'), dt = tb.querySelector('#dt'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      let rec = null, fin = '', interim = '';
      if (!SR) mic.title = 'Voice needs Chrome, Edge or Safari';
      const stopRec = send => {
        const r = rec; if (!r) return; rec = null; r.onend = null; try { r.stop(); } catch (e) {}
        mic.setAttribute('aria-pressed', 'false'); dumpEl.hidden = true;
        const text = (fin + ' ' + interim).replace(/\s+/g, ' ').trim(); fin = interim = '';
        if (send) { if (text.length < 3) toast('I did not catch anything.'); else ask(text, true); }
      };
      mic.onclick = () => {
        if (rec) return stopRec(false);
        if (!SR) return toast('Voice input needs Chrome, Edge or Safari.');
        const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
        fin = interim = ''; dt.textContent = ''; rec = r;
        r.onresult = e => {
          let live = '';
          for (let k = e.resultIndex; k < e.results.length; k++) { const x = e.results[k]; if (x.isFinal) fin += x[0].transcript + ' '; else live += x[0].transcript; }
          interim = live; dt.textContent = (fin + live).trim(); dt.scrollTop = dt.scrollHeight;
        };
        r.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { toast('Microphone access is blocked for this site.'); stopRec(false); } };
        r.onend = () => { if (rec === r) { try { r.start(); } catch (e) {} } }; // browsers stop on silence; keep listening until you press Done
        try { r.start(); } catch (e) { rec = null; return toast('Could not start the microphone.'); }
        mic.setAttribute('aria-pressed', 'true'); dumpEl.hidden = false;
      };
      tb.querySelector('#ddone').onclick = () => stopRec(true);
      tb.querySelector('#dcancel').onclick = () => stopRec(false);
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
        if (b.dataset.all) { // apply every suggestion at once (drafted messages to the client are never bulk-sent)
          const mi = +b.dataset.all, m = hist[mi]; b.disabled = true; let n = 0, fail = null;
          for (let ai = 0; ai < m.actions.length; ai++) {
            const a = m.actions[ai]; if (a.type === 'draft_message' || (m.done && m.done[ai])) continue;
            const error = await exec(a); if (error) { fail = error; break; }
            (m.done = m.done || {})[ai] = true; n++;
          }
          if (m.id) sb.from('ai_messages').update({ done: m.done }).eq('id', m.id).then(() => {});
          draw(); toast(fail ? fail.message : 'Applied ' + n + '.'); return;
        }
        if (!b.dataset.act) return;
        const [mi, ai] = b.dataset.act.split(':').map(Number), m = hist[mi], a = m.actions[ai];
        b.disabled = true;
        const error = await exec(a, b.dataset.act);
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
    async Preview(tb, c) {
      const { data } = await sb.from('clients').select('preview_url,status_note').eq('id', c.id).single(); const d = data || {};
      const ok = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; } };
      tb.innerHTML = '<form class="panel pad stack" id="pf"><label>Preview link<input name="u" type="url" placeholder="https://your-preview.vercel.app" value="' + esc(d.preview_url || '') + '"></label><label>Status note (clients and the Away AI see this)<textarea name="n" maxlength="300" placeholder="Working on the homepage. Mockup ready Friday.">' + esc(d.status_note || '') + '</textarea></label><div><button class="btn primary">Save</button></div></form><div class="sh"><h2>What the client sees</h2></div>' +
        (ok(d.preview_url) ? '<div class="panel prev"><iframe src="' + esc(d.preview_url) + '" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy" title="Live preview"></iframe></div>' : '<div class="panel empty"><p class="sub">No preview link yet.</p></div>');
      tb.querySelector('#pf').onsubmit = async e => {
        e.preventDefault(); const f = e.target, u = f.u.value.trim();
        if (u && !ok(u)) return toast('Enter a valid link starting with https://');
        const { error } = await sb.from('clients').update({ preview_url: u || null, status_note: f.n.value.trim() || null }).eq('id', c.id);
        if (error) return toast(error.message); DC.log(ws.id, c.id, 'preview_updated', {}, true); toast('Saved.'); TABS.Preview(tb, c);
      };
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
        tb.onchange = async e => { const d = e.target.dataset.done; if (d) { await sb.from('checklist_items').update({ done: e.target.checked }).eq('id', d); if (e.target.checked) DC.log(ws.id, c.id, 'task_done', { text: e.target.closest('.crow').querySelector('span').textContent }, true); draw(); } };
        tb.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.del) await sb.from('checklist_items').delete().eq('id', b.dataset.del); else if (b.dataset.share) await sb.from('checklist_items').update({ visible_to_client: b.dataset.v !== 'true' }).eq('id', b.dataset.share); else return; draw(); };
      };
      draw();
    }
  };
  return { init, show, open };
})();
