// يحوّل بيانات المشروع إلى HTML جاهز للطباعة (يُستخدم في المعاينة وتصدير PDF)
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const sanitizeHtml = require('sanitize-html');

const BRAND = process.env.BRAND_NAME || 'إنجاز';

const THEMES = {
  mint: { name: 'نعناعي', frame: '#7fb5ad', frame2: '#e8a173', panel: '#dcece8', accent: '#6c9f98', accent2: '#c98a5e', sand: '#e2cdb3', ink: '#3b3a36' },
  rose: { name: 'وردي', frame: '#d7a3ab', frame2: '#9bb4c9', panel: '#f7e9e9', accent: '#b9737f', accent2: '#7d97b0', sand: '#ecd5cf', ink: '#3d3436' },
  navy: { name: 'كحلي', frame: '#34507a', frame2: '#c9a24a', panel: '#eaeef5', accent: '#2f4a73', accent2: '#b38d3a', sand: '#dfe4ee', ink: '#252b36' },
  sand: { name: 'رملي', frame: '#b49a78', frame2: '#6f9a8d', panel: '#f5eee3', accent: '#8b6f4e', accent2: '#5f8c7f', sand: '#e6d8c2', ink: '#3a332b' },
  lavender: { name: 'بنفسجي', frame: '#9d8cc4', frame2: '#e7b07a', panel: '#efecf6', accent: '#7c6aa8', accent2: '#c78b4f', sand: '#ddd6ec', ink: '#34303f' },
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

const RICH_OPTS = {
  allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'h3', 'h4', 'span', 'div', 'mark'],
  allowedAttributes: { '*': ['style'] },
  allowedStyles: { '*': { 'text-align': [/^(right|left|center|justify)$/], color: [/^#[0-9a-f]{3,6}$/i, /^rgb\([\d,\s]+\)$/] } },
};
const cleanRich = (html) => sanitizeHtml(html || '', RICH_OPTS);

const safeUrl = (u) => {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[\w.-]+\.[a-z]{2,}/i.test(s)) return 'https://' + s;
  return '';
};

// ---------- الخطوط ----------
const FONT_DIR = path.join(__dirname, '..', 'node_modules', '@fontsource');
const FONTS = [
  ['Tajawal', 400, 'tajawal/files/tajawal-arabic-400-normal.woff2'],
  ['Tajawal', 500, 'tajawal/files/tajawal-arabic-500-normal.woff2'],
  ['Tajawal', 700, 'tajawal/files/tajawal-arabic-700-normal.woff2'],
  ['Tajawal', 800, 'tajawal/files/tajawal-arabic-800-normal.woff2'],
  ['Amiri', 400, 'amiri/files/amiri-arabic-400-normal.woff2'],
  ['Amiri', 700, 'amiri/files/amiri-arabic-700-normal.woff2'],
];
let embeddedFontCss = null;
function fontCss(embed) {
  if (embed) {
    if (!embeddedFontCss) {
      embeddedFontCss = FONTS.map(([f, w, file]) => {
        const b64 = fs.readFileSync(path.join(FONT_DIR, file)).toString('base64');
        return `@font-face{font-family:'${f}';font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
      }).join('\n');
    }
    return embeddedFontCss;
  }
  return FONTS.map(([f, w, file]) => `@font-face{font-family:'${f}';font-weight:${w};src:url(/fonts/${file}) format('woff2');}`).join('\n');
}

// ---------- الكتل ----------
const fieldsMap = (page) => {
  const f = page.blocks.find((b) => b.type === 'fields');
  const m = {};
  (f?.items || []).forEach((i) => { m[i.label] = i.value; });
  return m;
};

async function renderBlock(b, ctx, wide) {
  const head = b.heading ? `<div class="bh">${esc(b.heading)}</div>` : '';
  switch (b.type) {
    case 'text': {
      return `<div class="blk">${head}<div class="rich">${cleanRich(b.html)}</div></div>`;
    }
    case 'fields':
      return `<div class="blk">${head}<div class="fields">${(b.items || []).map((i) =>
        `<div class="fr"><span class="fl">${esc(i.label)}:</span><span class="fv">${nl2br(i.value)}</span></div>`).join('')}</div></div>`;
    case 'table': {
      const cols = b.columns || [];
      return `<div class="blk">${head}<table class="tbl"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
        (b.rows || []).map((r) => `<tr>${cols.map((_, i) => `<td>${nl2br(r[i])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    case 'images': {
      const items = b.items || [];
      const shapes = ['s1', 's2', 's3', 's4', 's5', 's6'];
      const tints = ['t1', 't2', 't3'];
      const one = (it, k) => {
        const src = it.uploadId ? ctx.imageUrl(it.uploadId) : '';
        // الضغط على الصورة يفتحها كاملة (في المعاينة وفي ملف PDF)
        const inner = src ? `<a href="${esc(ctx.imageLink(it.uploadId))}" target="_blank" rel="noopener"><img src="${esc(src)}" alt=""></a>` : '';
        return `<figure class="img ${shapes[k % 6]} ${src ? 'has' : tints[k % 3]}">${inner ? `<div class="ib">${inner}</div>` : '<div class="ib"></div>'}${it.caption ? `<figcaption>${esc(it.caption)}</figcaption>` : ''}</figure>`;
      };
      if (wide && items.length > 1) {
        const half = Math.ceil(items.length / 2);
        const g = (arr, off) => `<div class="imgs n${Math.min(arr.length, 4)}">${arr.map((it, k) => one(it, k + off)).join('')}</div>`;
        return `<div class="blk wide2">${head ? `<div class="span2">${head}</div>` : ''}${g(items.slice(0, half), 0)}${g(items.slice(half), half)}</div>`;
      }
      return `<div class="blk">${head}<div class="imgs n${Math.min(items.length, 4)}${items.length > 4 ? ' many' : ''}">${items.map(one).join('')}</div></div>`;
    }
    case 'links': {
      const rows = await Promise.all((b.items || []).map(async (it) => {
        const count = (it.files || []).length;
        const url = count && it.bundleId ? ctx.bundleUrl(it.bundleId) : it.fileId ? ctx.fileUrl(it.fileId) : safeUrl(it.url);
        const qr = url ? await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: ctx.theme.ink, light: '#0000' } }) : '';
        const label = esc(it.title) + (count > 1 ? ` <small class="cnt">${count} ملفات</small>` : '');
        const pill = url ? `<a class="pill" href="${esc(url)}">${label}</a>` : `<span class="pill">${label}</span>`;
        return `<div class="lk">${pill}${qr ? `<a class="qr" href="${esc(url)}">${qr}</a>` : ''}</div>`;
      }));
      return `<div class="blk">${head}<div class="links">${rows.join('')}</div></div>`;
    }
    case 'quote':
      if (!b.text) return '';
      return `<div class="blk"><blockquote class="quote"><p>${nl2br(b.text)}</p>${b.author ? `<cite>— ${esc(b.author)}</cite>` : ''}</blockquote></div>`;
    default:
      return '';
  }
}

const isWide = (b) => b.type === 'images' && (b.items || []).length > 1;

async function renderSectionBody(page, ctx, full) {
  const parts = [];
  for (const b of page.blocks) {
    const wide = full && isWide(b);
    const html = await renderBlock(b, ctx, wide);
    if (html) parts.push(wide ? html.replace('class="blk', 'class="blk span2') : html);
  }
  return parts.join('');
}

const titleHtml = (page) => `<h2 class="ptitle"><span>${esc(page.title)}</span></h2>`;

async function renderPanel(page, ctx, full) {
  if (!page) return '<section class="panel empty"></section>';
  if (page.type === 'toc') return renderToc(page, ctx, full);
  if (page.type === 'opening') return renderOpening(page, ctx, full);
  const body = await renderSectionBody(page, ctx, full);
  return `<section class="panel${full ? ' full' : ''}" id="p-${esc(page.id)}">${titleHtml(page)}<div class="content${full ? ' grid2' : ''}">${body}</div></section>`;
}

function renderToc(page, ctx, full) {
  const items = ctx.tocEntries;
  const pill = (e, i) => `<a class="tpill ${i % 2 ? 'alt' : ''}" href="#p-${esc(e.id)}"><span>${esc(e.title)}</span><b>${e.num}</b></a>`;
  let body;
  if (full) {
    const half = Math.ceil(items.length / 2);
    body = `<div class="toc">${items.slice(0, half).map(pill).join('')}</div><div class="toc">${items.slice(half).map((e, i) => pill(e, i + half)).join('')}</div>`;
  } else {
    body = `<div class="toc span2">${items.map(pill).join('')}</div>`;
  }
  return `<section class="panel${full ? ' full' : ''}" id="p-${esc(page.id)}">${titleHtml(page)}<div class="content grid2 tocgrid">${body}</div></section>`;
}

function renderOpening(page, ctx, full) {
  // صفحة البسملة فقط (بدون اسم المعلم أو عنوان الملف)
  const f = fieldsMap(page);
  const basmala = `<div class="op-basmala"><div class="bsm">بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</div>${f['الآية'] ? `<div class="aya">${esc(f['الآية'])}</div>` : ''}</div>`;
  return `<section class="panel opening${full ? ' full' : ''}" id="p-${esc(page.id)}"><div class="content opgrid">${basmala}</div></section>`;
}

function renderCover(page) {
  const f = fieldsMap(page);
  const meta = [['المدرسة', f['المدرسة']], ['إدارة التعليم', f['إدارة التعليم']], ['العام الدراسي', f['العام الدراسي']]]
    .filter(([, v]) => v).map(([k, v]) => `<div><span>${esc(k)}</span>${esc(v)}</div>`).join('');
  return `<div class="cover-card"><div class="cv-t">${esc(f['العنوان'] || 'ملف إنجاز')}</div>${f['الاسم'] ? `<div class="cv-n">${esc(f['الاسم'])}</div>` : ''}<div class="cv-m">${meta}</div></div>`;
}

// خلفية الغلاف: خطوط متقاطعة مرسومة كمتجهات (بدون تكرار تدرجات لتفادي خطوط الطباعة)
function coverPattern(t, W, H) {
  const r = [];
  for (let x = 12; x < W; x += 34) {
    r.push(`<rect x="${x}" y="0" width="7" height="${H}" fill="#fff" opacity=".2"/>`);
    r.push(`<rect x="${x + 17}" y="0" width="2" height="${H}" fill="#fff" opacity=".25"/>`);
  }
  for (let y = 10; y < H; y += 34) {
    r.push(`<rect x="0" y="${y}" width="${W}" height="7" fill="#fff" opacity=".2"/>`);
    r.push(`<rect x="0" y="${y + 17}" width="${W}" height="2" fill="#fff" opacity=".25"/>`);
  }
  for (let x = 30; x < W; x += 68) r.push(`<rect x="${x}" y="0" width="9" height="${H}" fill="${t.frame2}" opacity=".55"/>`);
  for (let y = 40; y < H; y += 68) r.push(`<rect x="0" y="${y}" width="${W}" height="7" fill="${t.frame2}" opacity=".45"/>`);
  return `<svg class="cv-bg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${t.frame}"/>${r.join('')}</svg>`;
}

// ---------- تجميع الصفحات في أوراق ----------
// الصفحة النصية لا تمتد على صفحتي الدفتر أبدًا حتى لا ينقسم النص بينهما؛
// الامتداد فقط للصفحات التي فيها صور أو جداول أو أكثر من نوع محتوى
const TEXTUAL = new Set(['text', 'quote', 'fields']);
const spansSpread = (p) => p.type === 'opening' || p.type === 'toc'
  || (p.width === 'full' && !(p.blocks.length && p.blocks.every((b) => TEXTUAL.has(b.type))));

function buildSheets(pages, layout) {
  const sheets = [];
  if (layout === 'single') {
    pages.forEach((p) => sheets.push({ kind: p.type === 'cover' || p.type === 'backcover' ? p.type : 'one', pages: [p] }));
    return sheets;
  }
  let pending = null;
  const flush = () => { if (pending) { sheets.push({ kind: 'pair', pages: [pending, null] }); pending = null; } };
  for (const p of pages) {
    if (p.type === 'cover' || p.type === 'backcover') { flush(); sheets.push({ kind: p.type, pages: [p] }); continue; }
    if (spansSpread(p)) { flush(); sheets.push({ kind: 'full', pages: [p] }); continue; }
    if (pending) { sheets.push({ kind: 'pair', pages: [pending, p] }); pending = null; } else pending = p;
  }
  flush();
  return sheets;
}

async function renderProject(project, opts = {}) {
  const data = project.data;
  const layout = data.settings?.layout === 'single' ? 'single' : 'spread';
  const theme = THEMES[data.settings?.theme] || THEMES.mint;
  const pages = data.pages || [];
  const sheets = buildSheets(pages, layout);

  // أرقام الصفحات للفهرس
  const numOf = {};
  sheets.forEach((s, i) => s.pages.forEach((p) => { if (p) numOf[p.id] = i + 1; }));
  const tocEntries = pages.filter((p) => p.type === 'section' && !p.hideInToc).map((p) => ({ id: p.id, title: p.title, num: numOf[p.id] }));

  const cover = pages.find((p) => p.type === 'cover');
  const teacher = cover ? fieldsMap(cover)['الاسم'] : '';
  const baseUrl = String(opts.baseUrl || '').replace(/\/+$/, '');
  const ctx = {
    theme, tocEntries,
    imageUrl: opts.imageUrl || ((id) => `/api/uploads/${id}`),
    imageLink: opts.imageLink || ((id) => `${baseUrl}/i/${id}`),
    fileUrl: (id) => `${baseUrl}/f/${id}`,
    bundleUrl: (id) => `${baseUrl}/b/${id}`,
  };

  const pattern = layout === 'single' ? coverPattern(theme, 210, 297) : coverPattern(theme, 297, 210);
  const out = [];
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    const foot = `<div class="foot"><span>${esc(teacher || '')}</span><span>${i + 1}</span></div>`;
    if (s.kind === 'cover') out.push(`<div class="sheet cover">${pattern}${renderCover(s.pages[0])}</div>`);
    else if (s.kind === 'backcover') out.push(`<div class="sheet cover back">${pattern}<div class="back-mark">${esc(BRAND)}</div></div>`);
    else if (s.kind === 'one') out.push(`<div class="sheet one">${await renderPanel(s.pages[0], ctx, false)}${foot}</div>`);
    else if (s.kind === 'full') {
      // صفحة البسملة بلا حلقات في المنتصف حتى لا تقطع النص
      const rings = s.pages[0].type === 'opening' ? '' : '<div class="rings"></div>';
      out.push(`<div class="sheet spread">${await renderPanel(s.pages[0], ctx, true)}${rings}${foot}</div>`);
    }
    else out.push(`<div class="sheet spread">${await renderPanel(s.pages[0], ctx, false)}${await renderPanel(s.pages[1], ctx, false)}<div class="rings"></div>${foot}</div>`);
  }

  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(project.title)}</title><style>${fontCss(opts.embedFonts)}\n${css(theme, layout)}</style></head>
<body class="${opts.screen ? 'screen' : ''}">${opts.watermark ? WATERMARK : ''}${out.join('\n')}<script>${FIT_SCRIPT}</script></body></html>`;
}

// معاينة غير المشترك: علامة مائية على كل الصفحات ومنع الطباعة/الحفظ من المتصفح
const WATERMARK = `<style>
.sheet::after{content:'نسخة معاينة · اشترك لتنزيل الملف';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  font:800 13mm 'Tajawal',sans-serif;color:rgba(0,0,0,.09);transform:rotate(-24deg);pointer-events:none;z-index:20;white-space:nowrap}
@media print{body>*{display:none!important}body::before{content:'تنزيل الملف متاح للمشتركين — اشترك من حسابك في المنصة';display:block;padding:40mm 10mm;text-align:center;font:700 7mm 'Tajawal',sans-serif}}
</style>`;

// تصغير الخط تلقائيًا إذا تجاوز المحتوى مساحة الصفحة
const FIT_SCRIPT = `
(function(){
  function fit(){
    document.querySelectorAll('.content').forEach(function(el){
      var s=1; el.style.fontSize='';
      el.style.removeProperty('--fit');
      while((el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1)&&s>0.5){s-=0.04;el.style.fontSize=s+'em';el.style.setProperty('--fit',s);}
    });
    document.body.setAttribute('data-fitted','1');
  }
  if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){
    var imgs=[].slice.call(document.images).filter(function(i){return !i.complete});
    if(!imgs.length)return fit();
    var n=imgs.length;imgs.forEach(function(i){i.onload=i.onerror=function(){if(--n===0)fit();};});
  });}else{window.addEventListener('load',fit);}
})();`;

function css(t, layout) {
  const W = layout === 'single' ? 210 : 297;
  const H = layout === 'single' ? 297 : 210;
  return `
