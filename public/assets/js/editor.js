// محرر ملف الإنجاز
const projectId = Number(location.pathname.split('/').pop());
const $ = (id) => document.getElementById(id);

const BLOCK_NAMES = { text: 'نص', fields: 'حقول بيانات', table: 'جدول', images: 'صور', links: 'روابط وQR', quote: 'اقتباس' };
const PAGE_ICONS = { cover: '📘', opening: '✨', toc: '📑', backcover: '📕' };
const uid = () => Math.random().toString(16).slice(2, 14);

const PRESETS = {
  text: () => ({ type: 'text', heading: '', html: '<p></p>' }),
  fields: () => ({ type: 'fields', heading: '', items: [{ label: 'البند', value: '' }] }),
  table: () => ({ type: 'table', heading: '', columns: ['العمود 1', 'العمود 2', 'العمود 3'], rows: [['', '', ''], ['', '', '']] }),
  images: () => ({ type: 'images', heading: '', items: [{ uploadId: '', caption: '' }, { uploadId: '', caption: '' }] }),
  links: () => ({ type: 'links', heading: '', items: [{ title: 'رابط جديد', url: '' }] }),
  quote: () => ({ type: 'quote', heading: '', text: '', author: '' }),
};

let project = null;
let cur = 0;
let readOnly = false;
let dirty = false;
let saving = false;
let saveTimer = null;
let uploadTarget = null;
let docTarget = null;

// ---------- تحميل ----------
(async function init() {
  const user = await currentUser();
  if (!user) return;
  readOnly = !(user.subscription.active || user.isAdmin);
  $('roBanner').style.display = readOnly ? 'block' : 'none';
  try {
    project = (await api('GET', `/api/projects/${projectId}`)).project;
  } catch (e) {
    $('pageArea').innerHTML = `<div class="empty-state"><div class="big">😕</div><p>${esc(e.message)}</p><a class="btn" href="/app">العودة لملفاتي</a></div>`;
    return;
  }
  document.title = project.title + ' — إنجاز';
  // الملفات القديمة: صفحة البسملة كان فيها عنوان الملف والاسم، صارت للآية فقط
  project.data.pages.filter((p) => p.type === 'opening').forEach((p) => p.blocks.forEach((b) => {
    if (b.type === 'fields') b.items = b.items.filter((i) => i.label === 'الآية');
  }));
  $('projTitle').value = project.title;
  $('projTitle').oninput = (e) => { project.title = e.target.value; markDirty(); };
  $('projTitle').disabled = readOnly;

  const { themes } = await api('GET', '/api/themes');
  $('themeSel').innerHTML = themes.map((t) => `<option value="${t.id}">🎨 ${esc(t.name)}</option>`).join('');
  $('themeSel').value = project.data.settings.theme;
  $('layoutSel').value = project.data.settings.layout;
  $('themeSel').onchange = (e) => { project.data.settings.theme = e.target.value; markDirty(); };
  $('layoutSel').onchange = (e) => { project.data.settings.layout = e.target.value; markDirty(); };
  $('themeSel').disabled = $('layoutSel').disabled = readOnly;

  renderSide();
  renderPage();
  setStatus('كل التغييرات محفوظة');
})();

// ---------- الحفظ ----------
function setStatus(text, err) {
  const el = $('saveSt');
  el.textContent = text;
  el.classList.toggle('err', !!err);
}

function markDirty() {
  if (readOnly) return;
  dirty = true;
  setStatus('تغييرات غير محفوظة...');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 1200);
}

async function save() {
  if (readOnly || !dirty) return true;
  if (saving) { clearTimeout(saveTimer); saveTimer = setTimeout(save, 500); return false; }
  saving = true;
  dirty = false;
  setStatus('جارٍ الحفظ...');
  try {
    await api('PUT', `/api/projects/${projectId}`, { title: project.title, data: project.data });
    setStatus(dirty ? 'تغييرات غير محفوظة...' : 'كل التغييرات محفوظة ✓');
    return true;
  } catch (e) {
    dirty = true;
    setStatus('تعذر الحفظ — ' + e.message, true);
    if (e.code === 'SUBSCRIPTION_REQUIRED') { readOnly = true; $('roBanner').style.display = 'block'; }
    else { clearTimeout(saveTimer); saveTimer = setTimeout(save, 5000); }
    return false;
  } finally {
    saving = false;
  }
}

