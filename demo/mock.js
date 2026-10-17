// خادم وهمي داخل المتصفح للنسخة التجريبية: يعترض طلبات /api ويحفظ البيانات في localStorage
(function () {
  const Core = window.InjazCore;
  const mem = {};
  const store = {
    get(k, d) { try { const v = localStorage.getItem('injaz:' + k); return v == null ? d : JSON.parse(v); } catch (_) { return k in mem ? mem[k] : d; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem('injaz:' + k, JSON.stringify(v)); } catch (_) { /* ذاكرة مؤقتة فقط */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem('injaz:' + k); } catch (_) {} },
  };
  const DAY = 864e5;
  const PLANS = { monthly: { id: 'monthly', name: 'اشتراك شهري', price: 29, days: 30 }, yearly: { id: 'yearly', name: 'اشتراك سنوي', price: 199, days: 365 } };
  const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

  const users = () => store.get('users', []);
  const me = () => users().find((u) => u.id === store.get('session', null)) || null;
  const subInfo = (u) => ({ active: u.sub.end > Date.now(), status: u.sub.status, plan: u.sub.plan, endsAt: u.sub.end, provider: 'mock' });
  const pub = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, isAdmin: false, subscription: subInfo(u) });
  const saveUser = (u) => store.set('users', users().map((x) => (x.id === u.id ? u : x)));
  const projects = () => store.get('projects', []);

  class HttpError extends Error { constructor(status, msg, code) { super(msg); this.status = status; this.code = code; } }
  const auth = () => { const u = me(); if (!u) throw new HttpError(401, 'يجب تسجيل الدخول'); return u; };
  const active = (u) => { if (!subInfo(u).active) throw new HttpError(402, 'اشتراكك غير مفعل. فعّل اشتراكك للمتابعة.', 'SUBSCRIPTION_REQUIRED'); };
  const own = (u, id) => { const p = projects().find((x) => x.id === id && x.userId === u.id); if (!p) throw new HttpError(404, 'الملف غير موجود'); return p; };

  const routes = [
    ['POST', /^\/api\/auth\/register$/, (b) => {
      const email = String(b.email || '').trim().toLowerCase();
      if (String(b.name || '').trim().length < 2) throw new HttpError(400, 'الاسم مطلوب');
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صحيح');
      if (String(b.password || '').length < 8) throw new HttpError(400, 'كلمة المرور يجب ألا تقل عن 8 أحرف');
      if (users().some((u) => u.email === email)) throw new HttpError(409, 'البريد مسجل مسبقًا');
      const u = { id: Date.now(), name: b.name.trim(), email, phone: b.phone || '', password: b.password, created_at: now(), sub: { status: 'trialing', plan: 'trial', end: Date.now() + 7 * DAY } };
      store.set('users', [...users(), u]);
      store.set('session', u.id);
      return { user: pub(u) };
    }],
    ['POST', /^\/api\/auth\/login$/, (b) => {
      const u = users().find((x) => x.email === String(b.email || '').trim().toLowerCase() && x.password === b.password);
      if (!u) throw new HttpError(401, 'البريد أو كلمة المرور غير صحيحة');
      store.set('session', u.id);
      return { user: pub(u) };
    }],
    ['POST', /^\/api\/auth\/logout$/, () => { store.del('session'); return { ok: true }; }],
    ['GET', /^\/api\/me$/, () => ({ user: pub(auth()) })],
    ['PUT', /^\/api\/me$/, (b) => {
      const u = auth();
      u.phone = b.phone || '';
      if (b.newPassword) {
        if (b.currentPassword !== u.password) throw new HttpError(400, 'كلمة المرور الحالية غير صحيحة');
        u.password = b.newPassword;
      }
      saveUser(u);
      return { user: pub(u) };
    }],
    ['GET', /^\/api\/plans$/, () => ({ plans: Object.values(PLANS), trialDays: 7, currency: 'ر.س' })],
    ['POST', /^\/api\/subscribe$/, (b) => {
      const u = auth();
      const plan = PLANS[b.plan];
      if (!plan) throw new HttpError(400, 'خطة غير معروفة');
      const base = u.sub.status === 'active' && u.sub.end > Date.now() ? u.sub.end : Date.now();
      u.sub = { status: 'active', plan: plan.id, end: base + plan.days * DAY };
      saveUser(u);
      return { done: true, subscription: subInfo(u) };
    }],
    ['GET', /^\/api\/themes$/, () => ({ themes: Object.entries(Core.THEMES).map(([id, t]) => ({ id, name: t.name, colors: [t.frame, t.accent, t.accent2, t.panel] })) })],
    ['GET', /^\/api\/projects$/, () => {
      const u = auth();
      return { projects: projects().filter((p) => p.userId === u.id).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).map(({ id, title, created_at, updated_at }) => ({ id, title, created_at, updated_at })) };
    }],
    ['POST', /^\/api\/projects$/, (b) => {
      const u = auth(); active(u);
      const data = Core.createProjectData(u.name);
      if (Core.THEMES[b.theme]) data.settings.theme = b.theme;
      const p = { id: Date.now(), userId: u.id, title: String(b.title || '').trim() || 'ملف إنجاز جديد', data, created_at: now(), updated_at: now() };
      store.set('projects', [...projects(), p]);
      return { id: p.id };
    }],
    ['GET', /^\/api\/projects\/(\d+)$/, (b, id) => { const u = auth(); const p = own(u, id); return { project: { id: p.id, title: p.title, data: Core.applyAccountName(p.data, u.name), updated_at: p.updated_at } }; }],
    ['PUT', /^\/api\/projects\/(\d+)$/, (b, id) => {
      const u = auth(); active(u);
      const p = own(u, id);
      b.data.pages.forEach((pg) => pg.blocks.forEach((bl) => { if (bl.type === 'text') bl.html = Core.cleanRich(bl.html); }));
      Object.assign(p, { title: String(b.title || '').trim() || p.title, data: Core.applyAccountName(b.data, u.name), updated_at: now() });
      store.set('projects', projects().map((x) => (x.id === p.id ? p : x)));
      return { ok: true, updated_at: p.updated_at };
    }],
    ['POST', /^\/api\/projects\/(\d+)\/duplicate$/, (b, id) => {
      const u = auth(); active(u);
      const p = own(u, id);
      const copy = { ...JSON.parse(JSON.stringify(p)), id: Date.now(), title: p.title + ' (نسخة)', created_at: now(), updated_at: now() };
      store.set('projects', [...projects(), copy]);
      return { id: copy.id };
    }],
    ['DELETE', /^\/api\/projects\/(\d+)$/, (b, id) => {
      const u = auth(); own(u, id);
      store.set('projects', projects().filter((x) => x.id !== id));
      return { ok: true };
    }],
  ];

  async function handleUpload(body) {
    const u = auth(); active(u);
    const file = body.get('file');
    if (!file || !/^image\//.test(file.type)) throw new HttpError(400, 'الملف يجب أن يكون صورة');
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join('');
    store.set('upload:' + id, dataUrl);
    return { id };
  }

  async function handleFile(body) {
    const u = auth(); active(u);
    const file = body.get('file');
    if (!file) throw new HttpError(400, 'لم يتم اختيار ملف');
    if (file.size > 3 * 1024 * 1024) throw new HttpError(400, 'في النسخة التجريبية الحد الأقصى 3 ميجابايت (في النسخة الكاملة 25)');
    const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('');
    store.set('file:' + id, dataUrl);
    return { id, name: file.name };
  }

  const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, opts = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const i = url.pathname.indexOf('/api/');
    if (i < 0) return realFetch(input, opts);
    const path = url.pathname.slice(i);
    const method = (opts.method || 'GET').toUpperCase();
    try {
      if (method === 'POST' && path === '/api/uploads') return json(200, await handleUpload(opts.body));
      if (method === 'POST' && path === '/api/files') return json(200, await handleFile(opts.body));
      if (method === 'GET' && path === '/api/qr') {
        return new Response(await Core.QRCode.toString(url.searchParams.get('u') || ' ', { type: 'svg', margin: 1 }), { headers: { 'Content-Type': 'image/svg+xml' } });
      }
      for (const [m, re, fn] of routes) {
        const match = m === method && path.match(re);
        if (match) return json(200, fn(opts.body ? JSON.parse(opts.body) : {}, match[1] ? Number(match[1]) : undefined));
      }
      return json(404, { error: 'غير موجود' });
    } catch (e) {
      return json(e.status || 500, { error: e.message, code: e.code });
    }
  };

  // أدوات يستخدمها المحرر في النسخة التجريبية
  window.uploadUrl = (id) => store.get('upload:' + id, '');
  window.qrDataUrl = (text) => {
    const qr = Core.QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -1 ${n + 2} ${n + 2}"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`);
  };
  window.demoFileHref = (id) => store.get('file:' + id, '#');
  // XHR لرفع الملفات يمر عبر fetch الوهمي في النسخة التجريبية
  const RealXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function () {
    const xhr = { upload: {}, status: 0, responseText: '' };
    let url = '';
    xhr.open = (m, u) => { url = u; };
    xhr.send = async (body) => {
      if (xhr.upload.onprogress) xhr.upload.onprogress({ lengthComputable: true, loaded: 1, total: 1 });
      const r = await window.fetch(url, { method: 'POST', body });
      xhr.status = r.status; xhr.responseText = await r.text();
      xhr.onload && xhr.onload();
    };
    return xhr;
  };
  window.XMLHttpRequest.real = RealXHR;
  window.demoProjectId = () => {
    const m = location.hash.match(/\d+/);
    if (m) { store.set('current', Number(m[0])); return Number(m[0]); }
    return store.get('current', 0);
  };
  window.demoGetProject = (id) => {
    const p = projects().find((x) => x.id === id);
    const u = me();
    if (p && u) Core.applyAccountName(p.data, u.name);
    return p || null;
  };
  window.downloadPdf = (id) => {
    store.set('current', id);
    toast('في النسخة التجريبية تفتح المعاينة بدل تنزيل PDF. التنزيل يعمل في النسخة الكاملة.');
    setTimeout(() => { location.href = 'preview.html#p' + id; }, 900);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.textContent = 'نسخة تجريبية للتصفح — بياناتك تُحفظ في هذا المتصفح فقط';
    bar.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:300;background:#2f3432;color:#fff;font:500 12px Tajawal,sans-serif;padding:6px 12px;border-radius:99px;opacity:.85;pointer-events:none';
    document.body.appendChild(bar);
  });
})();
