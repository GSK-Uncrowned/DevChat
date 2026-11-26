// Shared file box (developer and client). Files live in the private "client-files" storage bucket.
window.Files = { mount(el, o) {
  const { sb, esc, toast } = DC;
  let L = [];
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const draw = async () => {
    const { data } = await sb.from('files').select('*').eq('client_id', o.clientId).order('created_at', { ascending: false });
    L = data || [];
    el.innerHTML =
      '<div class="card pad between" style="margin-bottom:14px"><span class="sub sm">Up to 10 MB each.</span><label class="btn primary sm" style="cursor:pointer"><input type="file" id="fi" hidden>Upload file</label></div>' +
      '<div class="card clip">' +
        (L.map(f =>
          '<div class="crow" style="grid-template-columns:1fr auto auto">' +
            '<div><strong>' + esc(f.name) + '</strong><p class="muted xs" style="margin-top:2px">' + kb(f.size_bytes || 0) + ' &middot; ' + new Date(f.created_at).toLocaleDateString() + '</p></div>' +
            '<button class="btn sm" data-dl="' + f.id + '">Download</button>' +
            (o.canDelete ? '<button class="btn ghost sm" data-rm="' + f.id + '">Delete</button>' : '<span></span>') +
          '</div>'
        ).join('') || '<div class="empty" style="padding:36px 20px"><p class="sub sm">No files uploaded yet.</p></div>') +
      '</div>';

    el.querySelector('#fi').onchange = async e => {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 10 * 1048576) return toast('That file is over 10 MB.');
      const path = o.workspaceId + '/' + o.clientId + '/' + Date.now() + '-' + file.name.replace(/[^\w.-]+/g, '_');
      const up = await sb.storage.from('client-files').upload(path, file);
      if (up.error) return toast(up.error.message);
      const { error } = await sb.from('files').insert({ client_id: o.clientId, workspace_id: o.workspaceId, uploader_id: o.uid, storage_path: path, name: file.name, size_bytes: file.size });
      if (error) { await sb.storage.from('client-files').remove([path]); return toast(error.message); }
      DC.log(o.workspaceId, o.clientId, 'file_uploaded', { name: file.name }, false);
      draw();
    };
  };
  el.onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.dl) {
      const f = L.find(x => x.id === b.dataset.dl);
      const { data, error } = await sb.storage.from('client-files').createSignedUrl(f.storage_path, 60, { download: f.name });
      if (error) return toast(error.message);
      window.open(data.signedUrl, '_blank');
    } else if (b.dataset.rm) {
      if (!confirm('Delete this file?')) return;
      const f = L.find(x => x.id === b.dataset.rm);
      await sb.storage.from('client-files').remove([f.storage_path]);
      await sb.from('files').delete().eq('id', f.id);
      draw();
    }
  };
  draw();
} };