window.addEventListener('beforeunload', (e) => { if (dirty && !readOnly) { save(); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); clearTimeout(saveTimer); save(); }
});

$('previewBtn').onclick = async () => {
  const w = window.open('about:blank', '_blank');
  clearTimeout(saveTimer);
  await save();
  if (w) w.location = `/api/projects/${projectId}/preview`;
  else location.href = `/api/projects/${projectId}/preview`;
};
$('pdfBtn').onclick = async (e) => {
  const btn = e.currentTarget;
  clearTimeout(saveTimer);
  await save();
  downloadPdf(projectId, btn);
};

// ---------- قائمة الصفحات ----------
const pages = () => project.data.pages;

function renderSide() {
  $('pcount').textContent = pages().length + ' صفحة';
  $('plist').innerHTML = pages().map((p, i) => `
    <div class="pitem ${i === cur ? 'on' : ''}" data-i="${i}">
      <span class="n">${PAGE_ICONS[p.type] || i + 1}</span>
      <span class="t">${esc(p.title || 'بدون عنوان')}</span>
      ${p.type === 'section' && p.width === 'full' ? '<span class="w">صفحتين</span>' : ''}
      ${readOnly ? '' : `<span class="mv"><button data-mv="-1" title="لأعلى">▲</button><button data-mv="1" title="لأسفل">▼</button></span>`}
    </div>`).join('');
}

$('plist').addEventListener('click', (e) => {
  const item = e.target.closest('.pitem');
  if (!item) return;
  const i = Number(item.dataset.i);
  const mv = e.target.closest('[data-mv]');
  if (mv) {
    const j = i + Number(mv.dataset.mv);
    if (j < 0 || j >= pages().length) return;
    const arr = pages();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (cur === i) cur = j; else if (cur === j) cur = i;
    markDirty();
    renderSide();
    return;
  }
  cur = i;
  renderSide();
  renderPage();
  $('side').classList.remove('open');
  document.querySelector('.main').scrollTop = 0;
});

function toggleSide() { $('side').classList.toggle('open'); }

// ---------- إضافة صفحة ----------
let npWidth = 'half';
$('npWidth').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  npWidth = b.dataset.v;
  $('npWidth').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
});

function openAddPage() {
  if (readOnly) return toast('فعّل اشتراكك للتعديل', 'err');
  $('npTitle').value = '';
  openModal('addPageModal');
  setTimeout(() => $('npTitle').focus(), 50);
}

function addPage() {
  const title = $('npTitle').value.trim() || 'صفحة جديدة';
  const start = $('npStart').value;
  const blocks = start ? [{ ...PRESETS[start](), id: uid() }] : [];
  const page = { id: uid(), type: 'section', title, width: npWidth, blocks };
  // تُضاف بعد الصفحة الحالية، وقبل الغلاف الخلفي دائمًا
  let at = cur + 1;
  const backIdx = pages().findIndex((p) => p.type === 'backcover');
  if (backIdx >= 0 && at > backIdx) at = backIdx;
  pages().splice(at, 0, page);
  cur = at;
  closeModal('addPageModal');
  markDirty();
  renderSide();
  renderPage();
}

function confirmDialog(title, text, onOk) {
  $('cfTitle').textContent = title;
  $('cfText').textContent = text;
  $('cfOk').onclick = () => { closeModal('confirmModal'); onOk(); };
  openModal('confirmModal');
}

