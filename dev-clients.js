// Developer side: Clients project table, per-client workspace, and global JARVIS-style Elara assistant.
window.DevClients = (function () {
  const { sb, pad, esc, toast } = DC;
  const ST = [
    ['queued', 'Queued', '#60a5fa'],
    ['reviewing', 'Reviewing', '#fbbf24'],
    ['in_progress', 'In progress', '#34d399'],
    ['feedback', 'Needs feedback', '#a78bfa'],
    ['done', 'Done', '#71717a']
  ];
  const lbl = s => (ST.find(x => x[0] === s) || [0, s])[1];
  const col = s => (ST.find(x => x[0] === s) || [0, 0, '#71717a'])[2];
  const none = t => '<div class="item sub" style="grid-template-columns:1fr">' + t + '</div>';
  let main, ws, list = [], stageFilter = 'all';
  let onOpen = () => {}, onChat = () => {};

  function init(m, w, cb, chatCb) { main = m; ws = w; onOpen = cb; onChat = chatCb || (() => {}); }

  const PIN = '<svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-label="Pinned" role="img"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>';
  const remPanel = (L, hd) => L.length
    ? '<div class="card pad stack c12" style="border-left:3px solid var(--accent)">' + hd('Reminders', '<span class="badge on">' + L.length + '</span>') + '<div>' + L.map(x => '<div class="rem">' + PIN + '<span>' + esc(x.body.split('\n')[0]) + '</span></div>').join('') + '</div></div>'
    : '';

  async function show(searchQ) {
    const [c, q, k] = await Promise.all([
      sb.from('clients').select('id,display_name,stage,status_note,created_at').eq('workspace_id', ws.id).order('created_at'),
      sb.from('queue_entries').select('client_id,ticket_no').eq('workspace_id', ws.id),
      sb.from('checklist_items').select('client_id,done').eq('workspace_id', ws.id)
    ]);
    if (c.error) return toast('Could not load clients: ' + c.error.message);
    list = c.data || [];
    const t = {}; (q.data || []).forEach(e => t[e.client_id] = e.ticket_no);
    const prog = {}; (k.data || []).forEach(x => { prog[x.client_id] = prog[x.client_id] || { d: 0, n: 0 }; prog[x.client_id].n++; if (x.done) prog[x.client_id].d++; });

    const qStr = (searchQ || '').toLowerCase();
    const rows = list.filter(x => (stageFilter === 'all' || x.stage === stageFilter) && (!qStr || x.display_name.toLowerCase().includes(qStr)));

    const pills = [['all', 'All', null], ...ST].map(([id, name, cHex]) => {
      const cnt = id === 'all' ? list.length : list.filter(x => x.stage === id).length;
      return '<button class="fpill" data-sf="' + id + '" aria-pressed="' + (stageFilter === id) + '">' + (cHex ? '<span class="sdot" style="background:' + cHex + '"></span>' : '') + name + ' <span class="mono xs muted">' + cnt + '</span></button>';
    }).join('');

    main.innerHTML =
      '<div class="hero-row"><div><h1>Clients</h1><p class="sub sm" style="margin-top:4px">Track stages, checklist progress, notes, and live previews.</p></div></div>' +
      '<div class="filter-bar">' + pills + '</div>' +
      (rows.length
        ? '<div class="card ptable"><div class="phead"><span>Ticket</span><span>Client</span><span>Stage</span><span>Tasks</span><span></span></div>' +
          rows.map(x => {
            const pr = prog[x.id] || { d: 0, n: 0 }, pct = pr.n ? Math.round(pr.d / pr.n * 100) : 0;
            return '<div class="prow">' +
              '<span class="mono sm muted">' + pad(t[x.id] || 0) + '</span>' +
              '<div><strong>' + esc(x.display_name) + '</strong><p class="xs muted">' + esc(x.status_note || 'No status note') + '</p></div>' +
              '<div><span class="fpill" style="height:26px;padding:0 10px;cursor:default"><span class="sdot" style="background:' + col(x.stage) + '"></span>' + lbl(x.stage) + '</span></div>' +
              '<div class="prog-mini"><div class="prog-bar"><i style="width:' + pct + '%"></i></div><span class="mono xs muted">' + pr.d + '/' + pr.n + '</span></div>' +
              '<button class="btn sm" data-open="' + x.id + '">Open project</button>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="card empty"><h2>No matching clients</h2><p class="sub sm">Try another stage filter or create a new invite.</p></div>');

    main.querySelectorAll('[data-sf]').forEach(b => b.onclick = () => { stageFilter = b.dataset.sf; show(searchQ); });
    main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => onOpen(list.find(x => x.id === b.dataset.open), 'Overview'));
  }

  async function open(c, tab, onBack) {
    const [f, q, ses] = await Promise.all([
      sb.from('clients').select('id,display_name,stage,created_at').eq('id', c.id).maybeSingle(),
      sb.from('queue_entries').select('ticket_no').eq('client_id', c.id).maybeSingle(),
      sb.auth.getSession()
    ]);
    if (!f.data) { main.innerHTML = '<div class="card empty"><h2>That client is no longer here</h2></div>'; return false; }
    const cl = f.data, uid = ses.data.session.user.id, curTab = tab || 'Overview';

    main.innerHTML =
      '<div class="hero-row">' +
        '<div class="row" style="gap:12px"><button class="btn sm" id="clBack">&larr; Back</button><h1>' + esc(cl.display_name) + '</h1><span class="mono sm muted">' + pad(q.data ? q.data.ticket_no : 0) + '</span></div>' +
        '<div class="row"><select id="hd-st" class="compact" aria-label="Client stage">' + ST.map(([v, l]) => '<option value="' + v + '"' + (v === cl.stage ? ' selected' : '') + '>' + l + '</option>').join('') + '</select><button class="btn sm" id="clMsg">Open in Messages</button></div>' +
      '</div>' +
      '<nav class="utabs" id="clTabs">' + ['Overview', 'Requirements', 'Checklist', 'Notes', 'Preview'].map(t => '<button data-ct="' + t + '"' + (curTab === t ? ' aria-current="true"' : '') + '>' + t + '</button>').join('') + '</nav>' +
      '<div id="tb"></div>';

    main.querySelector('#clBack').onclick = () => onBack && onBack();
    main.querySelector('#clMsg').onclick = () => onChat(cl);
    main.querySelector('#hd-st').onchange = async e => {
      const { error } = await sb.from('clients').update({ stage: e.target.value }).eq('id', cl.id);
      if (error) return toast(error.message);
      cl.stage = e.target.value; toast('Stage updated.');
      DC.log(ws.id, cl.id, 'stage_changed', { stage: e.target.value }, true);
      if (curTab === 'Overview') TABS.Overview(main.querySelector('#tb'), cl, uid);
    };
    main.querySelectorAll('#clTabs button').forEach(b => b.onclick = () => open(cl, b.dataset.ct, onBack));
    await (TABS[curTab] || TABS.Overview)(main.querySelector('#tb'), cl, uid);
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
        sb.from('notes').select('id,body').eq('client_id', c.id).eq('pinned', true).order('updated_at', { ascending: false }).limit(6)
      ]);
      const msgs = m.data || [], cl = k.data || [], done = cl.filter(x => x.done).length, pct = cl.length ? Math.round(done / cl.length * 100) : 0;
      const card = {}; (s.data || []).forEach(x => card[x.id] = x);
      const picks = (p.data || []).filter(x => x.kind !== 'dislike' && card[x.style_card_id]).map(x => ({ ...card[x.style_card_id], kind: x.kind }));
      const since = Math.max(0, Math.floor((Date.now() - new Date(c.created_at)) / 864e5));
      const kpi = (v, l) => '<div class="card kpi c3"><span class="num">' + v + '</span><span class="muted sm">' + l + '</span></div>';
      const hd = (t, extra) => '<div class="between"><h3>' + t + '</h3>' + (extra || '') + '</div>';

      tb.innerHTML =
        '<div class="ov">' +
          kpi(q.data ? pad(q.data.ticket_no) : '-', 'Ticket') +
          kpi(lbl(c.stage), 'Stage') +
          kpi(since + 'd', 'With you') +
          kpi(msgs.length, 'Messages') +
          remPanel(pn.data || [], hd) +
          '<div class="card pad c4 stack">' + hd('Checklist', '<span class="badge">' + done + '/' + cl.length + '</span>') + '<div class="prog"><i style="width:' + pct + '%"></i></div><p class="muted sm">' + (cl.length ? pct + '% complete' : 'No tasks yet.') + '</p><p class="muted sm">' + (r.count || 0) + ' wish-list items &middot; ' + (n.count || 0) + ' notes</p></div>' +
          '<div class="card pad c8 stack">' + hd('Style direction') + (picks.length ? picks.map(x => '<div class="stack-sm"><div class="sw">' + (x.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><div class="between"><span class="sm">' + esc(x.title) + '</span><span class="badge' + (x.kind === 'favorite' ? ' on' : '') + '">' + x.kind + '</span></div></div>').join('') : '<p class="muted sm">No style picks yet.</p>') + '</div>' +
          '<div class="card pad c12 stack">' + hd('Latest messages') + (msgs.slice(0, 4).map(x => '<div class="sm" style="padding:8px 0;border-top:1px solid var(--line)"><span class="badge" style="margin-right:6px">' + (x.sender_kind === 'client' ? 'Client' : x.sender_kind === 'ai' ? 'Elara' : 'You') + '</span>' + esc(x.body.slice(0, 140)) + '</div>').join('') || '<p class="muted sm">No messages yet.</p>') + '</div>' +
        '</div>';
    },

    async Requirements(tb, c) {
      const [r, p, s] = await Promise.all([sb.from('requirements').select('body').eq('client_id', c.id).order('position'), sb.from('style_picks').select('style_card_id,kind').eq('client_id', c.id), sb.from('style_cards').select('id,title,palette').eq('workspace_id', ws.id)]);
      const cd = {}; (s.data || []).forEach(x => cd[x.id] = x);
      const R = r.data || [], P = (p.data || []).filter(x => cd[x.style_card_id]);
      tb.innerHTML =
        '<div class="sh" style="margin-top:0"><h2>Wish list</h2><span class="badge">' + R.length + '</span></div>' +
        '<div class="wl">' + (R.map((x, i) => '<div class="wi" style="grid-template-columns:32px 1fr"><span class="wn">' + String(i + 1).padStart(2, '0') + '</span><span>' + esc(x.body) + '</span></div>').join('') || '<div class="card empty"><p class="sub">The client has not added anything yet.</p></div>') + '</div>' +
        '<div class="sh"><h2>Style picks</h2><span class="badge">' + P.length + '</span></div>' +
        '<div class="cards">' + (P.map(x => { const k = cd[x.style_card_id]; return '<div class="scard"><div class="sw big">' + (k.palette || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div><div class="between"><strong>' + esc(k.title) + '</strong><span class="badge' + (x.kind === 'favorite' ? ' on' : '') + '">' + x.kind + '</span></div></div>'; }).join('') || '<div class="card empty" style="grid-column:1/-1"><p class="sub">No style picks yet.</p></div>') + '</div>';
    },

    async Notes(tb, c, uid) {
      const split = b => { const [t, ...r] = b.split('\n'); return [t.trim() || 'Untitled', r.join('\n').trim()]; };
      const edit = n => {
        const d = document.createElement('dialog'); d.className = 'modal wide';
        d.innerHTML = '<form class="stack"><div class="between"><h2>' + (n ? 'Edit note' : 'New note') + '</h2><button type="button" class="btn ghost sm" data-x>&times;</button></div><textarea name="b" required placeholder="Title on first line, details below" style="min-height:240px">' + esc(n ? n.body : '') + '</textarea><label class="chk"><input type="checkbox" name="pin"> Pin as a reminder on Overview</label><div class="between"><select name="v" class="compact"><option value="private">Private</option><option value="shared">Shared with client</option></select><div class="row">' + (n ? '<button type="button" class="btn ghost" data-del>Delete</button>' : '') + '<button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Save</button></div></div></form>';
        document.body.appendChild(d); const f = d.querySelector('form'); if (n) { f.v.value = n.visibility; f.pin.checked = !!n.pinned; }
        d.addEventListener('close', () => d.remove()); d.addEventListener('click', e => { if (e.target === d) d.close(); });
        d.querySelectorAll('[data-x]').forEach(x => x.onclick = () => d.close());
        if (n) d.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this note?')) return; await sb.from('notes').delete().eq('id', n.id); d.close(); draw(); };
        f.onsubmit = async e => {
          e.preventDefault(); const body = f.b.value.trim(); if (!body) return;
          const row = { body, visibility: f.v.value, pinned: f.pin.checked };
          const { error } = n ? await sb.from('notes').update({ ...row, updated_at: new Date().toISOString() }).eq('id', n.id) : await sb.from('notes').insert({ ...row, client_id: c.id, workspace_id: ws.id, author_id: uid });
          if (error) return toast(error.message); d.close(); draw();
        };
        d.showModal(); f.b.focus();
      };
      let L = [];
      const draw = async () => {
        const { data } = await sb.from('notes').select('*').eq('client_id', c.id).order('updated_at', { ascending: false });
        L = (data || []).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
        tb.innerHTML = '<div class="between" style="margin-bottom:14px"><span class="sub sm">' + L.length + ' notes</span><button class="btn primary" data-new>+ New note</button></div><div class="ngrid">' + (L.map(n => { const [t, r] = split(n.body); return '<button class="note" data-n="' + n.id + '"><strong>' + (n.pinned ? PIN : '') + esc(t) + '</strong><span class="np">' + esc(r) + '</span><span class="nf"><span class="badge' + (n.visibility === 'shared' ? ' on' : '') + '">' + (n.visibility === 'shared' ? 'Shared' : 'Private') + '</span><span class="muted xs">' + new Date(n.updated_at).toLocaleDateString() + '</span></span></button>'; }).join('') || '<div class="card empty" style="grid-column:1/-1"><h2>No notes yet</h2><p class="sub sm">Keep private notes, or share updates with your client.</p></div>') + '</div>';
      };
      tb.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-new')) edit(null); else if (b.dataset.n) edit(L.find(x => x.id === b.dataset.n)); };
      draw();
    },

    async Preview(tb, c) {
      const { data } = await sb.from('clients').select('preview_url,status_note').eq('id', c.id).single(); const d = data || {};
      const ok = u => { try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; } };
      tb.innerHTML =
        '<form class="card pad stack" id="pf"><label>Preview link<input name="u" type="url" placeholder="https://your-preview.vercel.app" value="' + esc(d.preview_url || '') + '"></label><label>Status note (clients see this)<textarea name="n" maxlength="300" placeholder="Working on the homepage. Mockup ready Friday.">' + esc(d.status_note || '') + '</textarea></label><div><button class="btn primary">Save</button></div></form>' +
        '<div class="sh"><h2>What the client sees</h2></div>' +
        (ok(d.preview_url) ? '<div class="prev-frame"><div class="prev-chrome"><div class="prev-dots"><i></i><i></i><i></i></div><span class="prev-url">' + esc(d.preview_url) + '</span><a class="btn sm ghost" href="' + esc(d.preview_url) + '" target="_blank" rel="noopener">Open tab</a></div><div class="prev"><iframe src="' + esc(d.preview_url) + '" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy" title="Live preview"></iframe></div></div>' : '<div class="card empty"><p class="sub">No preview link shared yet.</p></div>');
      tb.querySelector('#pf').onsubmit = async e => {
        e.preventDefault(); const f = e.target, u = f.u.value.trim();
        if (u && !ok(u)) return toast('Enter a valid link starting with https://');
        const { error } = await sb.from('clients').update({ preview_url: u || null, status_note: f.n.value.trim() || null }).eq('id', c.id);
        if (error) return toast(error.message); DC.log(ws.id, c.id, 'preview_updated', {}, true); toast('Saved.'); TABS.Preview(tb, c);
      };
    },

    async Checklist(tb, c) {
      const row = i => '<div class="crow' + (i.done ? ' d' : '') + '"><input type="checkbox" data-done="' + i.id + '"' + (i.done ? ' checked' : '') + '><span>' + esc(i.text) + '</span><button class="btn ghost sm" data-share="' + i.id + '" data-v="' + i.visible_to_client + '">' + (i.visible_to_client ? 'Shared' : 'Share') + '</button><button class="btn ghost sm" data-del="' + i.id + '">Delete</button></div>';
      const draw = async () => {
        const { data } = await sb.from('checklist_items').select('*').eq('client_id', c.id).order('created_at');
        const L = data || [], todo = L.filter(i => !i.done), dn = L.filter(i => i.done), pct = L.length ? Math.round(dn.length / L.length * 100) : 0;
        tb.innerHTML =
          '<div class="card pad stack"><div class="between"><strong>Progress</strong><span class="muted sm">' + dn.length + ' of ' + L.length + ' done</span></div><div class="prog"><i style="width:' + pct + '%"></i></div><form class="row"><input name="t" required maxlength="200" placeholder="Add a task"><button class="btn primary">Add</button></form></div>' +
          '<div class="sh"><h2>To do</h2><span class="badge">' + todo.length + '</span></div><div class="card clip">' + (todo.map(row).join('') || none('All caught up.')) + '</div>' +
          (dn.length ? '<div class="sh"><h2>Done</h2><span class="badge on">' + dn.length + '</span></div><div class="card clip">' + dn.map(row).join('') + '</div>' : '');
        tb.querySelector('form').onsubmit = async e => { e.preventDefault(); const { error } = await sb.from('checklist_items').insert({ client_id: c.id, workspace_id: ws.id, text: e.target.t.value.trim() }); if (error) toast(error.message); draw(); };
        tb.onchange = async e => { const d = e.target.dataset.done; if (d) { await sb.from('checklist_items').update({ done: e.target.checked }).eq('id', d); if (e.target.checked) DC.log(ws.id, c.id, 'task_done', { text: e.target.closest('.crow').querySelector('span').textContent }, true); draw(); } };
        tb.onclick = async e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.del) await sb.from('checklist_items').delete().eq('id', b.dataset.del); else if (b.dataset.share) await sb.from('checklist_items').update({ visible_to_client: b.dataset.v !== 'true' }).eq('id', b.dataset.share); else return; draw(); };
      };
      draw();
    }
  };
  return { init, show, open, ST, lbl };
})();

window.ElaraGlobal = (function () {
  const { sb, pad, esc, toast } = DC;

  function localParse(prompt, clients) {
    const lower = prompt.toLowerCase();
    const matched = clients.filter(c => {
      const parts = c.display_name.toLowerCase().split(/\s+/);
      return lower.includes(c.display_name.toLowerCase()) || parts.some(p => p.length > 2 && new RegExp('\\b' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(lower));
    });
    const actions = [];
    matched.forEach(cl => {
      if (/\b(review|reviewing)\b/i.test(lower)) {
        actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'set_stage', stage: 'reviewing' });
        actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'draft_message', body: 'Hi ' + cl.display_name.split(' ')[0] + ', quick update — your project is now under review. I will follow up shortly!' });
      } else if (/\b(feedback)\b/i.test(lower)) {
        actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'set_stage', stage: 'feedback' });
        actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'draft_message', body: 'Hi ' + cl.display_name.split(' ')[0] + ', your build is ready for your feedback. Take a look and let me know your thoughts!' });
      } else if (/\b(asset|assets|logo|file|files|photo|photos|portfolio|ask|need|tell|message|send)\b/i.test(lower)) {
        const body = /\b(asset|assets|portfolio|logo|file|files)\b/i.test(lower)
          ? 'Hi ' + cl.display_name.split(' ')[0] + ', could you send over the remaining assets we discussed so I can keep moving forward on your project?'
          : 'Hi ' + cl.display_name.split(' ')[0] + ', checking in with a quick update on your project!';
        actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'draft_message', body });
      }
    });
    if (!actions.length && matched.length) {
      matched.forEach(cl => actions.push({ client_id: cl.id, client_name: cl.display_name, ticket: cl.ticket, type: 'draft_message', body: 'Hi ' + cl.display_name.split(' ')[0] + ', quick update on your project.' }));
    }
    const reply = actions.length
      ? 'I prepared ' + actions.length + ' action' + (actions.length > 1 ? 's' : '') + ' across ' + matched.map(x => x.display_name).join(' and ') + '. Review and approve below.'
      : 'Here is your current studio snapshot (' + clients.length + ' clients). Mention any client by name (for example: "Tell Robie his project is under review") and I will prepare the updates.';
    return { reply, actions };
  }

  async function show(main, ws, uid, onChat) {
    const [cRes, qRes] = await Promise.all([
      sb.from('clients').select('id,display_name,stage,status_note').eq('workspace_id', ws.id).order('created_at'),
      sb.from('queue_entries').select('client_id,ticket_no,state').eq('workspace_id', ws.id)
    ]);
    const tMap = {}; (qRes.data || []).forEach(x => tMap[x.client_id] = x);
    const clients = (cRes.data || []).map(c => ({ ...c, ticket: pad((tMap[c.id] || {}).ticket_no || 0), qstate: (tMap[c.id] || {}).state || 'waiting' }));

    const SKEY = 'devchat-elara-global-' + ws.id;
    let sessions = []; try { sessions = JSON.parse(localStorage.getItem(SKEY) || '[]'); } catch (e) {}
    let curId = sessions[0] ? sessions[0].id : null;
    const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(sessions.slice(0, 20))); } catch (e) {} };
    const getCur = () => sessions.find(s => s.id === curId);

    const PROMPTS = [
      ['Multi-client update', 'Tell ' + (clients[0] ? clients[0].display_name : 'Robie') + ' their project is under review and ask ' + (clients[1] ? clients[1].display_name : 'Sophia') + ' for the assets we need.'],
      ['Brief me', 'Give me a quick brief on every client in my queue right now.'],
      ['Ask for assets', 'Ask ' + (clients[0] ? clients[0].display_name : 'the client') + ' for the assets we discussed earlier.']
    ];

    main.innerHTML =
      '<div class="elara-shell">' +
        '<aside class="aside stack">' +
          '<button class="btn primary" id="egNew" style="width:100%">+ New command</button>' +
          '<div class="elara-ctx"><span class="xs muted mono">WORKSPACE CONTEXT</span><strong class="sm">' + clients.length + ' clients connected</strong><span class="xs sub">' + (clients.length ? clients.slice(0, 5).map(c => esc(c.display_name.split(' ')[0]) + ' (' + c.ticket + ')').join(', ') + (clients.length > 5 ? '...' : '') : 'No clients yet') + '</span></div>' +
          '<div class="sess" id="egSess"></div>' +
        '</aside>' +
        '<section class="aichat elara-stage">' +
          '<div class="ai-h">' +
            '<div class="row"><span class="badge on">JARVIS MODE</span><strong>Elara</strong><span class="xs muted">Receptionist &amp; Assistant &middot; All clients</span></div>' +
          '</div>' +
          '<div class="brief-box" id="egBriefs" hidden></div>' +
          '<div class="msgs" id="egMsgs"></div>' +
          '<div class="ai-foot">' +
            '<div class="elara-chips">' + PROMPTS.map(([l, p]) => '<button type="button" class="btn sm" data-ep="' + esc(p) + '">' + esc(l) + '</button>').join('') + '</div>' +
            '<div class="dump" id="egDump" hidden><div class="dump-h"><i class="rec"></i><strong>Listening</strong><span class="muted sm">Speak your command to Elara.</span></div><p class="dump-t" id="egDt"></p><div class="row" style="justify-content:flex-end"><button type="button" class="btn ghost sm" id="egCancel">Cancel</button><button type="button" class="btn primary sm" id="egDone">Run command</button></div></div>' +
            '<form class="chat-in" id="egForm"><input name="q" placeholder="Command Elara across any client (e.g. Tell Robie...)" autocomplete="off" required><button type="button" class="btn mic" id="egMic" aria-pressed="false" title="Voice command"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="18" height="18"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button><button class="btn primary">Send</button></form>' +
          '</div>' +
        '</section>' +
      '</div>';

    const box = main.querySelector('#egMsgs'), sList = main.querySelector('#egSess'), briefBox = main.querySelector('#egBriefs');

    async function drawBriefs() {
      const { data } = await sb.from('activity_log').select('id,client_id,kind,meta,created_at').eq('workspace_id', ws.id).in('kind', ['ai_report', 'ai_ack']).order('created_at', { ascending: false }).limit(40);
      const acks = new Set((data || []).filter(x => x.kind === 'ai_ack').map(x => (x.meta || {}).ack_id));
      try { JSON.parse(localStorage.getItem('devchat-ack-' + ws.id) || '[]').forEach(id => acks.add(id)); } catch (e) {}
      const reports = (data || []).filter(x => x.kind === 'ai_report' && !acks.has(x.id)).slice(0, 4);
      if (!reports.length) { briefBox.hidden = true; return; }
      briefBox.hidden = false;
      briefBox.innerHTML =
        '<div class="between"><span class="xs muted mono">RECEPTIONIST BRIEFINGS</span><span class="badge on">' + reports.length + '</span></div>' +
        reports.map(r => {
          const m = r.meta || {};
          return '<div class="brief-item">' +
            '<div class="sm"><strong style="color:var(--accent)">Elara:</strong> ' + esc(m.summary || 'Client sent an update.') + ' <span class="xs mono muted">(' + esc(m.client_name || '') + ' ' + (m.ticket_no ? pad(m.ticket_no) : '') + ')</span></div>' +
            '<div class="row">' +
              '<button type="button" class="btn sm" data-br-reply="' + esc(m.client_name || '') + '">Reply</button>' +
              '<button type="button" class="btn ghost sm" data-br-chat="' + r.client_id + '">Chat</button>' +
              '<button type="button" class="btn ghost sm" data-br-ack="' + r.id + '" data-br-cid="' + r.client_id + '">&times;</button>' +
            '</div>' +
          '</div>';
        }).join('');
    }

    function drawSessions() {
      sList.innerHTML = sessions.length
        ? sessions.map(s => '<div class="srow"><button class="si" data-sid="' + s.id + '"' + (s.id === curId ? ' aria-current="true"' : '') + '>' + esc(s.title) + '</button><button class="sdel" data-sdel="' + s.id + '" aria-label="Delete">&times;</button></div>').join('')
        : '<p class="muted xs" style="padding:4px 8px">No commands yet.</p>';
    }

    function cardHtml(a, mi, ai, done) {
      const id = mi + ':' + ai;
      let body = '', btnTxt = 'Approve';
      if (a.type === 'set_stage') {
        body = '<span class="sm">Move stage to <strong>' + esc(DevClients.lbl(a.stage)) + '</strong></span>';
        btnTxt = 'Update stage';
      } else if (a.type === 'draft_message') {
        body = '<textarea data-edm="' + id + '" style="min-height:68px">' + esc(a.body) + '</textarea>';
        btnTxt = 'Send message';
      } else if (a.type === 'add_task') {
        body = '<span class="sm">Add task: <strong>' + esc(a.text) + '</strong></span>';
        btnTxt = 'Add task';
      }
      return '<div class="card pad stack-sm">' +
        '<div class="elara-act-head"><span class="elara-who"><span class="dot"></span>' + esc(a.client_name || 'Client') + ' <span class="mono xs muted">' + esc(a.ticket || '') + '</span></span><span class="badge">Action</span></div>' +
        body +
        '<div><button type="button" class="btn primary sm" data-eact="' + id + '"' + (done ? ' disabled' : '') + '>' + (done ? 'Approved' : btnTxt) + '</button></div>' +
      '</div>';
    }

    function drawMsgs() {
      const s = getCur(), hist = s ? s.messages : [];
      box.innerHTML = hist.length
        ? hist.map((m, mi) => {
            if (m.role === 'user') return '<div class="msg me">' + esc(m.content) + '</div>';
            const pending = (m.actions || []).filter((a, ai) => !(m.done && m.done[ai])).length;
            return '<div class="amsg">' +
              '<div class="msg ai"><div class="aihd">Elara</div><span>' + esc(m.content) + '</span></div>' +
              ((m.actions || []).length ? '<div class="elara-ac-grid">' + m.actions.map((a, ai) => cardHtml(a, mi, ai, m.done && m.done[ai])).join('') + (pending > 1 ? '<div><button type="button" class="btn primary sm" data-eall="' + mi + '">Approve all (' + pending + ')</button></div>' : '') + '</div>' : '') +
            '</div>';
          }).join('')
        : '<div class="chat-empty"><strong style="color:var(--text);display:block;margin-bottom:6px">Studio-wide command center</strong>Elara handles incoming client messages and briefs you above.<br><span class="xs muted">Command her across any client—e.g. "Tell Robie his project is under review and ask Sophia for her assets."</span></div>';
      box.scrollTop = box.scrollHeight;
    }

    async function runPrompt(q) {
      let s = getCur();
      if (!s) { s = { id: String(Date.now()), title: q.slice(0, 38), messages: [] }; sessions.unshift(s); curId = s.id; }
      s.messages.push({ role: 'user', content: q });
      save(); drawSessions(); drawMsgs();
      box.insertAdjacentHTML('beforeend', '<div class="msg ai typing"><div class="aihd">Elara</div><span class="shim">Coordinating across workspace&hellip;</span></div>');
      box.scrollTop = box.scrollHeight;

      let out = null;
      try {
        const { data, error } = await sb.functions.invoke('elara', { body: { workspace_id: ws.id, messages: s.messages.map(m => ({ role: m.role, content: m.content })), clients } });
        if (!error && data && !data.error) out = data;
      } catch (e) {}
      if (!out) out = localParse(q, clients);

      s.messages.push({ role: 'assistant', content: out.reply || '', actions: out.actions || [], done: {} });
      save(); drawMsgs();
    }

    async function execAction(a, id) {
      if (!a.client_id) return { message: 'No matching client found.' };
      if (a.type === 'set_stage') {
        const { error } = await sb.from('clients').update({ stage: a.stage }).eq('id', a.client_id);
        if (!error) DC.log(ws.id, a.client_id, 'stage_changed', { stage: a.stage }, true);
        return error;
      }
      if (a.type === 'draft_message') {
        const ta = main.querySelector('[data-edm="' + id + '"]');
        const body = ((ta && ta.value) || a.body || '').trim();
        if (!body) return null;
        const { error } = await sb.from('messages').insert({ client_id: a.client_id, workspace_id: ws.id, sender_id: uid, sender_kind: 'developer', body });
        return error;
      }
      if (a.type === 'add_task') {
        const { error } = await sb.from('checklist_items').insert({ client_id: a.client_id, workspace_id: ws.id, text: a.text });
        return error;
      }
      return null;
    }

    main.querySelector('#egForm').onsubmit = e => {
      e.preventDefault(); const f = e.target, q = f.q.value.trim(); if (!q) return;
      f.q.value = ''; runPrompt(q);
    };

    const mic = main.querySelector('#egMic'), dumpEl = main.querySelector('#egDump'), dt = main.querySelector('#egDt'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let rec = null, fin = '', interim = '';
    const stopRec = send => {
      const r = rec; if (!r) return; rec = null; r.onend = null; try { r.stop(); } catch (e) {}
      mic.setAttribute('aria-pressed', 'false'); dumpEl.hidden = true;
      const text = (fin + ' ' + interim).replace(/\s+/g, ' ').trim(); fin = interim = '';
      if (send && text.length >= 3) runPrompt(text);
    };
    mic.onclick = () => {
      if (rec) return stopRec(false);
      if (!SR) return toast('Voice input needs Chrome, Edge or Safari.');
      const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US';
      fin = interim = ''; dt.textContent = ''; rec = r;
      r.onresult = e => { let live = ''; for (let k = e.resultIndex; k < e.results.length; k++) { const x = e.results[k]; if (x.isFinal) fin += x[0].transcript + ' '; else live += x[0].transcript; } interim = live; dt.textContent = (fin + live).trim(); };
      r.onend = () => { if (rec === r) try { r.start(); } catch (e) {} };
      try { r.start(); } catch (e) { rec = null; return toast('Could not start microphone.'); }
      mic.setAttribute('aria-pressed', 'true'); dumpEl.hidden = false;
    };
    main.querySelector('#egDone').onclick = () => stopRec(true);
    main.querySelector('#egCancel').onclick = () => stopRec(false);

    main.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.brReply) { const inp = main.querySelector('#egForm input[name="q"]'); inp.value = 'Tell ' + b.dataset.brReply + ' '; inp.focus(); return; }
      if (b.dataset.brChat) { const cl = clients.find(x => x.id === b.dataset.brChat); if (cl) onChat(cl); return; }
      if (b.dataset.brAck) {
        try {
          const prev = JSON.parse(localStorage.getItem('devchat-ack-' + ws.id) || '[]');
          localStorage.setItem('devchat-ack-' + ws.id, JSON.stringify([...new Set([...prev, b.dataset.brAck])].slice(-100)));
        } catch (x) {}
        await DC.log(ws.id, b.dataset.brCid, 'ai_ack', { ack_id: b.dataset.brAck }, false);
        drawBriefs(); return;
      }
      if (b.id === 'egNew') { curId = null; drawSessions(); drawMsgs(); return; }
      if (b.dataset.sid) { curId = b.dataset.sid; drawSessions(); drawMsgs(); return; }
      if (b.dataset.sdel) { sessions = sessions.filter(x => x.id !== b.dataset.sdel); if (curId === b.dataset.sdel) curId = sessions[0] ? sessions[0].id : null; save(); drawSessions(); drawMsgs(); return; }
      if (b.dataset.ep) return runPrompt(b.dataset.ep);
      if (b.dataset.eall) {
        const s = getCur(), mi = +b.dataset.eall, m = s.messages[mi]; b.disabled = true; let n = 0;
        for (let ai = 0; ai < m.actions.length; ai++) {
          if (m.done && m.done[ai]) continue;
          const err = await execAction(m.actions[ai], mi + ':' + ai);
          if (err) { toast(err.message); break; }
          (m.done = m.done || {})[ai] = true; n++;
        }
        save(); drawMsgs(); toast('Approved ' + n + ' actions.');
        return;
      }
      if (b.dataset.eact) {
        const s = getCur(), [mi, ai] = b.dataset.eact.split(':').map(Number), m = s.messages[mi], a = m.actions[ai];
        b.disabled = true;
        const err = await execAction(a, b.dataset.eact);
        if (err) { b.disabled = false; return toast(err.message); }
        (m.done = m.done || {})[ai] = true; save(); drawMsgs(); toast('Done.');
      }
    };

    drawBriefs(); drawSessions(); drawMsgs();
  }
  return { show };
})();