@page{size:${W}mm ${H}mm;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Tajawal',sans-serif;color:${t.ink};font-size:4.2mm;line-height:1.65;text-align:right;direction:rtl}
body.screen{background:#8a8f94;padding:8mm 0}
body.screen .sheet{margin:0 auto 8mm;box-shadow:0 4px 24px rgba(0,0,0,.35)}
.sheet{width:${W}mm;height:${H}mm;position:relative;overflow:hidden;page-break-after:always;break-after:page;
  background:${t.frame};
  background-image:
    repeating-linear-gradient(45deg,rgba(255,255,255,.13) 0 3mm,transparent 3mm 9mm),
    repeating-linear-gradient(-45deg,rgba(255,255,255,.09) 0 2mm,transparent 2mm 12mm);
  display:flex;gap:${layout === 'single' ? 0 : 14}mm;padding:9mm 10mm 11mm}
.sheet:last-child{page-break-after:auto;break-after:auto}
.sheet.one{padding:10mm}
.panel{flex:1;min-width:0;background:${t.panel};border-radius:4mm;box-shadow:0 1.2mm 3mm rgba(0,0,0,.18);padding:7mm 7mm 6mm;display:flex;flex-direction:column;position:relative;
  background-image:radial-gradient(circle at 100% 0,rgba(255,255,255,.55),transparent 45%)}
.panel.empty{background:${t.panel};opacity:.92}
.rings{position:absolute;top:13mm;bottom:15mm;left:50%;width:16mm;margin-left:-8mm;
  background:repeating-linear-gradient(180deg,transparent 0 9mm,${t.sand} 9mm 10.4mm,#fff 10.4mm 11mm,${t.sand} 11mm 12.6mm,transparent 12.6mm 21mm);
  border-radius:3mm;opacity:.95;filter:drop-shadow(0 .6mm .6mm rgba(0,0,0,.25))}
.rings::before{content:'';position:absolute;top:0;bottom:0;left:50%;width:1.6mm;margin-left:-.8mm;background:linear-gradient(90deg,#b9a68d,#efe4d2,#b9a68d);border-radius:1mm}
.foot{position:absolute;bottom:3.2mm;left:12mm;right:12mm;display:flex;justify-content:space-between;color:#fff;font-size:2.8mm;font-weight:500;text-shadow:0 .2mm .6mm rgba(0,0,0,.3)}

.ptitle{margin:0 0 4mm;display:flex;justify-content:center}
.sheet.spread .panel.full .ptitle{width:calc(50% - 11mm)}
.ptitle span{background:${t.accent};color:#fff;font-weight:800;font-size:5.6mm;padding:1.6mm 9mm 1.2mm;border-radius:10mm 2mm 10mm 2mm;box-shadow:1mm 1mm 0 ${t.sand}}
.content{flex:1;min-height:0;overflow:hidden}
.grid2{display:grid;grid-template-columns:1fr 1fr;column-gap:22mm;row-gap:4mm;align-content:start}
.panel:not(.full) .grid2{column-gap:5mm}
.span2,.wide2{grid-column:1 / -1}
.wide2{display:grid;grid-template-columns:1fr 1fr;column-gap:22mm;row-gap:2mm}
.blk{margin-bottom:3.2mm;break-inside:avoid}
.grid2>.blk{margin-bottom:0}
.bh{display:inline-block;background:${t.accent2};color:#fff;font-weight:700;font-size:3.7mm;padding:.6mm 4mm .3mm;border-radius:1.5mm;margin-bottom:2mm}

.rich{text-align:right}
.rich p{margin:0 0 2mm}
.rich ul,.rich ol{margin:0 0 2mm;padding-inline-start:5.5mm;list-style-position:outside}
.rich li{margin-bottom:.8mm}
.rich h3{font-size:4.2mm;color:${t.accent};margin:0 0 1.5mm}
.rich h4{font-size:3.8mm;color:${t.accent2};margin:0 0 1.2mm}
.rich mark{background:${t.sand};padding:0 1mm}

.fields{background:${t.sand};border-radius:45% 55% 50% 45% / 12% 14% 12% 14%;padding:5mm 7mm;box-shadow:inset 0 0 0 .5mm rgba(255,255,255,.6)}
.fr{display:flex;gap:2mm;padding:1.2mm 0;border-bottom:.3mm dashed rgba(0,0,0,.18)}
.fr:last-child{border-bottom:0}
.fl{font-weight:700;color:${t.accent};white-space:nowrap}
.fv{flex:1}

.tbl{width:100%;border-collapse:separate;border-spacing:.6mm;font-size:.9em}
.tbl th{background:${t.accent2};color:#fff;font-weight:700;padding:1.3mm 1.5mm;border-radius:1.2mm}
.tbl td{background:rgba(255,255,255,.75);padding:1.3mm 1.5mm;border-radius:1mm;text-align:center;vertical-align:middle}
.tbl td:first-child{background:${t.sand};font-weight:700}

.imgs{display:grid;gap:4mm;grid-template-columns:repeat(2,1fr)}
.imgs.n1{grid-template-columns:1fr}
.imgs.n3,.imgs.many{grid-template-columns:repeat(3,1fr)}
.wide2 .imgs.n3{grid-template-columns:repeat(2,1fr)}
.wide2 .imgs.n3 .img:last-child{grid-column:1 / -1;width:50%;margin:0 auto}
.img{margin:0;text-align:center}
.img .ib{width:100%;aspect-ratio:1.15;overflow:hidden;box-shadow:0 .8mm 2mm rgba(0,0,0,.12)}
.imgs.n1 .img .ib{aspect-ratio:1.6;border-radius:4mm!important}
.img img{width:100%;height:100%;object-fit:cover;display:block}
/* الصورة المرفوعة تظهر كاملة بدون قص؛ الأشكال الزخرفية للخانات الفارغة فقط */
/* صور المعرض تأخذ شكل الرسومات (قص زخرفي) والضغط يفتحها كاملة؛ الصورة المفردة تظهر كاملة */
.img .ib a{display:block;width:100%;height:100%}
.imgs.n1 .img.has .ib{aspect-ratio:auto;background:transparent;box-shadow:none;overflow:visible;border-radius:0!important}
.imgs.n1 .img.has img{width:auto;height:auto;max-width:100%;max-height:calc(var(--fit,1) * 125mm);margin:0 auto;border-radius:3mm;box-shadow:0 .8mm 2mm rgba(0,0,0,.1)}
.img.t1 .ib{background:${t.panel};background:color-mix(in srgb,${t.frame} 55%,#fff)}
.img.t2 .ib{background:color-mix(in srgb,${t.sand} 85%,#fff)}
.img.t3 .ib{background:color-mix(in srgb,${t.frame2} 45%,#fff)}
.s1 .ib{border-radius:58% 42% 52% 48% / 46% 56% 44% 54%}
.s2 .ib{border-radius:42% 58% 45% 55% / 55% 42% 58% 45%}
.s3 .ib{border-radius:50% 50% 38% 62% / 60% 44% 56% 40%}
.s4 .ib{border-radius:62% 38% 56% 44% / 42% 60% 40% 58%}
.s5 .ib{border-radius:45% 55% 60% 40% / 50% 45% 55% 50%}
.s6 .ib{border-radius:55% 45% 42% 58% / 58% 52% 48% 42%}
figcaption{font-size:.85em;margin-top:1.2mm;font-weight:500}

.links{display:flex;flex-direction:column;gap:2.6mm}
.lk{display:flex;align-items:center;gap:3mm}
.pill{flex:1;display:block;text-decoration:none;color:${t.ink};background:rgba(255,255,255,.8);border-inline-start:2.2mm solid ${t.accent2};border-radius:2mm 6mm 6mm 2mm;padding:2mm 4mm;font-weight:700;box-shadow:0 .6mm 1.5mm rgba(0,0,0,.08)}
.pill .cnt{font-size:.78em;font-weight:500;color:${t.accent2};margin-inline-start:1.5mm}
a.pill::after{content:' ⟵';color:${t.accent2}}
.qr{display:block;width:17mm;height:17mm;background:#fff;padding:1.2mm;border-radius:1.5mm;flex:none}
.qr svg{width:100%;height:100%;display:block}

.quote{margin:2mm 0 0;background:rgba(255,255,255,.7);border:.5mm solid ${t.accent};border-radius:3mm;padding:3.5mm 6mm;position:relative;text-align:center}
.quote::before,.quote::after{position:absolute;font-family:'Amiri',serif;font-size:12mm;line-height:1;color:${t.accent2}}
.quote::before{content:'“';top:-3mm;right:2mm}
.quote::after{content:'”';bottom:-7mm;left:2mm}
.quote p{margin:0;font-weight:500}
.quote cite{display:block;font-style:normal;font-size:.85em;margin-top:1mm;color:${t.accent}}

.tocgrid{column-gap:22mm}
.panel:not(.full) .tocgrid{display:block}
.toc{display:flex;flex-direction:column;gap:2.4mm}
.tpill{display:flex;justify-content:space-between;align-items:center;text-decoration:none;color:#fff;background:${t.accent};padding:1.8mm 6mm 1.4mm;border-radius:6mm;font-weight:700;box-shadow:0 .6mm 1.5mm rgba(0,0,0,.12)}
.tpill.alt{background:${t.accent2}}
.tpill b{background:rgba(255,255,255,.9);color:${t.ink};border-radius:3mm;min-width:7mm;text-align:center;font-size:.9em}

.opgrid{height:100%;display:flex;align-items:center;justify-content:center}
.op-basmala{text-align:center;font-family:'Amiri',serif;color:${t.accent}}
.bsm{font-size:16mm;font-weight:700;line-height:1.6}
.aya{font-size:12mm;margin-top:8mm;color:${t.ink};opacity:.7}
.sheet.one .bsm{font-size:13mm}

.sheet.cover{align-items:center;justify-content:center;background:${t.frame}}
.cv-bg{position:absolute;inset:0;width:100%;height:100%}
.cover-card,.back-mark{position:relative}
.cover-card{background:rgba(255,255,255,.93);border-radius:8mm;padding:14mm 22mm;text-align:center;min-width:55%;box-shadow:0 2mm 8mm rgba(0,0,0,.2);border:1.2mm solid ${t.sand}}
.cv-t{font-size:16mm;font-weight:800;color:${t.accent};line-height:1.3}
.cv-n{font-size:9mm;font-weight:700;color:${t.accent2};margin-top:2mm}
.cv-m{margin-top:7mm;display:flex;flex-direction:column;gap:1.5mm;font-size:4.4mm}
.cv-m span{color:${t.accent};font-weight:700;margin-inline-end:2mm}
.cv-m span::after{content:':'}
.back-mark{background:rgba(255,255,255,.9);padding:3mm 10mm;border-radius:6mm;font-weight:800;color:${t.accent};font-size:6mm}
`;
}

module.exports = { renderProject, THEMES, cleanRich, spansSpread };
