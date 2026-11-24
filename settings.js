// Developer side: Settings page (with the Away assistant FAQ) and the style card editor.
window.Settings = (function () {
  const { sb, esc, toast } = DC;
  let main, ws;
  const sw = p => '<div class="sw big">' + (p || []).map(h => '<i style="background:' + esc(h) + '"></i>').join('') + '</div>';
  function init(m, w) { main = m; ws = w; }

  async function show() {
    main.onclick = null;
    main.innerHTML = '<header class="page-h"><div><h1>Settings</h1><p class="sub small">How your workspace behaves for clients.</p></div></header><div class="set">' +
      '<form class="panel pad stack" id="wf"><h2>Workspace</h2><label>Name<input name="wname" required maxlength="60" value="' + esc(ws.name) + '"></label>' +
      '<div class="two"><label>Client limit<input name="cap" type="number" min="1" placeholder="No limit" value="' + (ws.capacity || '') + '"></label><label>Days per client (wait estimate)<input name="days" type="number" min="1" max="365" required value="' + ws.est_days_per_client + '"></label></div>' +
      '<label>Away message<textarea name="away" maxlength="300" placeholder="Shown to clients when your status is Away">' + esc(ws.away_message || '') + '</textarea></label>' +
      '<label class="chk"><input type="checkbox" name="ai"' + (ws.away_ai ? ' checked' : '') + '> Let the AI reply to clients while my status is Away</label><div><button class="btn primary">Save</button></div></form>' +
      '<div class="panel pad stack"><h2>Away assistant answers</h2><p class="sub small">The AI answers only from these and what the client has told you. Do not put prices or deadlines here.</p><div id="fl"></div>' +
      '<form class="stack" id="ff"><label>Question<input name="q" required maxlength="200" placeholder="How long does a website take?"></label><label>Answer<textarea name="a" required maxlength="600" placeholder="Most sites take 2 to 3 weeks once I start."></textarea></label><div><button class="btn">Add answer</button></div></form></div></div>';
    main.querySelector('#wf').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const row = { name: f.wname.value.trim(), away_message: f.away.value.trim() || null, capacity: f.cap.value ? +f.cap.value : null, est_days_per_client: +f.days.value, away_ai: f.ai.checked };
      const { error } = await sb.from('workspaces').update(row).eq('id', ws.id);
      if (error) return toast(error.message); Object.assign(ws, row); toast('Saved.');
    };
    const drawFaq = async () => {
      const { data } = await sb.from('ai_faq').select('id,question,answer').eq('workspace_id', ws.id);
      main.querySelector('#fl').innerHTML = (data || []).map(x => '<div class="wi" style="grid-template-columns:1fr auto"><span><strong>' + esc(x.question) + '</strong><br><span class="sub small">' + esc(x.answer) + '</span></span><button class="btn ghost sm" data-rmf="' + x.id + '">Delete</button></div>').join('') || '<p class="muted small">No answers yet.</p>';
    };
    main.querySelector('#ff').onsubmit = async e => {
      e.preventDefault(); const f = e.target;
      const { error } = await sb.from('ai_faq').insert({ workspace_id: ws.id, question: f.q.value.trim(), answer: f.a.value.trim() });
      if (error) return toast(error.message); f.reset(); drawFaq();
    };
    main.querySelector('#fl').onclick = async e => { const b = e.target.closest('[data-rmf]'); if (!b) return; await sb.from('ai_faq').delete().eq('id', b.dataset.rmf); drawFaq(); };
    drawFaq();
  }

  async function styles() {
    const { data, error } = await sb.from('style_cards').select('id,title,palette').eq('workspace_id', ws.id).order('created_at');
    if (error) return toast(error.message);
    const L = data || [];
    main.innerHTML = '<header class="page-h"><div><h1>Style cards</h1><p class="sub small">What clients choose from on their Requirements tab.</p></div><button class="btn primary" data-new>New style</button></header><div class="cards">' +
      (L.map(s => '<div class="scard">' + sw(s.palette) + '<div class="row-gap" style="justify-content:space-between"><strong>' + esc(s.title) + '</strong><span class="row-gap"><button class="btn ghost sm" data-edit="' + s.id + '">Edit</button><button class="btn ghost sm" data-rm="' + s.id + '">Delete</button></span></div></div>').join('') || '<div class="panel empty" style="grid-column:1/-1"><h2>No style cards</h2><p class="sub small">Add one so clients have something to pick.</p></div>') + '</div>';
    main.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-new')) editor(null);
      else if (b.dataset.edit) editor(L.find(x => x.id === b.dataset.edit));
      else if (b.dataset.rm) { if (!confirm('Delete this style? Clients\' picks of it are removed too.')) return; const r = await sb.from('style_cards').delete().eq('id', b.dataset.rm); if (r.error) toast(r.error.message); styles(); }
    };
    function editor(s) {
      let cols = s ? [...s.palette] : ['#111111', '#ffffff', '#34d399'];
      const d = document.createElement('dialog'); d.className = 'modal';
      d.innerHTML = '<form class="stack"><h2>' + (s ? 'Edit style' : 'New style') + '</h2><label>Name<input name="t" required maxlength="40" value="' + esc(s ? s.title : '') + '"></label><div><p class="small sub" style="margin-bottom:8px">Colors</p><div class="pal"></div></div><div class="row-gap" style="justify-content:flex-end"><button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Save</button></div></form>';
      document.body.appendChild(d);
      const pal = d.querySelector('.pal'), f = d.querySelector('form');
      const paint = () => { pal.innerHTML = cols.map((h, i) => '<input type="color" data-i="' + i + '" value="' + esc(h) + '" aria-label="Color ' + (i + 1) + '">').join('') + (cols.length < 5 ? '<button type="button" class="btn sm" data-add>Add</button>' : '') + (cols.length > 2 ? '<button type="button" class="btn ghost sm" data-less>Remove last</button>' : ''); };
      paint();
      d.addEventListener('input', e => { if (e.target.dataset.i) cols[+e.target.dataset.i] = e.target.value; });
      d.addEventListener('click', e => { if (e.target === d) d.close(); const b = e.target.closest('button'); if (!b) return; if (b.hasAttribute('data-add')) { cols.push('#888888'); paint(); } else if (b.hasAttribute('data-less')) { cols.pop(); paint(); } else if (b.hasAttribute('data-x')) d.close(); });
      d.addEventListener('close', () => d.remove());
      f.onsubmit = async e => {
        e.preventDefault(); const row = { title: f.t.value.trim(), palette: cols };
        const { error } = s ? await sb.from('style_cards').update(row).eq('id', s.id) : await sb.from('style_cards').insert({ ...row, workspace_id: ws.id });
        if (error) return toast(error.message); d.close(); styles();
      };
      d.showModal(); f.t.focus();
    }
  }
  return { init, show, styles };
})();