// ---------- محرر الصفحة ----------
function renderPage() {
  const p = pages()[cur];
  if (!p) { $('pageArea').innerHTML = ''; return; }
  const dis = readOnly ? 'disabled' : '';
  const isSection = p.type === 'section';
  let html = `<div class="card phead">
    <input class="ptitle" data-page="title" value="${esc(p.title)}" ${dis} aria-label="عنوان الصفحة">
    <div class="popts">`;
  if (isSection) {
    html += `<span class="seg"><button data-act="width" data-v="half" class="${p.width !== 'full' ? 'on' : ''}" ${dis}>صفحة واحدة</button><button data-act="width" data-v="full" class="${p.width === 'full' ? 'on' : ''}" ${dis}>صفحتين متقابلتين</button></span>
      <label><input type="checkbox" data-page="hideInToc" ${p.hideInToc ? '' : 'checked'} ${dis}> تظهر في الفهرس</label>
      <div class="spacer"></div>
      ${readOnly ? '' : '<button class="btn sm" data-act="dupPage">⧉ تكرار الصفحة</button><button class="btn sm danger" data-act="delPage">🗑 حذف الصفحة</button>'}`;
  } else if (!readOnly && p.type !== 'cover') {
    html += '<div class="spacer"></div><button class="btn sm danger" data-act="delPage">🗑 حذف الصفحة</button>';
  }
  html += '</div></div>';

  if (isSection && p.width === 'full' && p.blocks.length && p.blocks.every((b) => ['text', 'quote', 'fields'].includes(b.type))) {
    html += '<div class="note">هذه الصفحة نصية، لذلك تُعرض في صفحة واحدة من الدفتر حتى لا ينقسم النص، وتأتي الصفحة التالية مقابلها. خيار «صفحتين متقابلتين» مخصص للصفحات التي فيها صور أو جداول.</div>';
  }
  if (p.type === 'cover') html += '<div class="note">بيانات الغلاف الأمامي للملف. اترك أي حقل فارغًا لإخفائه.</div>';
  if (p.type === 'opening') html += '<div class="note">صفحة البسملة. تظهر البسملة تلقائيًا، ويمكنك تعديل الآية تحتها أو تركها فارغة لإخفائها.</div>';
  if (p.type === 'toc') html += '<div class="note">📑 يُنشأ الفهرس تلقائيًا من عناوين الصفحات مع أرقامها. لإخفاء صفحة من الفهرس ألغِ خيار «تظهر في الفهرس» داخل الصفحة.</div>';
  if (p.type === 'backcover') html += '<div class="note">الغلاف الخلفي للملف — لا يحتاج إلى تعديل.</div>';

  html += p.blocks.map((b, bi) => renderBlock(b, bi, p)).join('');

  if (isSection && !readOnly) {
    html += `<div class="addbar"><b>إضافة محتوى للصفحة</b><div class="opts">${Object.entries(BLOCK_NAMES).map(([k, v]) => `<button class="btn sm" data-act="addBlock" data-v="${k}">＋ ${v}</button>`).join('')}</div></div>`;
  }
  $('pageArea').innerHTML = html;
  $('pageArea').querySelectorAll('textarea').forEach(autoGrow);
}

function renderBlock(b, bi, p) {
  const locked = p.type !== 'section';
  const dis = readOnly ? 'disabled' : '';
  const ctl = locked || readOnly ? '' : `
    <button class="btn icon ghost sm" data-act="mvBlock" data-b="${bi}" data-v="-1" title="لأعلى">▲</button>
    <button class="btn icon ghost sm" data-act="mvBlock" data-b="${bi}" data-v="1" title="لأسفل">▼</button>
    <button class="btn icon ghost sm danger" data-act="delBlock" data-b="${bi}" title="حذف">🗑</button>`;
  const head = locked ? '' : `<div class="blk-h"><span class="type">${BLOCK_NAMES[b.type]}</span>
    ${b.type === 'quote' ? '<span class="spacer"></span>' : `<input class="heading" data-b="${bi}" data-path="heading" value="${esc(b.heading)}" placeholder="عنوان فرعي (اختياري)" ${dis}>`}${ctl}</div>`;
  return `<div class="card blk">${head}<div class="blk-b">${blockBody(b, bi, locked, dis)}</div></div>`;
}

