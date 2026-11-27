// First-time client onboarding. This turns the visual wizard demo into a
// workspace-scoped, persisted Supabase flow.
window.ClientOnboarding = (function () {
  const { sb, esc, toast } = DC;

  const TYPES = [
    { id: 'landing_page', label: 'One-page site', desc: 'A single page to introduce what you do and get people to reach out or sign up.' },
    { id: 'business_site', label: 'Business website', desc: 'Multiple pages like Home, About, Services, and Contact.' },
    { id: 'portfolio', label: 'Portfolio / Personal site', desc: 'Show off your work, photos, projects, or personal brand.' },
    { id: 'ecommerce', label: 'Online store', desc: 'Sell products online with a shopping cart and checkout.' }
  ];
  const FEATS = {
    landing_page: ['Big welcome banner & button', 'What you offer', 'Customer reviews', 'Prices & packages', 'Common questions (FAQ)', 'Sign-up / contact form'],
    business_site: ['Home page', 'About us / our story', 'Services we offer', 'Past work / examples', 'Customer reviews', 'Contact & booking form'],
    portfolio: ['Gallery of my work', 'Project stories', 'About me', 'Clients I’ve worked with', 'Contact form'],
    ecommerce: ['Featured products', 'Product pages & photos', 'Shopping cart', 'Search & categories', 'Customer reviews']
  };
  const PALETTES = [
    { id: 'obsidian-mint', name: 'Midnight & Mint', vibe: 'Modern dark', colors: ['#0B0D14', '#161B26', '#34D399', '#F4F4F5'] },
    { id: 'swiss-mono', name: 'Clean Black & White', vibe: 'Simple & crisp', colors: ['#FFFFFF', '#F2F2EF', '#111111', '#7A7A82'] },
    { id: 'warm-craft', name: 'Coffee & Cream', vibe: 'Warm & cozy', colors: ['#1C1510', '#F5EFE6', '#C87D55', '#4A3728'] },
    { id: 'acid-poster', name: 'Lime & Ink', vibe: 'Bold & loud', colors: ['#07260D', '#A3FF12', '#F7F5EE', '#111111'] },
    { id: 'cosmic-ai', name: 'Cosmic Violet', vibe: 'Futuristic glow', colors: ['#0E091A', '#261447', '#A855F7', '#F8FAFC'] },
    { id: 'soft-rose', name: 'Blush & Sage', vibe: 'Calm & boutique', colors: ['#FDF4F5', '#E8A5B5', '#486856', '#2B2124'] }
  ];
  const STYLES = [
    { id: 's1', title: 'Swiss Architectural', cat: 'Clean & Minimal', fonts: 'Inter Display + Geist Mono', palette: ['#FFFFFF', '#ECECE9', '#111111', '#8A8A8E'], description: 'Ultra-clean architectural whitespace with a floating gallery card and sharp black-and-white structure.' },
    { id: 's2', title: 'Dark Tech Product', cat: 'Dark & Tech', fonts: 'Geist + Space Mono', palette: ['#0B0D14', '#161B26', '#34D399', '#EEF0F5'], description: 'Dramatic studio spotlight, floating hardware display, and glowing mint product highlights.' },
    { id: 's3', title: 'Warm Craft & Story', cat: 'Warm & Luxury', fonts: 'Cormorant Garamond + Inter', palette: ['#241811', '#120C08', '#C87D55', '#F5EFE6'], description: 'Rich, cozy atmosphere with classic serif headlines—ideal for coffee brands, makers, and studios.' },
    { id: 's4', title: 'Acid Agency Poster', cat: 'Bold & Creative', fonts: 'Syne + DM Sans', palette: ['#06210C', '#A3FF12', '#F5F2E8', '#111111'], description: 'High-energy poster typography with playful tape corners and sticker badges that stand out.' },
    { id: 's5', title: 'Cosmic AI Platform', cat: 'Dark & Tech', fonts: 'Plus Jakarta Sans + Mono', palette: ['#090514', '#261447', '#A855F7', '#FFFFFF'], description: 'Luminous violet gradients, floating 3D geometric prism, and modern metric badges.' },
    { id: 's6', title: 'Monochrome Editorial', cat: 'Clean & Minimal', fonts: 'Instrument Serif + Inter', palette: ['#09090B', '#27272A', '#F4F4F5', '#9CA3AF'], description: 'Timeless black-and-white gallery feel designed for creators, consultants, and personal brands.' },
    { id: 's7', title: 'Industrial Grid V.01', cat: 'Bold & Creative', fonts: 'Helvetica + IBM Plex Mono', palette: ['#76756D', '#161614', '#E4E2DA', '#111111'], description: 'Structured Swiss brutalist grid with oversized index numbers and crisp monospace details.' },
    { id: 's8', title: 'Sticker Pop Studio', cat: 'Bold & Creative', fonts: 'Archivo Black + Inter', palette: ['#F4F6FB', '#1D4ED8', '#FF4D2E', '#0F172A'], description: 'Bright dotted canvas with neo-brutalist outlines, tilted color stickers, and playful energy.' },
    { id: 's9', title: 'Kinetic Split Gallery', cat: 'Bold & Creative', fonts: 'Syne + Inter', palette: ['#F4F3EE', '#111111', '#DC2626', '#991B1B'], description: 'Asymmetrical split-screen layout with a vertical project rail and dramatic focal stage.' },
    { id: 's10', title: 'Soft Botanical Store', cat: 'Online Store', fonts: 'Fraunces + DM Sans', palette: ['#FDF4F5', '#E8A5B5', '#486856', '#2B2124'], description: 'Gentle blush and sage boutique storefront with arched imagery and clean shopping badges.' },
    { id: 's11', title: 'Bento Dashboard SaaS', cat: 'Dark & Tech', fonts: 'Geist + Geist Mono', palette: ['#0B0E14', '#151A24', '#38BDF8', '#F4F4F5'], description: 'Precision dark grid with live Bento UI widgets, mini sparkline charts, and product polish.' },
    { id: 's12', title: 'Luxury Travertine', cat: 'Warm & Luxury', fonts: 'Playfair Display + Inter', palette: ['#F6F1E7', '#1F1B16', '#B68A45', '#D9CFC0'], description: 'Warm stone and gold hairline framing crafted for hospitality, real estate, and boutique brands.' }
  ];
  const TIMELINES = [
    { t: 'ASAP (1–2 weeks)', sub: 'Urgent launch' },
    { t: 'This month', sub: 'Standard pace' },
    { t: 'In 1–2 months', sub: 'Steady build' },
    { t: 'No rush', sub: 'Flexible schedule' }
  ];

  let root = null, client = null, onComplete = null, step = 1, catFilter = 'all', styleCards = [], picks = {}, saving = false;
  let brief = freshBrief();
  function freshBrief() {
    return { project_type: '', goal: '', palette_name: '', palette_colors: [], timeline: '', extra_notes: '', pages: [] };
  }

  // Compact visual website previews from the supplied style-library prototype.
  function mockHtml(s) {
    if (s.id==='s1') return `<div class="mk mk-swiss"><div class="mk-swiss-wm">ATELIER</div><div class="mk-swiss-win"><div class="mk-nav"><span>ATELIER®</span><div class="mk-nav-links"><span>WORK</span><span>ABOUT</span><span>CONTACT</span></div></div><div class="mk-swiss-grid"><div><div class="mk-swiss-hl">PURE<br>FORM</div><div style="font-size:6.5px;opacity:.6;margin-top:4px">Architectural design studio built on precision.</div></div><div class="mk-swiss-art"><svg viewBox="0 0 80 60" width="100%" height="100%" aria-hidden="true"><rect width="80" height="60" fill="#e6e6e1"/><path d="M12 60V18l28-8v50z" fill="#18181b"/><path d="M40 10l28 12v38H40z" fill="#52525b"/></svg></div></div><div class="mk-nav" style="border-top:1px solid rgba(0,0,0,.08);padding-top:4px"><span>INDEX / 01</span><span>SCROLL &darr;</span></div></div></div>`;
    if (s.id==='s2') return `<div class="mk mk-dark"><div class="mk-dark-screen"><div class="mk-dark-glow"></div><div class="mk-nav"><span>NOVA</span><span class="mk-btn" style="background:#34d399;color:#042f1e">LAUNCH</span></div><div><div class="mk-dark-hl">APPROACH &amp;<br>TECHNOLOGY</div><div style="font-size:6.5px;opacity:.65;margin-top:3px">Next-gen infrastructure built for speed.</div></div><div class="mk-dark-cards"><div class="mk-dark-chip"><strong style="color:#34d399">99.98%</strong><div style="opacity:.6">Uptime</div></div><div class="mk-dark-chip"><strong>14ms</strong><div style="opacity:.6">Latency</div></div></div></div></div>`;
    if (s.id==='s3') return `<div class="mk mk-craft"><div class="mk-nav"><span>DELTA ROASTERS</span><div class="mk-nav-links"><span>STORY</span><span>SHOP</span></div></div><div class="mk-craft-serif">Coffee with<br><span style="color:#c87d55;font-style:italic">heart &amp; craft.</span></div><div class="mk-craft-strip"><div class="mk-craft-card" style="background:linear-gradient(135deg,#6f4228,#2d180e)">ORIGIN</div><div class="mk-craft-card">ROAST</div><div class="mk-craft-card">BREW</div></div></div>`;
    if (s.id==='s4') return `<div class="mk mk-acid"><div class="mk-acid-sheet"><span class="mk-tape tl"></span><span class="mk-tape br"></span><span class="mk-acid-sticker">2026</span><div class="mk-nav"><span>BIKEBEAR</span><span>MENU</span></div><div class="mk-acid-hl">STICK<br>BY YOU</div><div class="mk-nav" style="justify-content:center"><span class="mk-btn" style="background:#091d0c;color:#a3ff12">EXPLORE WORK &rarr;</span></div></div></div>`;
    if (s.id==='s5') return `<div class="mk mk-neon"><div class="mk-nav"><span>NEXUS AI</span><div class="mk-nav-links"><span>MODELS</span><span>PRICING</span></div></div><div class="mk-neon-hero"><div><div class="mk-neon-hl">Control Your<br>AI Stack.</div><div class="mk-btn" style="background:#a855f7;color:#fff;margin-top:6px">Start free &rarr;</div></div><svg viewBox="0 0 80 70" width="100%" aria-hidden="true"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e879f9"/><stop offset="100%" stop-color="#6366f1"/></linearGradient></defs><polygon points="40,6 70,22 70,48 40,64 10,48 10,22" fill="url(#pg)" opacity=".85"/><polygon points="40,6 70,22 40,36 10,22" fill="#fff" opacity=".25"/></svg></div><div class="mk-neon-stats"><div class="mk-neon-stat"><strong>4.2M</strong><div style="opacity:.6">Events</div></div><div class="mk-neon-stat"><strong>Zero</strong><div style="opacity:.6">Leaks</div></div><div class="mk-neon-stat"><strong>SOC2</strong><div style="opacity:.6">Ready</div></div></div></div>`;
    if (s.id==='s6') return `<div class="mk mk-mono"><div class="mk-nav"><span>C. OGUNSOLA</span><div class="mk-nav-links"><span>ARCHIVE</span><span>INFO</span></div></div><div class="mk-mono-mid"><div><div class="mk-mono-serif">Creative<br>Direction</div><div style="font-size:6.5px;opacity:.6;margin-top:4px">Selected projects &amp; films</div></div><div class="mk-mono-port"><svg viewBox="0 0 60 60" width="54" height="54" aria-hidden="true"><circle cx="30" cy="22" r="11" fill="#d4d4d8"/><path d="M12 58c2-14 34-14 36 0z" fill="#a1a1aa"/></svg></div></div><div class="mk-nav" style="border-top:1px solid rgba(255,255,255,.15);padding-top:5px"><span>AVAILABLE Q4</span><span>&copy; 2026</span></div></div>`;
    if (s.id==='s7') return `<div class="mk mk-ind"><div class="mk-nav"><span>CRL® / V.01</span><span>(2026)</span></div><div class="mk-ind-grid"><div class="mk-ind-num">01</div><div class="mk-ind-spec">SYSTEMS<br>ARCHIVE<br>EDITORIAL<br>[READY]</div></div><div class="mk-nav"><span>MONOSPACE GRID</span><span>VIEW INDEX &nearr;</span></div></div>`;
    if (s.id==='s8') return `<div class="mk mk-pop"><div class="mk-nav"><strong>POPSTUDIO</strong><span class="mk-btn" style="background:#1d4ed8;color:#fff">LET’S GO</span></div><div class="mk-pop-box"><span class="mk-pop-pill" style="background:#ff4d2e;top:-7px;left:10px;transform:rotate(-7deg)">FRESH!</span><span class="mk-pop-pill" style="background:#1d4ed8;bottom:-7px;right:10px;transform:rotate(6deg)">★ TOP RATED</span><div class="mk-pop-hl">MAKE YOUR<br>BRAND POP</div></div><div class="mk-nav" style="justify-content:center;opacity:.65"><span>SOCIAL · WEB · MOTION</span></div></div>`;
    if (s.id==='s9') return `<div class="mk mk-kin"><div class="mk-kin-rail"><i style="background:#111"></i><i style="background:#dc2626"></i><i style="background:#a3a3a3"></i><i style="background:#262626"></i></div><div class="mk-kin-stage"><div class="mk-nav"><span>AUGE</span><span>MENU</span></div><div style="display:grid;place-items:center;gap:4px"><svg viewBox="0 0 50 40" width="46" aria-hidden="true"><rect x="6" y="4" width="38" height="32" rx="4" fill="#dc2626" opacity=".85"/><circle cx="25" cy="20" r="9" fill="#111"/></svg><div style="font-size:12px;font-weight:800;letter-spacing:.12em">EXPERIENCE</div></div><div class="mk-nav" style="justify-content:center;opacity:.6"><span>CASE STUDY 04</span></div></div></div>`;
    if (s.id==='s10') return `<div class="mk mk-bot"><div class="mk-nav"><span>FLORA STUDIO</span><div class="mk-nav-links"><span>SHOP</span><span>BAG (2)</span></div></div><div class="mk-bot-body"><div class="mk-bot-arch"><svg viewBox="0 0 60 80" width="54" aria-hidden="true"><path d="M30 72V28" stroke="#486856" stroke-width="2"/><ellipse cx="21" cy="40" rx="9" ry="5" transform="rotate(-30 21 40)" fill="#486856"/><ellipse cx="39" cy="34" rx="9" ry="5" transform="rotate(30 39 34)" fill="#5e826d"/><circle cx="30" cy="20" r="8" fill="#fff" opacity=".85"/></svg></div><div style="display:grid;gap:5px"><div style="font-family:Georgia,serif;font-size:14px;line-height:1.1">Spring<br>Botanicals</div><div style="font-size:7px;opacity:.7">Handcrafted oils &amp; stems — $48</div><span class="mk-btn" style="background:#486856;color:#fff">Shop now</span></div></div></div>`;
    if (s.id==='s11') return `<div class="mk mk-bento"><div class="mk-nav"><span>METRIC</span><span class="mk-btn" style="background:#38bdf8;color:#082f49">Get access</span></div><div style="font-size:12px;font-weight:700;letter-spacing:-.02em">Analytics that feel instant.</div><div class="mk-bento-grid"><div class="mk-bento-card"><div style="font-size:6.5px;opacity:.6">REVENUE</div><svg viewBox="0 0 100 32" width="100%" aria-hidden="true"><polyline fill="none" stroke="#38bdf8" stroke-width="2.5" points="2,28 22,22 40,24 62,11 80,14 98,4"/></svg></div><div class="mk-bento-card" style="place-content:center;text-align:center"><strong style="font-size:13px;color:#38bdf8">+42%</strong><span style="font-size:6px;opacity:.6">Growth</span></div></div></div>`;
    return `<div class="mk mk-lux"><div class="mk-lux-frame"><div class="mk-nav" style="color:#8c6a32"><span>EST. 1998</span><span>THE RESIDENCE</span><span>RESERVE</span></div><div style="display:grid;place-items:center;gap:4px"><svg viewBox="0 0 60 36" width="52" aria-hidden="true"><path d="M10 35V18a20 20 0 0 1 40 0v17" fill="none" stroke="#b68a45" stroke-width="2"/><line x1="4" y1="35" x2="56" y2="35" stroke="#b68a45" stroke-width="1.5"/></svg><div class="mk-lux-serif">Timeless Living</div></div><div style="font-size:6.5px;letter-spacing:.14em;color:#8c6a32">PRIVATE TOURS AVAILABLE</div></div></div>`;
  }

  async function mount(el, clientRow, done) {
    root = el; client = clientRow; onComplete = done; step = 1; catFilter = 'all'; picks = {}; brief = freshBrief(); saving = false;
    root.innerHTML = '<div class="card pad stack"><strong>Preparing your project setup…</strong><p class="sub sm">Loading the design references for your developer’s workspace.</p></div>';
    const { data, error } = await sb.from('style_cards').select('id,title,description,palette').eq('workspace_id', client.workspace_id);
    if (error) {
      root.innerHTML = '<div class="card pad stack"><h2>Project setup could not load</h2><p class="sub sm">The onboarding database migration may not have been applied yet. Ask your developer to run <span class="mono">migrations_client_onboarding.sql</span> in Supabase.</p><p class="xs muted">' + esc(error.message) + '</p></div>';
      return;
    }
    styleCards = STYLES.map(s => {
      const row = (data || []).find(x => x.title === s.title);
      return { ...s, dbId: row ? row.id : null };
    });
    render();
  }

  function render() {
    if (!root) return;
    const headings = ['1. Project type', '2. Design direction', '3. Colors', '4. Features & timing'];
    let body = '';
    if (step === 1) {
      body = `<section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">01 · WEBSITE TYPE</span><h2>What kind of website are you looking for?</h2><p class="xs sub" style="margin-top:3px">Choose the closest match. Your developer can refine the scope with you later.</p></div></div><div class="wiz-type-grid">${TYPES.map(t => `<button type="button" class="wiz-type-card" data-pt="${t.id}" aria-pressed="${brief.project_type === t.id}"><strong>${t.label}</strong><span class="xs sub">${t.desc}</span></button>`).join('')}</div><label>What is the main goal of this website?<select id="wgoal"><option value="">Choose the main goal</option>${['Get more customers or enquiries','Showcase my work or portfolio','Sell products online','Share information or resources','Build trust and credibility','Something else'].map(v => `<option${brief.goal === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label></section>`;
    } else if (step === 2) {
      const cats = ['all', ...new Set(STYLES.map(s => s.cat))];
      const vis = styleCards.filter(s => catFilter === 'all' || s.cat === catFilter);
      body = `<section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">02 · VISUAL GALLERY (12 STYLES)</span><h2>Which website styles appeal to you?</h2><p class="xs sub" style="margin-top:3px">Select as many as you like. Tap Details to see a larger preview and leave a note.</p></div><span class="badge on">${Object.keys(picks).length} selected</span></div>${styleCards.some(s => !s.dbId) ? '<p class="xs" style="color:var(--warn)">Some gallery styles are not available yet. Your developer may need to apply the onboarding migration.</p>' : ''}<div class="filter-bar">${cats.map(c => `<button type="button" class="fpill" data-cf="${esc(c)}" aria-pressed="${catFilter === c}">${c === 'all' ? 'All styles' : esc(c)}</button>`).join('')}</div><div class="slib-grid">${vis.map(s => { const p = s.dbId && picks[s.dbId]; return `<article class="slib-card${p && p.kind !== 'dislike' ? ' sel' : ''}"><div class="slib-thumb-wrap" data-insp="${s.id}"><span class="slib-tag-float">${esc(s.cat)}</span><div class="slib-thumb">${mockHtml(s)}</div></div><div class="slib-meta"><div class="between"><strong>${esc(s.title)}</strong><div class="sw-mini">${s.palette.map(h => `<i style="background:${h}"></i>`).join('')}</div></div><p class="slib-desc">${esc(s.description)}</p><div class="between" style="gap:8px"><div class="pick"><button type="button" class="btn sm" data-pk="${s.id}" data-kind="favorite" aria-pressed="${!!p && p.kind === 'favorite'}">★ Love it</button><button type="button" class="btn sm" data-pk="${s.id}" data-kind="like" aria-pressed="${!!p && p.kind === 'like'}">Like</button></div><button type="button" class="btn ghost sm" data-insp="${s.id}">Details</button></div></div></article>`; }).join('')}</div></section>`;
    } else if (step === 3) {
      body = `<section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">03 · COLOR PALETTE</span><h2>Pick a color direction</h2><p class="xs sub" style="margin-top:3px">This is a starting point, not a final design decision.</p></div></div><div class="pal-grid">${PALETTES.map(p => `<button type="button" class="pal-card" data-pal="${p.id}" aria-pressed="${brief.palette_name === p.name}"><div class="sw big">${p.colors.map(h => `<i style="background:${h}"></i>`).join('')}</div><div class="between"><strong class="sm">${p.name}</strong><span class="xs muted">${p.vibe}</span></div></button>`).join('')}</div></section>`;
    } else {
      const suggested = FEATS[brief.project_type] || FEATS.landing_page;
      const merged = [...new Set([...suggested, ...brief.pages])];
      body = `<section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">04 · SECTIONS & FEATURES</span><h2>What should we include?</h2><p class="xs sub" style="margin-top:3px">Choose the sections you think you need. You can add more later.</p></div><span class="badge on">${brief.pages.length} selected</span></div><div class="feat-grid">${merged.map(f => `<button type="button" class="feat-tile" data-feat="${esc(f)}" aria-pressed="${brief.pages.includes(f)}"><span class="feat-chk">✓</span><span class="sm" style="font-weight:500">${esc(f)}</span></button>`).join('')}</div><form class="add-bar" id="addf"><input name="cf" maxlength="200" placeholder="Add a custom feature (e.g. Booking calendar)"><button class="btn" type="submit">+ Add</button></form></section><section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">05 · TIMING</span><h2>When would you like to launch?</h2></div></div><div class="tl-grid">${TIMELINES.map(x => `<button type="button" class="tl-card" data-tl="${x.t}" aria-pressed="${brief.timeline === x.t}"><strong class="sm">${x.t}</strong><span class="xs muted">${x.sub}</span></button>`).join('')}</div></section><section class="wiz-sec"><div class="wiz-sec-head"><div><span class="sec-num">06 · PROJECT NOTES (OPTIONAL)</span><h2>Tell us about your business or idea</h2><p class="xs sub" style="margin-top:3px">Share any context, audience, references, or details your developer should know.</p></div></div><textarea id="wex" maxlength="3000" rows="5" placeholder="A little about the business, who the website is for, and what you want visitors to do…">${esc(brief.extra_notes)}</textarea><span class="xs muted">${brief.extra_notes.length}/3000</span></section>`;
    }

    root.innerHTML = `<div class="wiz-wrap"><div><span class="badge on" style="margin-bottom:7px">New client setup</span><h1>Let’s plan your website</h1><p class="sub sm" style="margin-top:4px">Four short steps. Your answers will be shared with your developer.</p></div><div class="wiz-steps">${headings.map((h, i) => `<button type="button" class="wiz-step" data-st="${i + 1}" aria-current="${step === i + 1 ? 'step' : 'false'}" data-done="${step > i + 1}"><span>${h}</span>${step > i + 1 ? '<span>✓</span>' : ''}</button>`).join('')}</div><div class="card wiz-shell">${body}</div><div class="between"><button type="button" class="btn" id="wp"${step === 1 || saving ? ' disabled' : ''}>← Back</button><span class="xs muted mono">Step ${step} of 4</span>${step < 4 ? '<button type="button" class="btn primary lg" id="wn">Continue →</button>' : `<button type="button" class="btn primary lg" id="wf"${saving ? ' disabled' : ''}>${saving ? 'Saving…' : 'Submit project brief'}</button>`}</div></div>`;
    bind();
  }

  function bind() {
    root.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
      const n = Number(b.dataset.st);
      if (n > step) return;
      step = n; render();
    });
    root.querySelector('#wp').onclick = () => { if (step > 1 && !saving) { step--; render(); } };
    const next = root.querySelector('#wn');
    if (next) next.onclick = () => {
      if (step === 1 && (!brief.project_type || !brief.goal)) return toast('Choose a website type and its main goal first.');
      if (step === 3 && !brief.palette_name) return toast('Choose a color direction first.');
      step++; render();
    };
    root.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => {
      if (brief.project_type !== b.dataset.pt) brief.pages = [];
      brief.project_type = b.dataset.pt; render();
    });
    const goal = root.querySelector('#wgoal'); if (goal) goal.onchange = e => { brief.goal = e.target.value; };
    root.querySelectorAll('[data-cf]').forEach(b => b.onclick = () => { catFilter = b.dataset.cf; render(); });
    root.querySelectorAll('[data-pk]').forEach(b => b.onclick = () => {
      const style = STYLES.find(s => s.id === b.dataset.pk);
      const card = style && styleCards.find(s => s.title === style.title);
      if (!card || !card.dbId) return toast('This style is not set up in the workspace yet.');
      const current = picks[card.dbId];
      const kind = b.dataset.kind;
      if (current && current.kind === kind) delete picks[card.dbId];
      else picks[card.dbId] = { kind, note: current ? current.note : '' };
      render();
    });
    root.querySelectorAll('[data-insp]').forEach(el => el.onclick = e => {
      if (e.target.closest('[data-pk]')) return;
      const style = STYLES.find(s => s.id === el.dataset.insp);
      if (style) inspectModal(style);
    });
    root.querySelectorAll('[data-pal]').forEach(b => b.onclick = () => {
      const p = PALETTES.find(x => x.id === b.dataset.pal);
      brief.palette_name = p.name; brief.palette_colors = [...p.colors]; render();
    });
    root.querySelectorAll('[data-feat]').forEach(b => b.onclick = () => {
      const f = b.dataset.feat;
      brief.pages = brief.pages.includes(f) ? brief.pages.filter(x => x !== f) : [...brief.pages, f];
      render();
    });
    const add = root.querySelector('#addf');
    if (add) add.onsubmit = e => {
      e.preventDefault(); const v = e.target.cf.value.trim();
      if (!v) return;
      if (v.length > 200) return toast('Keep each feature under 200 characters.');
      if (!brief.pages.includes(v)) brief.pages.push(v);
      render();
    };
    root.querySelectorAll('[data-tl]').forEach(b => b.onclick = () => { brief.timeline = b.dataset.tl; render(); });
    const notes = root.querySelector('#wex'); if (notes) notes.oninput = e => { brief.extra_notes = e.target.value; const counter = notes.parentElement.querySelector('.xs.muted'); if (counter) counter.textContent = brief.extra_notes.length + '/3000'; };
    const finish = root.querySelector('#wf'); if (finish) finish.onclick = save;
  }

  function inspectModal(s) {
    const card = styleCards.find(x => x.title === s.title);
    if (!card || !card.dbId) return toast('This style is not set up in the workspace yet.');
    const d = document.createElement('dialog'); d.className = 'modal';
    let current = picks[card.dbId] ? { ...picks[card.dbId] } : { kind: null, note: '' };
    d.innerHTML = `<div class="stack"><div class="between"><div><h2>${esc(s.title)}</h2><p class="xs muted mono">${esc(s.fonts)} · ${esc(s.cat)}</p></div><button type="button" class="btn ghost sm" data-x aria-label="Close">&times;</button></div><div class="slib-thumb big">${mockHtml(s)}</div><p class="sm sub">${esc(s.description)}</p><div class="row" style="flex-wrap:wrap">${s.palette.map(h => `<span class="hex-chip"><i style="background:${h}"></i><span class="mono xs">${h}</span></span>`).join('')}</div><div class="stack-sm" style="border-top:1px solid var(--line);padding-top:12px"><div class="between"><span class="sm">Your reaction</span><div class="pick">${['favorite','like','dislike'].map(k => `<button type="button" class="btn sm" data-pk="${k}" aria-pressed="${current.kind === k}">${k === 'favorite' ? '★ Love it' : k}</button>`).join('')}</div></div><label>What do you like or dislike about this one? (optional)<input id="inote" maxlength="600" placeholder="e.g. Love the clean cards and dark colors" value="${esc(current.note || '')}"></label></div><div class="row" style="justify-content:flex-end"><button type="button" class="btn" data-x>Cancel</button><button type="button" class="btn primary" id="isave">Save choice</button></div></div>`;
    document.body.appendChild(d);
    d.onclick = e => {
      if (e.target === d || e.target.closest('[data-x]')) return d.close();
      const p = e.target.closest('[data-pk]');
      if (p) {
        current.kind = current.kind === p.dataset.pk ? null : p.dataset.pk;
        d.querySelectorAll('[data-pk]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pk === current.kind)));
      }
    };
    d.querySelector('#isave').onclick = () => {
      const note = d.querySelector('#inote').value.trim();
      if (current.kind) picks[card.dbId] = { kind: current.kind, note };
      else delete picks[card.dbId];
      d.close(); render();
    };
    d.onclose = () => d.remove(); d.showModal();
  }

  async function save() {
    if (saving) return;
    if (!brief.project_type || !brief.goal) { step = 1; render(); return toast('Complete the project type and main goal first.'); }
    if (!brief.palette_name || !brief.palette_colors.length) { step = 3; render(); return toast('Choose a color direction first.'); }
    const payloadPicks = Object.entries(picks).map(([styleId, p]) => ({ style_card_id: styleId, kind: p.kind, note: p.note || null }));
    saving = true; render();
    const { error } = await sb.rpc('save_client_onboarding', {
      p_client_id: client.id,
      p_project_type: brief.project_type,
      p_goal: brief.goal,
      p_palette_name: brief.palette_name,
      p_palette_colors: brief.palette_colors,
      p_timeline: brief.timeline || null,
      p_extra_notes: brief.extra_notes,
      p_requirements: brief.pages,
      p_style_picks: payloadPicks
    });
    if (error) {
      saving = false; render();
      if ((error.message || '').includes('save_client_onboarding')) toast('The onboarding database migration has not been applied yet.');
      else toast('Could not save your project brief: ' + error.message);
      return;
    }
    toast('Project brief submitted. Your developer can now review it.');
    const callback = onComplete;
    root = null; client = null; onComplete = null;
    if (callback) await callback();
  }

  return { mount };
})();
