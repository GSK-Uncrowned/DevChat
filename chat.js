// Shared chat box. kind is 'developer' or 'client'. Returns a function that stops live updates.
window.Chat = { async mount(el, o) {
  const sb = DC.sb;
  el.innerHTML = '<div class="chat"><div class="msgs" aria-live="polite"></div><form class="chat-in"><input name="b" placeholder="Write a message" autocomplete="off" required><button class="btn primary">Send</button></form></div>';
  const box = el.querySelector('.msgs'), seen = new Set();
  const put = m => { if (seen.has(m.id)) return; seen.add(m.id); const d = document.createElement('div'); d.className = 'msg' + (m.sender_kind === o.kind ? ' me' : '') + (m.sender_kind === 'ai' ? ' ai' : ''); d.textContent = m.body; box.appendChild(d); box.scrollTop = box.scrollHeight; };
  const { data } = await sb.from('messages').select('*').eq('client_id', o.clientId).order('created_at');
  (data || []).forEach(put);
  const ch = sb.channel('msg-' + o.clientId).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'client_id=eq.' + o.clientId }, p => put(p.new)).subscribe();
  el.querySelector('form').onsubmit = async e => {
    e.preventDefault(); const f = e.target, body = f.b.value.trim(); if (!body) return; f.b.value = '';
    const { data, error } = await sb.from('messages').insert({ client_id: o.clientId, workspace_id: o.workspaceId, sender_id: o.uid, sender_kind: o.kind, body }).select().single();
    if (error) DC.toast('Could not send: ' + error.message);
    else { put(data); if (o.afterSend) { const r = await o.afterSend(); if (r && r.message) put(r.message); } }
  };
  return () => sb.removeChannel(ch);
} };