function blockBody(b, bi, locked, dis) {
  const at = (path) => `data-b="${bi}" data-path="${path}"`;
  switch (b.type) {
    case 'text':
      return `${readOnly ? '' : `<div class="rte-bar" data-b="${bi}">
          <button data-cmd="bold" title="عريض"><b>B</b></button>
          <button data-cmd="italic" title="مائل"><i>I</i></button>
          <button data-cmd="underline" title="تسطير"><u>U</u></button>
          <span class="sep"></span>
          <button data-cmd="formatBlock" data-val="H3" title="عنوان">ع</button>
          <button data-cmd="formatBlock" data-val="P" title="فقرة">¶</button>
          <button data-cmd="insertUnorderedList" title="قائمة نقطية">•</button>
          <button data-cmd="insertOrderedList" title="قائمة مرقمة">1.</button>
          <span class="sep"></span>
          <button data-cmd="justifyRight" title="محاذاة لليمين">⇥</button>
          <button data-cmd="justifyCenter" title="توسيط">≡</button>
          <button data-cmd="justifyFull" title="ضبط">☰</button>
          <span class="sep"></span>
          <button data-cmd="removeFormat" title="إزالة التنسيق">⌫</button>
        </div>`}
        <div class="rte" ${at('html')} contenteditable="${!readOnly}">${b.html || ''}</div>`;
    case 'fields':
      return b.items.map((it, i) => locked
        ? `<div class="frow locked"><span class="lbl">${esc(it.label)}</span>${isNameField(it) ? nameField(it) : FIELD_OPTIONS[it.label] ? optionsSelect(it, at(`items.${i}.value`), dis) : `<input class="input" ${at(`items.${i}.value`)} value="${esc(it.value)}" ${dis}>`}</div>`
        : `<div class="frow"><input class="input lab" ${at(`items.${i}.label`)} value="${esc(it.label)}" placeholder="البند" ${isNameField(it) ? 'readonly' : ''} ${dis}>
           ${isNameField(it) ? nameField(it) : FIELD_OPTIONS[it.label] ? optionsSelect(it, at(`items.${i}.value`), dis) : `<textarea class="input" rows="1" ${at(`items.${i}.value`)} placeholder="القيمة" ${dis}>${esc(it.value)}</textarea>`}
           ${readOnly ? '' : `<button class="btn icon ghost danger sm" data-act="rmItem" data-b="${bi}" data-i="${i}" title="حذف">✕</button>`}</div>`).join('')
        + (locked || readOnly ? '' : `<button class="btn sm" data-act="addItem" data-b="${bi}">＋ إضافة بند</button>`);
    case 'table': {
      const rm = readOnly ? '' : '<th style="width:28px"></th>';
      return `<div class="tbl-wrap"><table class="etbl"><thead><tr>${b.columns.map((c, ci) => `<th><input ${at(`columns.${ci}`)} value="${esc(c)}" ${dis}></th>`).join('')}${rm}</tr></thead>
        <tbody>${b.rows.map((r, ri) => `<tr>${b.columns.map((_, ci) => `<td><textarea rows="1" ${at(`rows.${ri}.${ci}`)} ${dis}>${esc(r[ci])}</textarea></td>`).join('')}
          ${readOnly ? '' : `<td><button class="rm" data-act="rmRow" data-b="${bi}" data-i="${ri}" title="حذف الصف">✕</button></td>`}</tr>`).join('')}</tbody></table></div>
        ${readOnly ? '' : `<div class="tbl-acts"><button class="btn sm" data-act="addRow" data-b="${bi}">＋ صف</button><button class="btn sm" data-act="addCol" data-b="${bi}">＋ عمود</button><button class="btn sm" data-act="rmCol" data-b="${bi}">− آخر عمود</button></div>`}`;
    }
    case 'images':
      return `<div class="igrid">${b.items.map((it, i) => `
        <div class="itile">
          <div class="pic" data-act="pick" data-b="${bi}" data-i="${i}">
            ${it.uploadId ? `<img src="/api/uploads/${esc(it.uploadId)}" alt="">` : '<div class="ph">📷<br>اضغط لرفع صورة</div>'}
            ${readOnly ? '' : `<button class="x" data-act="rmItem" data-b="${bi}" data-i="${i}" title="حذف">✕</button>`}
          </div>
          <input class="cap" ${at(`items.${i}.caption`)} value="${esc(it.caption)}" placeholder="وصف الصورة (اختياري)" ${dis}>
        </div>`).join('')}</div>
        ${readOnly ? '' : `<button class="btn sm" style="margin-top:10px" data-act="addImage" data-b="${bi}">＋ إضافة صورة</button>`}`;
    case 'links':
      return `<p class="muted" style="margin:0 0 10px;font-size:.88em">ارفع ملف الشاهد مباشرة (PDF، Word، صور...) أو ضع رابطًا، وسيظهر في الملف زرًا قابلًا للنقر مع رمز QR تلقائي.</p>`
        + b.items.map((it, i) => `<div class="lrow">
          <input class="input t" ${at(`items.${i}.title`)} value="${esc(it.title)}" placeholder="عنوان الشاهد" ${dis}>
          <div class="src" data-src="${bi}-${i}">${linkSource(it, bi, i, at, dis)}</div>
          <div class="qr" data-qr="${bi}-${i}">${qrImg(itemUrl(it))}</div>
          ${readOnly ? '<span></span>' : `<button class="btn icon ghost danger sm" data-act="rmItem" data-b="${bi}" data-i="${i}" title="حذف">✕</button>`}
        </div>`).join('')
        + (readOnly ? '' : `<button class="btn sm" data-act="addLink" data-b="${bi}">＋ إضافة شاهد</button>`);
    case 'quote':
      return `<div class="field"><label>نص الاقتباس</label><textarea class="input" rows="2" ${at('text')} ${dis}>${esc(b.text)}</textarea></div>
        <div class="field" style="margin:0"><label>القائل</label><input class="input" ${at('author')} value="${esc(b.author)}" ${dis}></div>`;
    default:
      return '';
  }
}

