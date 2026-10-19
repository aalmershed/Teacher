// شهادات الشكر والتقدير: رسم الشهادة (A4 أفقي) بعدة تصاميم.
// الملف نفسه يعمل في المتصفح (معاينة فورية) وفي الخادم (تصدير PDF).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CertRender = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const W = 297, H = 210;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = (s) => esc(s).replace(/\r?\n/g, '<br>');

  // ---------- زخارف التصاميم (متجهات بسيطة سريعة في PDF) ----------
  const ring = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <ellipse rx="10" ry="5.6" fill="none" stroke="#3fb5c4" stroke-width="1.1"/>
    <ellipse rx="9" ry="4.6" cx="1.2" cy=".6" fill="none" stroke="#f0a04b" stroke-width="1.1"/></g>`;
  const tiles = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="-17" y="-6" width="12" height="12" rx="2.6" fill="#f3a04b" transform="rotate(-12 -11 0)"/>
    <path d="M-11 -3.4l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#fff"/>
    <rect x="5" y="-6" width="12" height="12" rx="2.6" fill="#3fb5c4" transform="rotate(12 11 0)"/>
    <path d="M11 4.2c-3-2-4.6-3.5-4.6-5.3 0-1.3 1-2.2 2.2-2.2.9 0 1.8.5 2.4 1.3.6-.8 1.5-1.3 2.4-1.3 1.2 0 2.2.9 2.2 2.2 0 1.8-1.6 3.3-4.6 5.3z" fill="#fff"/>
    <circle r="7.6" fill="#fff"/><circle r="6.6" fill="#4cb782"/>
    <path d="M-3 0l2.1 2.2 4-4.3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  const doodles = `<g fill="none" stroke="#c9c9c9" stroke-width=".35" opacity=".55">
    <path d="M70 70 L150 58 L120 92 Z"/><path d="M128 64 a6 6 0 0 1 4 6"/>
    <path d="M190 120 l14 -22 M204 98 l-4 1 M204 98 l0 4"/>
    <path d="M168 150 l14 -6 l16 6 l-14 6 z M168 150 v14 l16 6 v-14 M198 150 v14 l-14 6"/>
    <path d="M100 150 a14 14 0 0 1 28 0"/><path d="M228 70 h16 M236 62 v16"/></g>`;
  const star8 = (x, y, r, fill) => {
    const p = [];
    for (let i = 0; i < 16; i++) { const a = Math.PI * i / 8, rr = i % 2 ? r * .55 : r; p.push(`${(x + rr * Math.cos(a)).toFixed(2)},${(y + rr * Math.sin(a)).toFixed(2)}`); }
    return `<polygon points="${p.join(' ')}" fill="${fill}"/>`;
  };
  const rosette = (x, y, r, c1, c2) => `<g>
    <path d="M${x - 6} ${y + r - 2} l-5 16 l5 -3 l3 5 l4 -15 z M${x + 6} ${y + r - 2} l5 16 l-5 -3 l-3 5 l-4 -15 z" fill="${c2}"/>
    ${star8(x, y, r, c1)}<circle cx="${x}" cy="${y}" r="${r * .62}" fill="${c2}"/>
    <circle cx="${x}" cy="${y}" r="${r * .5}" fill="none" stroke="${c1}" stroke-width=".5"/>
    <path d="M${x} ${y - 4.2}l1.2 2.5 2.8.4-2 2 .5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-2 2.8-.4z" fill="${c1}"/></g>`;
  const cornerOrn = (x, y, sx, sy, c) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="${c}" stroke-width=".6">
    <path d="M0 22 V6 a6 6 0 0 1 6 -6 H22"/><path d="M4 22 V9 a5 5 0 0 1 5 -5 H22"/>
    <circle cx="8.5" cy="8.5" r="2.2" fill="${c}"/><path d="M14 4 q4 4 0 9 M4 14 q4 -4 9 0"/></g>`;

  const DESIGNS = {
    playful: {
      name: 'مرح', bg: '#ffffff', title: '#4b3a8f', name_c: '#2a9d8f', ink: '#3a3a3a', muted: '#5a5a5a', titleFont: 'Tajawal', nameFont: 'Tajawal',
      inset: [30, 30, 22, 30],
      svg: () => `<rect x="9" y="11" width="279" height="188" rx="16" fill="none" stroke="#c6c6c6" stroke-width=".8"/>
        <rect x="12" y="14" width="273" height="182" rx="13" fill="none" stroke="#dcdcdc" stroke-width=".4"/>
        ${doodles}
        <rect x="128" y="4" width="41" height="15" fill="#fff"/><rect x="132" y="191" width="33" height="13" fill="#fff"/>
        ${tiles(148.5, 11.5, .95)}${tiles(148.5, 197.5, .75)}
        ${ring(17, 19, -25)}${ring(280, 19, 25)}${ring(17, 191, 25)}${ring(280, 191, -25)}`,
    },
    classic: {
      name: 'كلاسيكي', bg: '#fbf7ee', title: '#1f3a5f', name_c: '#a67c2d', ink: '#2b2b2b', muted: '#4a4a4a', titleFont: 'Amiri', nameFont: 'Amiri',
      inset: [28, 34, 26, 34], seal: true,
      svg: () => `<rect x="7" y="7" width="283" height="196" fill="none" stroke="#1f3a5f" stroke-width="2.4"/>
        <rect x="11" y="11" width="275" height="188" fill="none" stroke="#b8923a" stroke-width=".7"/>
        <rect x="13" y="13" width="271" height="184" fill="none" stroke="#b8923a" stroke-width=".3"/>
        ${cornerOrn(15, 15, 1, 1, '#b8923a')}${cornerOrn(282, 15, -1, 1, '#b8923a')}${cornerOrn(15, 195, 1, -1, '#b8923a')}${cornerOrn(282, 195, -1, -1, '#b8923a')}
        <path d="M118 21 h22 M157 21 h22" stroke="#b8923a" stroke-width=".5"/>${star8(148.5, 21, 2.4, '#b8923a')}
        ${rosette(148.5, 169, 11, '#c9a24a', '#1f3a5f')}`,
    },
    gold: {
      name: 'فاخر', bg: '#10233f', title: '#e2bd63', name_c: '#ffffff', ink: '#efe7d3', muted: '#d8ccb0', titleFont: 'Amiri', nameFont: 'Amiri',
      inset: [28, 34, 26, 34], seal: true,
      svg: () => `<rect x="8" y="8" width="281" height="194" fill="none" stroke="#e2bd63" stroke-width="1.6"/>
        <rect x="12" y="12" width="273" height="186" fill="none" stroke="#e2bd63" stroke-width=".4"/>
        ${cornerOrn(16, 16, 1, 1, '#e2bd63')}${cornerOrn(281, 16, -1, 1, '#e2bd63')}${cornerOrn(16, 194, 1, -1, '#e2bd63')}${cornerOrn(281, 194, -1, -1, '#e2bd63')}
        <path d="M100 21 h40 M157 21 h40" stroke="#e2bd63" stroke-width=".5"/>${star8(148.5, 21, 2.6, '#e2bd63')}
        ${rosette(148.5, 169, 11, '#e2bd63', '#0b1a30')}`,
    },
    modern: {
      name: 'عصري', bg: '#ffffff', title: '#2f5e58', name_c: '#d38a5a', ink: '#33403e', muted: '#55625f', titleFont: 'Tajawal', nameFont: 'Tajawal', titleSize: 13,
      inset: [24, 84, 22, 26],
      svg: () => `<defs><linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f5e58"/><stop offset="1" stop-color="#5f978f"/></linearGradient></defs>
        <rect x="232" y="0" width="65" height="210" fill="url(#mg)"/>
        <rect x="226" y="0" width="3" height="210" fill="#d38a5a"/>
        <g fill="none" stroke="#fff" opacity=".22"><circle cx="290" cy="18" r="22" stroke-width="1"/><circle cx="290" cy="18" r="14" stroke-width=".6"/><circle cx="240" cy="196" r="28" stroke-width="1"/><circle cx="240" cy="196" r="18" stroke-width=".6"/></g>
        <g transform="translate(264.5 95)">
          <path d="M-9 8 l-6 30 l7 -5 l4 7 l5 -28 z M9 8 l6 30 l-7 -5 l-4 7 l-5 -28 z" fill="#d38a5a"/>
          <circle r="19" fill="#f3d9a4"/><circle r="15" fill="#e8b85c"/><circle r="12.5" fill="none" stroke="#fff" stroke-width=".7"/>
          <path d="M0 -8l2.4 5 5.5.8-4 3.9.9 5.4L0 4.6l-4.8 2.5.9-5.4-4-3.9 5.5-.8z" fill="#fff"/></g>
        <rect x="10" y="10" width="210" height="190" rx="4" fill="none" stroke="#e3ebe9" stroke-width=".6"/>`,
    },
    green: {
      name: 'أخضر', bg: '#ffffff', title: '#0b6b46', name_c: '#b8923a', ink: '#2d3a34', muted: '#4c5a53', titleFont: 'Tajawal', nameFont: 'Amiri',
      inset: [30, 30, 26, 30],
      svg: () => {
        let s = '';
        for (let x = 8; x < W; x += 16) { s += star8(x, 8, 4.2, 'rgba(255,255,255,.16)'); s += star8(x + 8, 203, 3.4, 'rgba(255,255,255,.16)'); }
        return `<rect width="${W}" height="16" fill="#0b6b46"/><rect y="16" width="${W}" height="1.4" fill="#c9a24a"/>
          <rect y="198" width="${W}" height="12" fill="#0b6b46"/><rect y="196.6" width="${W}" height="1.4" fill="#c9a24a"/>${s}
          <rect x="8" y="22" width="281" height="170" rx="3" fill="none" stroke="#0b6b46" stroke-width=".5" opacity=".5"/>`;
      },
    },
    pastel: {
      name: 'ناعم', bg: '#fffaf7', title: '#c25b7a', name_c: '#4f8f86', ink: '#4a3f44', muted: '#6b5d63', titleFont: 'Tajawal', nameFont: 'Tajawal',
      inset: [28, 34, 24, 34],
      svg: () => `<circle cx="10" cy="8" r="34" fill="#f8d9c4"/><circle cx="40" cy="-4" r="18" fill="#f6c9d4"/>
        <circle cx="292" cy="206" r="36" fill="#cfe8e2"/><circle cx="262" cy="214" r="18" fill="#f8d9c4"/>
        <circle cx="290" cy="6" r="16" fill="#f6c9d4"/><circle cx="6" cy="206" r="18" fill="#cfe8e2"/>
        <g fill="#e7a9b9"><circle cx="58" cy="22" r="1.4"/><circle cx="66" cy="14" r="1"/><circle cx="240" cy="190" r="1.4"/><circle cx="232" cy="198" r="1"/><circle cx="270" cy="30" r="1.2"/><circle cx="26" cy="180" r="1.2"/></g>
        <rect x="12" y="12" width="273" height="186" rx="12" fill="none" stroke="#e7b8a8" stroke-width=".8" stroke-dasharray="3 2"/>`,
    },
  };

  const DEFAULTS = {
    design: 'playful',
    title: 'شهادة شكر وتقدير',
    intro: 'تتقدم مدرسة ............',
    lead: 'بالشكر والتقدير للطالبة المتميزة',
    names: ['اسم الطالبة'],
    body: 'وذلك لما أظهرته من مستوى متميز وتفوّق ملحوظ،\nوتقديرًا لجهودها المتميزة خلال العام الدراسي،\nمع خالص الشكر والتقدير والثناء لها ولأسرتها الكريمة',
    sign1: { label: 'المعلمة', name: '' },
    sign2: { label: 'مديرة المدرسة', name: '' },
    date: '',
    logoRight: '', logoLeft: '',
  };

  const css = `@page{size:${W}mm ${H}mm;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Tajawal',sans-serif;direction:rtl}
body.screen{background:transparent}
.cert{width:${W}mm;height:${H}mm;position:relative;overflow:hidden;page-break-after:always;break-after:page}
.cert:last-child{page-break-after:auto;break-after:auto}
.deco{position:absolute;inset:0;width:100%;height:100%;display:block}
.in{position:absolute;display:flex;flex-direction:column;text-align:center}
.top{display:grid;grid-template-columns:38mm 1fr 38mm;align-items:center;gap:4mm;min-height:24mm}
.top.nologo{grid-template-columns:1fr}.top.nologo .logo{display:none}
.logo{display:flex;align-items:center;justify-content:center;height:26mm}
.logo img{max-width:38mm;max-height:26mm;object-fit:contain}
.ttl{font-weight:800;font-size:15mm;line-height:1.15}
.ttl.amiri{font-family:'Amiri',serif;font-weight:700;font-size:16.5mm}
.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;align-items:center;font-size:calc(6.3mm * var(--k,1));line-height:1.75;font-weight:500;overflow:hidden;padding:2mm 0}
.main p{margin:0}
.nm{font-weight:800;font-size:calc(11mm * var(--k,1));line-height:1.35;margin:1.2mm 0 1.8mm!important}
.nm.amiri{font-family:'Amiri',serif;font-weight:700;font-size:calc(12.5mm * var(--k,1))}
.body{margin-top:1.5mm!important}
.date{font-size:.8em;margin-top:2mm!important;opacity:.85}
.signs{display:grid;grid-template-columns:1fr 1fr;gap:20mm;padding:0 14mm;font-size:5.6mm;line-height:1.6}
.signs.seal{grid-template-columns:1fr 34mm 1fr;gap:6mm}
.sg b{display:block;font-weight:700}
.sg span{display:block;min-height:1.6em}
.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:800 12mm 'Tajawal',sans-serif;color:rgba(0,0,0,.09);transform:rotate(-20deg);pointer-events:none;white-space:nowrap;z-index:5}`;

  // تصغير النص تلقائيًا إذا كان طويلًا على مساحة الشهادة
  const FIT = `(function(){function f(){document.querySelectorAll('.main').forEach(function(m){var k=1;m.style.setProperty('--k',k);
while(m.scrollHeight>m.clientHeight+1&&k>.5){k-=.04;m.style.setProperty('--k',k);}});document.body.setAttribute('data-fitted','1');}
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(f);else window.addEventListener('load',f);})();`;

  function normalize(d) {
    const x = Object.assign({}, DEFAULTS, d || {});
    x.sign1 = Object.assign({}, DEFAULTS.sign1, x.sign1 || {});
    x.sign2 = Object.assign({}, DEFAULTS.sign2, x.sign2 || {});
    x.names = (Array.isArray(x.names) ? x.names : String(x.names || '').split('\n')).map((n) => String(n).trim()).filter(Boolean);
    if (!x.names.length) x.names = [''];
    if (!DESIGNS[x.design]) x.design = DEFAULTS.design;
    return x;
  }

  function page(d, name, opts) {
    const t = DESIGNS[d.design];
    const [it, ir, ib, il] = t.inset;
    const img = (id) => (id && opts.imageUrl ? `<img src="${esc(opts.imageUrl(id))}" alt="">` : '');
    const sign = (s) => (s.label || s.name ? `<div class="sg"><b style="color:${t.title}">${esc(s.label)}</b><span>${esc(s.name)}</span></div>` : '<div></div>');
    return `<section class="cert" style="background:${t.bg};color:${t.ink}">
  <svg class="deco" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${t.svg()}</svg>
  <div class="in" style="top:${it}mm;right:${ir}mm;bottom:${ib}mm;left:${il}mm">
    <div class="top ${d.logoRight || d.logoLeft ? '' : 'nologo'}"><div class="logo">${img(d.logoRight)}</div>
      <div class="ttl ${t.titleFont === 'Amiri' ? 'amiri' : ''}" style="color:${t.title}${t.titleSize ? `;font-size:${t.titleSize}mm` : ''}">${esc(d.title)}</div>
      <div class="logo">${img(d.logoLeft)}</div></div>
    <div class="main">
      ${d.intro ? `<p>${lines(d.intro)}</p>` : ''}
      ${d.lead ? `<p>${lines(d.lead)}</p>` : ''}
      ${name ? `<p class="nm ${t.nameFont === 'Amiri' ? 'amiri' : ''}" style="color:${t.name_c}">${esc(name)}</p>` : ''}
      ${d.body ? `<p class="body" style="color:${t.muted}">${lines(d.body)}</p>` : ''}
      ${d.date ? `<p class="date">${esc(d.date)}</p>` : ''}
    </div>
    <div class="signs ${t.seal ? 'seal' : ''}">${sign(d.sign1)}${t.seal ? '<div></div>' : ''}${sign(d.sign2)}</div>
  </div>
  ${opts.watermark ? '<div class="wm">نسخة معاينة · اشترك لتنزيل الشهادة</div>' : ''}
</section>`;
  }

  // opts: fontCss, imageUrl(id), watermark, index (رقم الاسم للمعاينة فقط), screen
  function render(data, opts) {
    opts = opts || {};
    const d = normalize(data);
    const names = opts.index != null ? [d.names[Math.min(opts.index, d.names.length - 1)]] : d.names;
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>${opts.fontCss || ''}\n${css}</style></head><body class="${opts.screen ? 'screen' : ''}">
${names.map((n) => page(d, n, opts)).join('\n')}<script>${FIT}</script></body></html>`;
  }

  const designs = Object.keys(DESIGNS).map((id) => ({ id, name: DESIGNS[id].name, colors: [DESIGNS[id].bg, DESIGNS[id].title, DESIGNS[id].name_c] }));
  return { render, normalize, DEFAULTS, designs, W, H };
}));
