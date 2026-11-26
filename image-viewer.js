// Full-screen image viewer (Messenger style). No dependencies.
// ImageViewer.open(items, index)
//   items: [{ name, url(fresh?) -> Promise<string>, download() -> Promise<void> }]
// Prev/next only appear when there is more than one item.
window.ImageViewer = (function () {
  const I = {
    dl: '<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>'
  };
  const icon = k => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[k] + '</svg>';

  let root, stage, img, spin, err, toastEl, countEl, prevB, nextB;
  let items = [], i = 0, token = 0, isOpen = false, opener = null, prevOverflow = '', hideT = 0, toastT = 0, touch = null;

  function build() {
    if (root) return;
    root = document.createElement('div');
    root.className = 'iv';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Image viewer');
    root.innerHTML =
      '<div class="iv-top"><span class="iv-count" aria-live="polite"></span><div class="iv-actions">' +
      '<button type="button" class="iv-btn" data-fast data-a="dl" aria-label="Download image" title="Download">' + icon('dl') + '</button>' +
      '<button type="button" class="iv-btn" data-fast data-a="x" aria-label="Close" title="Close">' + icon('x') + '</button></div></div>' +
      '<div class="iv-stage"><img class="iv-img" alt="" draggable="false"><div class="iv-spin" aria-hidden="true"></div><p class="iv-err" hidden>Could not load this image.</p></div>' +
      '<button type="button" class="iv-btn iv-nav prev" data-fast data-a="prev" aria-label="Previous image">' + icon('prev') + '</button>' +
      '<button type="button" class="iv-btn iv-nav next" data-fast data-a="next" aria-label="Next image">' + icon('next') + '</button>' +
      '<div class="iv-toast" role="status"></div>';
    document.body.appendChild(root);
    stage = root.querySelector('.iv-stage'); img = root.querySelector('.iv-img'); spin = root.querySelector('.iv-spin');
    err = root.querySelector('.iv-err'); toastEl = root.querySelector('.iv-toast'); countEl = root.querySelector('.iv-count');
    prevB = root.querySelector('.prev'); nextB = root.querySelector('.next');

    root.addEventListener('click', e => {
      const b = e.target.closest('[data-a]');
      if (b) {
        if (b.dataset.a === 'x') close();
        else if (b.dataset.a === 'dl') download();
        else go(b.dataset.a === 'next' ? 1 : -1);
        return;
      }
      if (e.target === img) return; // clicking the image itself never closes
      close();
    });
    // Swipe left/right on touch screens to move between images.
    stage.addEventListener('touchstart', e => { const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
    stage.addEventListener('touchend', e => {
      if (!touch) return; const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y; touch = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', onKey, true);
  }

  const load = u => new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });

  async function show(n) {
    i = n; const it = items[i], my = ++token, multi = items.length > 1;
    img.classList.remove('ready'); err.hidden = true; spin.hidden = false;
    img.alt = it.name || 'Image';
    countEl.textContent = multi ? (i + 1) + ' / ' + items.length : '';
    prevB.hidden = nextB.hidden = !multi;
    prevB.disabled = i === 0; nextB.disabled = i === items.length - 1;
    try {
      const u = await it.url();
      if (my !== token) return;
      try { await load(u); } catch (_e) { if (my !== token) return; await load(await it.url(true)); } // expired link: retry once
      if (my !== token) return;
      spin.hidden = true; img.classList.add('ready');
      [i - 1, i + 1].forEach(k => { if (items[k]) items[k].url().then(p => { new Image().src = p; }).catch(() => {}); }); // warm neighbours
    } catch (_e) {
      if (my !== token) return;
      spin.hidden = true; err.hidden = false;
    }
  }

  function go(d) { const n = i + d; if (n >= 0 && n < items.length) show(n); }

  async function download() {
    try { await items[i].download(); }
    catch (e) { say((e && e.message) || 'Could not download this image.'); }
  }

  function say(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  function onKey(e) {
    if (!isOpen) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'Tab') { // keep focus inside the viewer
      const f = [...root.querySelectorAll('button:not([disabled]):not([hidden])')];
      if (!f.length) return e.preventDefault();
      const a = document.activeElement;
      if (!root.contains(a)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  }

  function open(list, index) {
    if (!list || !list.length) return;
    build();
    items = list; opener = document.activeElement;
    clearTimeout(hideT);
    if (!isOpen) { prevOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    isOpen = true;
    void root.offsetWidth; // make sure the starting state is painted so the fade-in animates
    root.classList.add('open');
    root.querySelector('[data-a="x"]').focus({ preventScroll: true });
    show(Math.min(Math.max(index || 0, 0), items.length - 1));
  }

  function close() {
    if (!isOpen) return;
    isOpen = false; token++;
    root.classList.remove('open');
    document.body.style.overflow = prevOverflow;
    hideT = setTimeout(() => { img.onload = img.onerror = null; img.removeAttribute('src'); img.classList.remove('ready'); }, 240);
    if (opener && document.contains(opener) && opener.focus) opener.focus({ preventScroll: true });
    opener = null;
  }

  return { open, close };
})();
