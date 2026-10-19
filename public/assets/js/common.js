// أدوات مشتركة بين صفحات المنصة
const BRAND = 'ملف إنجاز المعلم';

async function api(method, url, body) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch (_) { /* استجابة غير JSON */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'تعذر الاتصال بالخادم');
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

function toast(msg, type = '') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(v) {
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).replace(' ', 'T') + (String(v).includes('Z') ? '' : 'Z'));
  return d.toLocaleDateString('ar-SA-u-ca-gregory', { year: 'numeric', month: 'long', day: 'numeric' });
}

async function currentUser({ redirect = true } = {}) {
  try {
    return (await api('GET', '/api/me')).user;
  } catch (e) {
    if (redirect && e.status === 401) location.href = '/login?next=' + encodeURIComponent(location.pathname);
    return null;
  }
}

async function logout() {
  await api('POST', '/api/auth/logout');
  location.href = '/';
}

function subBadge(sub) {
  if (!sub) return '';
  if (sub.active && sub.status === 'trialing') return `<span class="badge warn">فترة تجريبية حتى ${fmtDate(sub.endsAt)}</span>`;
  if (sub.active) return `<span class="badge">مشترك حتى ${fmtDate(sub.endsAt)}</span>`;
  return '<span class="badge warn">حساب مجاني</span>';
}

function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-bg')) e.target.classList.remove('open');
  const c = e.target.closest && e.target.closest('[data-close]');
  if (c) c.closest('.modal-bg').classList.remove('open');
});

// نافذة تطلب الاشتراك عند محاولة تنزيل PDF بدون اشتراك
function showSubscribePrompt() {
  let m = document.getElementById('subPrompt');
  if (!m) {
    m = document.createElement('div');
    m.id = 'subPrompt';
    m.className = 'modal-bg';
    m.innerHTML = `<div class="modal" style="text-align:center">
      <div style="font-size:2.6em;line-height:1">📄</div>
      <h3 style="margin-top:8px">ملفك جاهز للتنزيل</h3>
      <p class="muted">تنزيل ملف الإنجاز بصيغة PDF متاح للمشتركين. اشترك الآن ونزّل ملفك مباشرة، وكل ما سويته محفوظ كما هو.</p>
      <div class="modal-actions" style="justify-content:center">
        <a class="btn primary" href="/subscribe">اشترك الآن</a>
        <button class="btn" data-close>لاحقًا</button>
      </div></div>`;
    document.body.appendChild(m);
  }
  m.classList.add('open');
}

async function downloadPdf(projectId, btn) {
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> جارٍ التجهيز...'; }
  try {
    const res = await fetch(`/api/projects/${projectId}/pdf`, { credentials: 'same-origin' });
    if (!res.ok) {
      let msg = 'تعذر إنشاء ملف PDF';
      let code = '';
      try { const d = await res.json(); msg = d.error || msg; code = d.code; } catch (_) {}
      if (code === 'SUBSCRIPTION_REQUIRED') { showSubscribePrompt(); return; }
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = m ? decodeURIComponent(m[1]) : 'ملف-إنجاز.pdf';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('تم تنزيل ملف PDF', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
