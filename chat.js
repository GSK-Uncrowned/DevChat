// Shared chat box. kind is 'developer' or 'client'.
window.Chat = { isMention: s => /(^|\s)@(elara|ai)\b/i.test(s || ''), async mount(el, o) {
  const { sb, esc } = DC, BK = 'client-files';
  const headLeft = o.onBack
    ? '<div class="row" style="gap:10px"><button type="button" class="btn ghost sm" data-back>&larr; Back</button><span class="av on" style="width:32px;height:32px;font-size:12px">' + esc(o.initials || '?') + '</span><div><strong style="font-size:14px">' + esc(o.title || 'Chat') + '</strong>' + (o.ticket ? '<span class="xs mono muted" style="margin-left:6px">' + esc(o.ticket) + '</span>' : '') + '</div></div>'
    : '<span class="sm sub" style="font-weight:500">Conversation</span>';
  const projBtn = o.onProject ? '<button type="button" class="btn sm" data-proj>Open project</button>' : '';

  el.innerHTML =
    '<div class="chat withbar">' +
      '<div class="cbar">' +
        headLeft +
        '<div class="row">' +
          '<button type="button" class="btn sm" data-files aria-expanded="false">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="14" height="14"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>' +
            'Files <span class="badge" hidden>0</span>' +
          '</button>' +
          projBtn +
        '</div>' +
      '</div>' +
      '<div class="msgs" aria-live="polite"></div>' +
      '<form class="cform">' +
        '<div class="pend" hidden></div>' +
        '<button type="button" class="mhint" hidden><strong>@elara</strong><span>Your AI assistant. Tell Elara your progress and the client is updated.</span></button>' +
        '<div class="composer">' +
          '<label class="plus" title="Attach a file"><input type="file" name="f" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></label>' +
          '<input name="b" placeholder="Write a message" autocomplete="off">' +
          '<button class="btn primary">Send</button>' +
        '</div>' +
      '</form>' +
      '<div class="fdrawer" hidden>' +
        '<div class="fd-h"><strong>Shared files</strong><button type="button" class="btn ghost sm" data-fclose aria-label="Close files">&times; Close</button></div>' +
        '<div class="fd-b"></div>' +
      '</div>' +
    '</div>';

  if (o.onBack) el.querySelector('[data-back]').onclick = o.onBack;
  if (o.onProject) el.querySelector('[data-proj]').onclick = o.onProject;

  const box = el.querySelector('.msgs'), form = el.querySelector('form'), pend = el.querySelector('.pend'), seen = new Set(), info = {};
  let pending = null, emptyEl = null;
  const getFile = async id => info[id] || (info[id] = (await sb.from('files').select('id,name,storage_path').eq('id', id).maybeSingle()).data);

  const fileBtn = f => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'att'; b.textContent = f.name;
    b.onclick = async () => { const r = await sb.storage.from(BK).createSignedUrl(f.storage_path, 60, { download: f.name }); if (r.error) DC.toast(r.error.message); else window.open(r.data.signedUrl, '_blank'); };
    return b;
  };

  const IMG = /\.(png|jpe?g|webp|gif)$/i;
  let stick = true;
  box.addEventListener('scroll', () => { stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80; });

  const imageMsg = (d, t, f, m) => {
    d.classList.add('has-img'); if (f.name === m.body) { t.remove(); d.classList.add('img-only'); }
    let url = null;
    const getUrl = async fresh => {
      if (!url || fresh) { const r = await sb.storage.from(BK).createSignedUrl(f.storage_path, 3600); if (r.error) throw r.error; url = r.data.signedUrl; }
      return url;
    };
    const item = {
      name: f.name, url: getUrl,
      download: async () => {
        const r = await sb.storage.from(BK).createSignedUrl(f.storage_path, 60, { download: f.name }); if (r.error) throw r.error;
        const a = document.createElement('a'); a.href = r.data.signedUrl; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      }
    };
    const b = document.createElement('button'); b.type = 'button'; b.className = 'imgmsg loading'; b.setAttribute('aria-label', 'View image ' + f.name); b._item = item;
    const im = document.createElement('img'); im.alt = f.name; im.decoding = 'async';
    let retried = false;
    im.onload = () => { b.classList.remove('loading'); if (stick) box.scrollTop = box.scrollHeight; };
    im.onerror = async () => {
      if (!retried) { retried = true; try { im.src = await getUrl(true); return; } catch (e) {} }
      b.replaceWith(fileBtn(f));
    };
    b.onclick = () => {
      if (!window.ImageViewer) return item.download().catch(e => DC.toast(e.message));
      const all = [...box.querySelectorAll('.imgmsg')].filter(x => x._item);
      ImageViewer.open(all.map(x => x._item), all.indexOf(b));
    };
    b.appendChild(im); d.insertBefore(b, d.querySelector('.msg-time'));
    getUrl().then(u => { im.src = u; }).catch(() => im.onerror());
  };

  const aiHead = () => {
    const h = document.createElement('div'); h.className = 'aihd';
    h.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="13" height="13"><path d="M12 2l2.2 6.3L20.5 10l-6.3 1.7L12 18l-2.2-6.3L3.5 10l6.3-1.7zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>Elara';
    return h;
  };

  const fill = (el, text, mentions) => {
    if (!mentions) { el.textContent = text; return; }
    String(text).split(/(@(?:elara|ai)\b)/i).forEach(p => {
      if (/^@(?:elara|ai)$/i.test(p)) { const s = document.createElement('span'); s.className = 'mention'; s.textContent = p; el.appendChild(s); }
      else if (p) el.appendChild(document.createTextNode(p));
    });
  };

  const typing = () => {
    const words = ['Reading the conversation', 'Checking your progress', 'Writing the update', 'Sharing it with the client'];
    const d = document.createElement('div'); d.className = 'msg ai typing'; d.appendChild(aiHead());
    const t = document.createElement('span'); t.className = 'shim'; d.appendChild(t);
    let k = 0; const set = () => { t.textContent = words[k++ % words.length] + '\u2026'; }; set();
    const h = setInterval(set, 1800); box.appendChild(d); box.scrollTop = box.scrollHeight;
    return () => { clearInterval(h); d.remove(); };
  };

  const fmtTime = iso => { try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  const put = m => {
    if (seen.has(m.id)) return; seen.add(m.id);
    if (emptyEl) { emptyEl.remove(); emptyEl = null; }
    const d = document.createElement('div'); d.className = 'msg' + (m.sender_kind === o.kind ? ' me' : '') + (m.sender_kind === 'ai' ? ' ai' : '');
    if (m.sender_kind === 'ai') d.appendChild(aiHead());
    const t = document.createElement('span'); fill(t, m.body, m.sender_kind === 'developer'); d.appendChild(t);
    const tm = document.createElement('span'); tm.className = 'msg-time'; tm.textContent = fmtTime(m.created_at); d.appendChild(tm);
    box.appendChild(d); box.scrollTop = box.scrollHeight;
    if (m.file_id) getFile(m.file_id).then(f => {
      if (!f) return;
      if (IMG.test(f.name)) return imageMsg(d, t, f, m);
      if (f.name === m.body) t.remove();
      d.insertBefore(fileBtn(f), tm); box.scrollTop = box.scrollHeight;
    });
  };

  const paint = () => {
    pend.hidden = !pending;
    pend.innerHTML = pending ? '<span>' + esc(pending.name) + '</span><button type="button" class="btn ghost sm" data-x aria-label="Remove attachment">&times;</button>' : '';
  };
  form.f.onchange = e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; if (f.size > 10 * 1048576) return DC.toast('That file is over 10 MB.'); pending = f; paint(); };
  pend.onclick = e => { if (e.target.closest('[data-x]')) { pending = null; paint(); } };

  const { data } = await sb.from('messages').select('*').eq('client_id', o.clientId).order('created_at');
  if (data && data.length) data.forEach(put);
  else {
    emptyEl = document.createElement('p'); emptyEl.className = 'chat-empty';
    emptyEl.textContent = 'No messages yet. Say hello to start the conversation.';
    box.appendChild(emptyEl);
  }
  const ch = sb.channel('msg-' + o.clientId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'client_id=eq.' + o.clientId }, p => put(p.new)).subscribe();

  const fbtn = el.querySelector('[data-files]'), dr = el.querySelector('.fdrawer'), fb = el.querySelector('.fd-b'), badge = fbtn.querySelector('.badge');
  const cnt = async () => { const { count } = await sb.from('files').select('id', { count: 'exact', head: true }).eq('client_id', o.clientId); badge.textContent = count || 0; badge.hidden = !count; };
  const closeFiles = () => { dr.hidden = true; fb.innerHTML = ''; fbtn.setAttribute('aria-expanded', 'false'); cnt(); };
  fbtn.onclick = () => {
    if (!dr.hidden) return closeFiles();
    dr.hidden = false; fbtn.setAttribute('aria-expanded', 'true');
    if (window.Files) Files.mount(fb, { clientId: o.clientId, workspaceId: o.workspaceId, uid: o.uid, canDelete: !!o.canDelete });
  };
  el.querySelector('[data-fclose]').onclick = closeFiles;
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && !dr.hidden) closeFiles(); });
  cnt();

  const mh = form.querySelector('.mhint');
  if (o.mention) {
    form.b.placeholder = 'Write a message, or @elara to share progress';
    const accept = () => { form.b.value = form.b.value.replace(/@[a-z]*$/i, '@elara '); mh.hidden = true; form.b.focus(); };
    form.b.addEventListener('input', () => { const m = /(^|\s)@([a-z]*)$/i.exec(form.b.value); mh.hidden = !(m && ['elara', 'ai'].some(n => n.startsWith(m[2].toLowerCase()))); });
    form.b.addEventListener('keydown', e => { if (e.key === 'Tab' && !mh.hidden) { e.preventDefault(); accept(); } });
    mh.onclick = accept;
  }

  form.onsubmit = async e => {
    e.preventDefault(); const body = form.b.value.trim(), file = pending; if (!body && !file) return;
    form.b.value = ''; mh.hidden = true; pending = null; paint();
    let file_id = null;
    if (file) {
      const path = o.workspaceId + '/' + o.clientId + '/' + Date.now() + '-' + file.name.replace(/[^\w.-]+/g, '_');
      const up = await sb.storage.from(BK).upload(path, file);
      if (up.error) return DC.toast('Could not upload: ' + up.error.message);
      const r = await sb.from('files').insert({ client_id: o.clientId, workspace_id: o.workspaceId, uploader_id: o.uid, storage_path: path, name: file.name, size_bytes: file.size }).select('id,name,storage_path').single();
      if (r.error) { await sb.storage.from(BK).remove([path]); return DC.toast(r.error.message); }
      file_id = r.data.id; info[file_id] = r.data; DC.log(o.workspaceId, o.clientId, 'file_uploaded', { name: file.name }, false); cnt();
    }
    const { data, error } = await sb.from('messages').insert({ client_id: o.clientId, workspace_id: o.workspaceId, sender_id: o.uid, sender_kind: o.kind, body: body || file.name, file_id }).select().single();
    if (error) DC.toast('Could not send: ' + error.message);
    else {
      put(data);
      const wait = o.mention && Chat.isMention(data.body) ? typing() : null;
      try { if (o.afterSend) { const r = await o.afterSend(data); if (r && r.message) put(r.message); } }
      catch (err) { DC.toast('Something went wrong. Try again.'); }
      finally { if (wait) wait(); }
    }
  };
  return () => sb.removeChannel(ch);
} };