// رابط الشاهد: الملف المرفوع له رابط عام على الموقع، وإلا الرابط الذي كتبه المعلم
const fileLink = (id) => `${project.baseUrl || location.origin}/f/${id}`;
const itemUrl = (it) => (it.fileId ? fileLink(it.fileId) : (it.url || '').trim());

function linkSource(it, bi, i, at, dis) {
  if (it.fileId) {
    return `<span class="fchip" title="${esc(it.fileName)}">📄 <a href="${esc(fileLink(it.fileId))}" target="_blank" rel="noopener">${esc(it.fileName || 'ملف مرفوع')}</a></span>
      ${readOnly ? '' : `<button class="btn sm" data-act="attach" data-b="${bi}" data-i="${i}" title="استبدال الملف">⇄</button><button class="btn sm ghost" data-act="detach" data-b="${bi}" data-i="${i}" title="إزالة الملف">✕</button>`}`;
  }
  return `<input class="input u" ${at(`items.${i}.url`)} value="${esc(it.url)}" placeholder="https://... أو ارفع ملف" dir="ltr" ${dis}>
    ${readOnly ? '' : `<button class="btn sm accent" data-act="attach" data-b="${bi}" data-i="${i}" title="رفع ملف">📎 رفع ملف</button>`}`;
}

// حقل الاسم يُعبّأ تلقائيًا من اسم العضوية ولا يُعدّل
const isNameField = (it) => String(it.label).trim() === 'الاسم';
const nameField = (it) => `<div class="locked-val" title="الاسم مأخوذ من بيانات العضوية ولا يمكن تعديله">🔒 <span>${esc(it.value)}</span><small>من بيانات العضوية</small></div>`;

// حقول لها قائمة اختيارات ثابتة بدل الكتابة الحرة
const FIELD_OPTIONS = {
  'إدارة التعليم': [
    'الإدارة العامة للتعليم بمنطقة القصيم',
    'الإدارة العامة للتعليم بمحافظة الأحساء',
    'الإدارة العامة للتعليم بالمنطقة الشرقية',
    'الإدارة العامة للتعليم بمنطقة تبوك',
    'الإدارة العامة للتعليم بمنطقة جازان',
    'الإدارة العامة للتعليم بمنطقة الحدود الشمالية',
    'الإدارة العامة للتعليم بمنطقة عسير',
    'إدارة التعليم بمحافظة الطائف',
    'الإدارة العامة للتعليم بمنطقة نجران',
    'الإدارة العامة للتعليم بمنطقة الجوف',
    'الإدارة العامة للتعليم بمنطقة حائل',
    'الإدارة العامة للتعليم بمنطقة الباحة',
    'الإدارة العامة للتعليم بمنطقة مكة المكرمة',
    'الإدارة العامة للتعليم بمنطقة الرياض',
    'الإدارة العامة للتعليم بمحافظة جدة',
    'الإدارة العامة للتعليم بمنطقة المدينة المنورة',
  ],
};

