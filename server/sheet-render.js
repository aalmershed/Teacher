// كشف متابعة الطلاب: جدول درجات قابل للطباعة (A4 أفقي) بأعمدة وتقسيمات قابلة للتعديل.
// الملف نفسه يعمل في المتصفح (معاينة فورية) وفي الخادم (تصدير PDF).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SheetRender = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const W = 297, H = 210;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, min, max, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  // صيغة "درجة" حسب العدد
  const deg = (n) => (n === 1 ? 'درجة' : n === 2 ? 'درجتان' : n >= 3 && n <= 10 ? `${n} درجات` : `${n} درجة`);
  const degLabel = (n) => (n <= 2 ? deg(n) : deg(n));

  const THEMES = {
    green: { name: 'أخضر', dark: '#1f4a4f', head: '#b6e0a8', cell: '#c9ebbd', zebra: '#ececec', band: '#9fbfa8', bandInk: '#1f4a4f', line: '#9aa59c' },
    blue: { name: 'أزرق', dark: '#1d3557', head: '#bcd4f0', cell: '#d3e3f6', zebra: '#eef1f5', band: '#a9c1de', bandInk: '#1d3557', line: '#9aa6b5' },
    teal: { name: 'فيروزي', dark: '#2f5e58', head: '#bfe1dc', cell: '#d4ece8', zebra: '#eef4f3', band: '#9ccbc3', bandInk: '#2f5e58', line: '#98aaa7' },
    purple: { name: 'بنفسجي', dark: '#3f2d6e', head: '#d9cdf1', cell: '#e6ddf7', zebra: '#f2eff8', band: '#c1b2e3', bandInk: '#3f2d6e', line: '#a9a2b8' },
    gray: { name: 'رمادي', dark: '#33393f', head: '#d6d9dc', cell: '#e4e6e8', zebra: '#f1f2f3', band: '#c3c7cb', bandInk: '#33393f', line: '#a2a7ac' },
  };

  // التوزيع الافتراضي (60 درجة)
  const DEFAULT_GROUPS = [
    { title: 'الواجبات', subs: [{ title: 'واجبات', max: 10, boxes: 6 }] },
    { title: 'المهام الأدائية', subs: [{ title: 'بحوث / مشروعات', max: 20, boxes: 3 }] },
    { title: 'المشاركة والتفاعل', subs: [{ title: 'التطبيقات والأنشطة الصفية', max: 5, boxes: 8 }, { title: 'المشاركة', max: 5, boxes: 8 }] },
    { title: 'الاختبارات القصيرة', subs: [{ title: 'اختبار تحريري', max: 20, boxes: 2 }] },
  ];

  const DEFAULTS = {
    theme: 'green',
    title: 'كشف متابعة الطلاب',
    line1: 'الإدارة العامة للتعليم بمنطقة ............',
    line2: 'مكتب التعليم ............',
    school: 'اسم المدرسة',
    grade: '', section: '', term: '', subject: '', teacher: '', year: '',
    names: [],
    rows: 15,
    groups: DEFAULT_GROUPS,
    logoRight: '', logoLeft: '',
  };

  function normalize(d) {
    const x = Object.assign({}, DEFAULTS, d || {});
    if (!THEMES[x.theme]) x.theme = DEFAULTS.theme;
    x.rows = num(x.rows, 8, 30, 15);
    x.names = (Array.isArray(x.names) ? x.names : String(x.names || '').split('\n')).map((n) => String(n).trim()).filter(Boolean);
    const groups = Array.isArray(x.groups) && x.groups.length ? x.groups : DEFAULT_GROUPS;
    x.groups = groups.slice(0, 8).map((g) => ({
      title: String(g.title ?? ''),
      subs: (Array.isArray(g.subs) && g.subs.length ? g.subs : [{ title: '', max: 10, boxes: 4 }]).slice(0, 4).map((s) => ({
        title: String(s.title ?? ''), max: num(s.max, 0, 100, 10), boxes: num(s.boxes, 0, 12, 4),
      })),
    }));
    return x;
  }
  const groupMax = (g) => g.subs.reduce((a, s) => a + s.max, 0);
  const totalMax = (d) => d.groups.reduce((a, g) => a + groupMax(g), 0);

  function css(t, d) {
    return `@page{size:${W}mm ${H}mm;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0}
body{font-family:'Tajawal',sans-serif;direction:rtl;color:#222}
.pg{width:${W}mm;height:${H}mm;position:relative;overflow:hidden;background:#fff;page-break-after:always;break-after:page}
.pg:last-child{page-break-after:auto;break-after:auto}
.band{position:absolute;top:0;left:6mm;right:6mm;height:21mm;background:${t.dark};border-radius:0 0 7mm 7mm}
.tab{position:absolute;top:12mm;left:50%;width:150mm;margin-left:-75mm;height:17mm;background:${t.dark};border-radius:0 0 7mm 7mm;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:7mm;letter-spacing:.3mm}
.hd{position:absolute;top:2.5mm;display:flex;align-items:center;gap:3mm;color:#fff;font-size:3.3mm;line-height:1.5;font-weight:500}
.hd.r{right:12mm}.hd.l{left:12mm;flex-direction:row-reverse}
.hd img{max-height:13mm;max-width:30mm;object-fit:contain}
.hd .t2{opacity:.8}
.meta{position:absolute;top:32mm;right:12mm;left:12mm;display:flex;justify-content:space-between;gap:6mm;font-weight:800;font-size:4.4mm;color:${t.bandInk}}
.meta span b{font-weight:500;color:#222;margin-inline-start:1.5mm;border-bottom:.3mm dotted #999;display:inline-block;min-width:24mm;text-align:center}
table{position:absolute;top:40mm;right:12mm;width:${W - 24}mm;border-collapse:collapse;table-layout:fixed}
th,td{border:.25mm solid ${t.line};padding:0;text-align:center;vertical-align:middle;overflow:hidden}
thead th{background:${t.head};font-weight:700;font-size:2.9mm;line-height:1.35;padding:.8mm .5mm}
thead th small{display:block;font-weight:500;font-size:2.6mm}
td.c{background:${t.cell}}
tbody tr:nth-child(odd) td{background:${t.zebra}}
tbody tr:nth-child(odd) td.c{background:${t.cell}}
td.n{text-align:right;padding:0 2mm;font-size:3.6mm;font-weight:500;white-space:nowrap;text-overflow:ellipsis}
td.i{font-size:3mm;background:${t.head}!important}
td.box{border-left-width:.12mm;border-right-width:.12mm}
.foot{position:absolute;bottom:4mm;left:6mm;right:6mm;height:9mm;background:${t.band};border-radius:2mm;display:flex;align-items:center;justify-content:space-between;padding:0 6mm;color:${t.bandInk};font-weight:800;font-size:4mm}
.foot small{font-weight:500;font-size:3.2mm}
.wm{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:800 12mm 'Tajawal',sans-serif;color:rgba(0,0,0,.08);transform:rotate(-20deg);pointer-events:none;white-space:nowrap;z-index:5}`;
  }

  function page(d, t, names, start, pageNo, pages, opts) {
    const img = (id) => (id && opts.imageUrl ? `<img src="${esc(opts.imageUrl(id))}" alt="">` : '');
    const boxesTotal = d.groups.reduce((a, g) => a + g.subs.reduce((b, s) => b + s.boxes, 0), 0);
    const subsCount = d.groups.reduce((a, g) => a + g.subs.length, 0);
    const fixed = 8 + 50 + 14 + subsCount * 9; // م + الاسم + المجموع + خانة درجة لكل بند
    const boxW = boxesTotal ? Math.max(3, (W - 24 - fixed) / boxesTotal) : 0;
    const nameW = boxesTotal ? 50 : (W - 24 - 8 - 14 - subsCount * 9);
    // رؤوس الأعمدة
    let cols = `<col style="width:8mm"><col style="width:${nameW}mm">`;
    let r1 = `<th rowspan="2">م</th><th rowspan="2">اسم الطالب</th>`;
    let r2 = '';
    d.groups.forEach((g) => {
      const span = g.subs.reduce((a, s) => a + 1 + s.boxes, 0);
      r1 += `<th colspan="${span}">${esc(g.title)}<small>${deg(groupMax(g))}</small></th>`;
      g.subs.forEach((s) => {
        cols += `<col style="width:${boxW.toFixed(2)}mm">`.repeat(s.boxes) + '<col style="width:9mm">';
        r2 += `<th colspan="${1 + s.boxes}">${esc(s.title)}<small>${deg(s.max)}</small></th>`;
      });
    });
    cols += '<col style="width:14mm">';
    r1 += `<th rowspan="2">المجموع<small>${deg(totalMax(d))}</small></th>`;
    // الصفوف
    const avail = (H - 15) - 40 - 26; // من بداية الجدول حتى الشريط السفلي ناقص صفي العناوين
    const rowH = Math.min(10, avail / d.rows);
    let body = '';
    for (let i = 0; i < d.rows; i++) {
      const n = names[i] || '';
      let cells = `<td class="i">${n || names.length === 0 || start + i < (opts.totalNames || 0) ? start + i + 1 : ''}</td><td class="n">${esc(n)}</td>`;
      d.groups.forEach((g) => g.subs.forEach((s) => { cells += '<td class="box"></td>'.repeat(s.boxes) + '<td class="c"></td>'; }));
      cells += '<td class="c"></td>';
      body += `<tr style="height:${rowH.toFixed(2)}mm">${cells}</tr>`;
    }
    const meta = [['الصف', d.grade], ['الفصل', d.section], ['المادة', d.subject], ['الفصل الدراسي', d.term], ['المعلم', d.teacher]]
      .filter(([k, v]) => v || k === 'الصف' || k === 'الفصل' || k === 'الفصل الدراسي')
      .map(([k, v]) => `<span>${k}:<b>${esc(v)}</b></span>`).join('');
    const footTxt = `${esc(d.title)}${d.year ? ` للعام الدراسي ${esc(d.year)}` : ''}${d.school ? ` — ${esc(d.school)}` : ''}`;
    return `<section class="pg">
  <div class="band"></div><div class="tab">${esc(d.school)}</div>
  <div class="hd r">${img(d.logoRight)}<div><div>${esc(d.line1)}</div><div class="t2">${esc(d.line2)}</div></div></div>
  <div class="hd l">${img(d.logoLeft)}</div>
  <div class="meta">${meta}</div>
  <table><colgroup>${cols}</colgroup><thead><tr>${r1}</tr><tr>${r2}</tr></thead><tbody>${body}</tbody></table>
  <div class="foot"><span>${footTxt}</span>${pages > 1 ? `<small>صفحة ${pageNo} من ${pages}</small>` : ''}</div>
  ${opts.watermark ? '<div class="wm">نسخة معاينة · اشترك لتنزيل الكشف</div>' : ''}
</section>`;
  }

  // opts: fontCss, imageUrl(id), watermark, page (رقم الصفحة للمعاينة فقط), screen
  function render(data, opts) {
    opts = opts || {};
    const d = normalize(data);
    const t = THEMES[d.theme];
    const pages = Math.max(1, Math.ceil(d.names.length / d.rows));
    const list = [];
    for (let p = 0; p < pages; p++) {
      if (opts.page != null && opts.page !== p) continue;
      list.push(page(d, t, d.names.slice(p * d.rows, (p + 1) * d.rows), p * d.rows, p + 1, pages, { ...opts, totalNames: d.names.length }));
    }
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>${opts.fontCss || ''}\n${css(t, d)}</style></head><body class="${opts.screen ? 'screen' : ''}" data-fitted="1">${list.join('\n')}</body></html>`;
  }

  const pageCount = (data) => { const d = normalize(data); return Math.max(1, Math.ceil(d.names.length / d.rows)); };
  const themes = Object.keys(THEMES).map((id) => ({ id, name: THEMES[id].name, colors: [THEMES[id].dark, THEMES[id].head, THEMES[id].band] }));
  return { render, normalize, pageCount, totalMax, groupMax, DEFAULTS, DEFAULT_GROUPS, themes, deg, W, H };
}));