function optionsSelect(it, attrs, dis) {
  const opts = FIELD_OPTIONS[it.label];
  // قيمة قديمة مكتوبة يدويًا تبقى ظاهرة حتى يختار المعلم من القائمة
  const extra = it.value && !opts.includes(it.value) ? [it.value] : [];
  return `<select class="input" ${attrs} ${dis}>
    <option value="">اختر ${esc(it.label)}...</option>
    ${[...extra, ...opts].map((o) => `<option value="${esc(o)}" ${o === it.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}
  </select>`;
}

const qrImg = (url) => (url && url.trim() ? `<img src="/api/qr?u=${encodeURIComponent(url.trim())}" alt="QR">` : 'QR');

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
  o[keys[keys.length - 1]] = value;
}

// ---------- أحداث الإدخال ----------
const area = $('pageArea');

area.addEventListener('input', (e) => {
  const el = e.target;
  const p = pages()[cur];
  if (el.dataset.page === 'title') {
    p.title = el.value;
    const t = document.querySelector('.pitem.on .t');
    if (t) t.textContent = el.value || 'بدون عنوان';
    markDirty();
    return;
  }
  if (el.dataset.path == null) return;
  const b = p.blocks[Number(el.dataset.b)];
  setPath(b, el.dataset.path, el.isContentEditable ? el.innerHTML : el.value);
  if (el.tagName === 'TEXTAREA') autoGrow(el);
  markDirty();
});

area.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.page === 'hideInToc') {
    const p = pages()[cur];
    if (el.checked) delete p.hideInToc; else p.hideInToc = true;
    markDirty();
  }
  if (el.classList.contains('u')) {
    const box = el.parentElement.querySelector('.qr');
    if (box) box.innerHTML = qrImg(el.value);
  }
});

// لصق النص بدون تنسيقات خارجية
area.addEventListener('paste', (e) => {
  if (!e.target.closest('.rte')) return;
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
});

area.addEventListener('mousedown', (e) => {
  if (e.target.closest('.rte-bar button')) e.preventDefault(); // الحفاظ على التحديد
});

function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

area.addEventListener('click', (e) => {
  const cmdBtn = e.target.closest('.rte-bar button');
  if (cmdBtn) {
    const bi = Number(cmdBtn.parentElement.dataset.b);
    const rte = area.querySelector(`.rte[data-b="${bi}"]`);
    if (document.activeElement !== rte) rte.focus();
    document.execCommand(cmdBtn.dataset.cmd, false, cmdBtn.dataset.val || null);
    pages()[cur].blocks[bi].html = rte.innerHTML;
    markDirty();
    return;
  }

  const btn = e.target.closest('[data-act]');
  if (!btn || readOnly) return;
  const act = btn.dataset.act;
  const p = pages()[cur];
  const bi = Number(btn.dataset.b);
  const b = p.blocks[bi];
  const i = Number(btn.dataset.i);
  let rerender = true;

  switch (act) {
    case 'width': p.width = btn.dataset.v; renderSide(); break;
    case 'dupPage': {
      const copy = JSON.parse(JSON.stringify(p));
      copy.id = uid(); copy.title += ' (نسخة)';
      copy.blocks.forEach((x) => { x.id = uid(); });
      pages().splice(cur + 1, 0, copy);
      cur += 1;
      renderSide();
      break;
    }
    case 'delPage':
      rerender = false;
      confirmDialog('حذف الصفحة', `هل تريد حذف صفحة «${p.title}» بكل محتواها؟`, () => {
        pages().splice(cur, 1);
        cur = Math.max(0, Math.min(cur, pages().length - 1));
        markDirty(); renderSide(); renderPage();
      });
      break;
    case 'addBlock': p.blocks.push({ ...PRESETS[btn.dataset.v](), id: uid() }); break;
    case 'mvBlock': {
      const j = bi + Number(btn.dataset.v);
      if (j < 0 || j >= p.blocks.length) return;
      [p.blocks[bi], p.blocks[j]] = [p.blocks[j], p.blocks[bi]];
      break;
    }
    case 'delBlock':
      rerender = false;
      confirmDialog('حذف المحتوى', `حذف «${BLOCK_NAMES[b.type]}${b.heading ? ': ' + b.heading : ''}» من الصفحة؟`, () => {
        p.blocks.splice(bi, 1); markDirty(); renderPage();
      });
      break;
    case 'addItem': b.items.push({ label: '', value: '' }); break;
    case 'addLink': b.items.push({ title: '', url: '' }); break;
    case 'attach':
      rerender = false;
      docTarget = { page: cur, bi, i };
      $('docInput').value = '';
      $('docInput').click();
      break;
    case 'detach': delete b.items[i].fileId; delete b.items[i].fileName; b.items[i].url = ''; break;
    case 'addImage': b.items.push({ uploadId: '', caption: '' }); break;
    case 'rmItem': e.stopPropagation(); b.items.splice(i, 1); break;
    case 'addRow': b.rows.push(b.columns.map(() => '')); break;
    case 'rmRow': b.rows.splice(i, 1); break;
    case 'addCol': b.columns.push('عمود'); b.rows.forEach((r) => r.push('')); break;
    case 'rmCol': if (b.columns.length > 1) { b.columns.pop(); b.rows.forEach((r) => r.pop()); } break;
    case 'pick':
      rerender = false;
      uploadTarget = { page: cur, bi, i };
      $('fileInput').value = '';
      $('fileInput').click();
      break;
    default: rerender = false;
  }
  if (rerender) { markDirty(); renderPage(); }
});

$('fileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !uploadTarget) return;
  const { page, bi, i } = uploadTarget;
  const tile = area.querySelector(`.pic[data-b="${bi}"][data-i="${i}"]`);
  if (tile) tile.innerHTML = '<span class="spinner dark"></span>';
  try {
    const fd = new FormData();
    fd.append('file', await shrinkImage(file));
    const { id } = await api('POST', '/api/uploads', fd);
    pages()[page].blocks[bi].items[i].uploadId = id;
    markDirty();
  } catch (err) {
    toast(err.message, 'err');
  }
  if (page === cur) renderPage();
});

// تصغير الصور الكبيرة قبل الرفع لتسريع الملف
async function shrinkImage(file, max = 1800) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5e6) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((r) => c.toBlob(r, type, 0.86));
    return blob ? new File([blob], file.name, { type }) : file;
  } catch (_) {
    return file;
  }
}

// ---------- رفع ملفات الشواهد ----------
function uploadWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300 && data) resolve(data);
      else reject(new Error((data && data.error) || 'تعذر رفع الملف'));
    };
    xhr.onerror = () => reject(new Error('انقطع الاتصال أثناء الرفع'));
    const fd = new FormData();
    fd.append('file', file);
    xhr.send(fd);
  });
}

$('docInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !docTarget) return;
  const { page, bi, i } = docTarget;
  const cell = area.querySelector(`.src[data-src="${bi}-${i}"]`);
  const show = (pct) => { if (cell && page === cur) cell.innerHTML = `<div class="upbar"><span style="width:${pct}%"></span></div><span class="muted" style="font-size:.85em;white-space:nowrap">جارٍ الرفع ${pct}%</span>`; };
  show(0);
  try {
    const { id, name } = await uploadWithProgress('/api/files', file, show);
    const item = pages()[page].blocks[bi].items[i];
    item.fileId = id;
    item.fileName = name;
    item.url = '';
    if (!item.title.trim() || item.title === 'رابط جديد') item.title = name.replace(/\.[^.]+$/, '');
    markDirty();
    toast('تم رفع الملف وإنشاء رمز QR له', 'ok');
  } catch (err) {
    toast(err.message, 'err');
  }
  if (page === cur) renderPage();
});
