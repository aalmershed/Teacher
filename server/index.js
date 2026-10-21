const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const QRCode = require('qrcode');

const { db, DATA_DIR } = require('./db');
const { createProjectData, applyAccountName, newId } = require('./template');
const { renderProject, THEMES, cleanRich, fontCss } = require('./render');
const { projectToPdf, certificateToPdf } = require('./pdf');
const CertRender = require('./cert-render');
const payments = require('./payments');
const seo = require('./seo');
const mail = require('./mail');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const SESSION_DAYS = 30;
const PUBLIC = path.join(__dirname, '..', 'public');
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
const FILE_MAX_MB = Number(process.env.FILE_MAX_MB || 25);
const STORAGE_QUOTA_MB = Number(process.env.STORAGE_QUOTA_MB || 1000);

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', true);

// الرابط الأساسي للموقع — يُستخدم في روابط الملفات ورموز QR
const baseUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

// توحيد الدومين: أي زيارة من www أو الرابط القديم تتحول للدومين الأساسي حتى تبقى جلسة الدخول واحدة
// (مهم للرجوع من بوابة الدفع: الكوكيز مرتبطة بالدومين)
const CANONICAL_HOST = PUBLIC_URL ? new URL(PUBLIC_URL).host : '';
app.use((req, res, next) => {
  const host = req.get('host') || '';
  if (!CANONICAL_HOST || host === CANONICAL_HOST || !['GET', 'HEAD'].includes(req.method) || /^(localhost|127\.0\.0\.1|app)(:\d+)?$/.test(host)) return next();
  res.redirect(301, PUBLIC_URL + req.originalUrl);
});
// صفحات المستخدم الخاصة وملفات الشواهد لا تُفهرس في محركات البحث
app.use((req, res, next) => {
  if (seo.NOINDEX.test(req.path)) res.set('X-Robots-Tag', 'noindex, nofollow');
  else if (seo.LOW_VALUE.test(req.path)) res.set('X-Robots-Tag', 'noindex, follow');
  else if (req.path === '/register') res.set('Link', `<${baseUrl(req)}/register>; rel="canonical"`);
  next();
});
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());

// ---------- المصادقة ----------
function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: SESSION_DAYS * 864e5 });
}

app.use((req, _res, next) => {
  const token = req.cookies.sid;
  if (token) {
    const row = db.prepare('SELECT u.id, u.name, u.email, u.phone, u.is_admin, u.suspended, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
    if (row && row.expires_at > Date.now() && !row.suspended) req.user = row;
  }
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'يجب تسجيل الدخول' }));
// الاستخدام مجاني (إنشاء، تعديل، رفع، معاينة)؛ تنزيل ملف PDF النهائي فقط يحتاج اشتراكًا
const isSubscribed = (user) => !!user.is_admin || payments.subscriptionInfo(user.id).active;
const requireActive = (req, res, next) => {
  if (isSubscribed(req.user)) return next();
  res.status(402).json({ error: 'تنزيل ملف PDF متاح للمشتركين. اشترك الآن لتنزيل ملفك.', code: 'SUBSCRIPTION_REQUIRED' });
};
const requireAdmin = (req, res, next) => (req.user && req.user.is_admin ? next() : res.status(403).json({ error: 'غير مصرح' }));

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, isAdmin: !!u.is_admin, subscription: payments.subscriptionInfo(u.id) });

app.post('/api/auth/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = String(req.body.phone || '').trim();
  const password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'الاسم مطلوب' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صحيح' });
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'البريد مسجل مسبقًا' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash, is_admin) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, phone || null, hash, email === ADMIN_EMAIL ? 1 : 0);
  const userId = Number(info.lastInsertRowid);
  payments.startTrial(userId);
  createSession(res, userId);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId)) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  }
  if (user.suspended) return res.status(403).json({ error: 'هذا الحساب موقوف. تواصل مع الدعم.' });
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

// ---------- نسيت كلمة المرور ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const RESET_TTL = 60 * 60 * 1000;
const SUPPORT_CONTACT = process.env.SUPPORT_CONTACT || '';
const resetHits = new Map(); // حد بسيط للطلبات لكل عنوان IP

app.get('/api/auth/forgot', (_req, res) => res.json({ email: mail.enabled(), contact: SUPPORT_CONTACT }));

app.post('/api/auth/forgot', async (req, res) => {
  if (!mail.enabled()) return res.status(503).json({ error: 'استعادة كلمة المرور بالبريد غير متاحة حاليًا. تواصل معنا لإعادة تعيينها.' });
  const now = Date.now();
  const hits = (resetHits.get(req.ip) || []).filter((t) => now - t < RESET_TTL);
  if (hits.length >= 5) return res.status(429).json({ error: 'طلبات كثيرة، حاول بعد قليل' });
  resetHits.set(req.ip, [...hits, now]);

  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // نفس الرد دائمًا حتى لا يُعرف هل البريد مسجل أم لا
  const done = () => res.json({ ok: true });
  if (!user || user.suspended) return done();
  const recent = db.prepare('SELECT COUNT(*) n FROM password_resets WHERE user_id = ? AND created_at > ?').get(user.id, now - RESET_TTL).n;
  if (recent >= 3) return done();

  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').run(sha256(token), user.id, now + RESET_TTL, now);
  try {
    await mail.sendResetEmail(user.email, user.name, `${baseUrl(req)}/reset?token=${token}`);
  } catch (e) {
    console.error('reset email', e.message);
    return res.status(500).json({ error: 'تعذر إرسال البريد الآن، حاول لاحقًا أو تواصل معنا' });
  }
  done();
});

app.post('/api/auth/reset', (req, res) => {
  const token = String(req.body.token || '');
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
  const row = /^[a-f0-9]{64}$/.test(token) && db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(sha256(token));
  if (!row || row.used || row.expires_at < Date.now()) return res.status(400).json({ error: 'الرابط غير صالح أو منتهي. اطلب رابطًا جديدًا.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user || user.suspended) return res.status(400).json({ error: 'الرابط غير صالح' });
  // الاستخدام لمرة واحدة: التحديث مشروط بأن الرابط لم يُستخدم بعد
  if (db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ? AND used = 0').run(row.token_hash).changes !== 1) {
    return res.status(400).json({ error: 'الرابط مستخدم مسبقًا' });
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), user.id);
  db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // تسجيل الخروج من كل الأجهزة
  createSession(res, user.id);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => {
  if (req.cookies.sid) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

app.put('/api/me', requireAuth, (req, res) => {
  // الاسم ثابت كما سُجّل في العضوية (يظهر في كل ملفات الإنجاز) — تعديله من لوحة الإدارة فقط
  const phone = String(req.body.phone || '').trim();
  db.prepare('UPDATE users SET phone = ? WHERE id = ?').run(phone || null, req.user.id);
  if (req.body.newPassword) {
    const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(String(req.body.currentPassword || ''), u.password_hash)) return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    if (String(req.body.newPassword).length < 8) return res.status(400).json({ error: 'كلمة المرور الجديدة قصيرة' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(String(req.body.newPassword), 10), req.user.id);
  }
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// ---------- الاشتراكات ----------
app.get('/api/plans', (_req, res) => res.json({ plans: Object.values(payments.getPlans()), trialDays: payments.TRIAL_DAYS, currency: 'ر.س' }));

app.post('/api/subscribe', requireAuth, (req, res) => {
  try {
    const result = payments.createCheckout(req.user.id, String(req.body.plan), baseUrl(req), req.body.coupon);
    res.json({ ...result, subscription: payments.subscriptionInfo(req.user.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// التحقق من كود خصم قبل الدفع (يعرض السعر بعد الخصم لكل خطة)
app.post('/api/coupons/check', requireAuth, (req, res) => {
  const ev = payments.evaluateCoupon(req.body.code, req.user.id);
  if (!ev.ok) return res.status(400).json({ error: ev.error });
  res.json({ code: ev.coupon.code, label: ev.label, prices: ev.prices });
});

// ---------- ميسر ----------
// بعد الدفع يعيد ميسر المستخدم إلى هنا؛ نتحقق من العملية من خادم ميسر قبل التفعيل
app.get('/payments/moyasar/callback', async (req, res) => {
  try {
    const r = await payments.confirmMoyasarPayment(req.query.id);
    if (r.ok) return res.redirect('/subscribe?pay=success');
    console.warn('moyasar callback failed', req.query.id, r.reason);
    res.redirect('/subscribe?pay=failed&msg=' + encodeURIComponent(r.reason || String(req.query.message || '')));
  } catch (e) {
    console.error('moyasar callback', e);
    res.redirect('/subscribe?pay=failed&msg=' + encodeURIComponent('تعذر التحقق من عملية الدفع، تواصل معنا إن خُصم المبلغ'));
  }
});

// إشعار ميسر (Webhook): يضمن التفعيل حتى لو أغلق المستخدم الصفحة قبل الرجوع للموقع
app.post('/payments/moyasar/webhook', async (req, res) => {
  const secret = process.env.MOYASAR_WEBHOOK_SECRET;
  const given = String((req.body && req.body.secret_token) || '');
  const valid = secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!valid) return res.status(401).end();
  try {
    if (req.body.type === 'payment_paid' && req.body.data && req.body.data.id) await payments.confirmMoyasarPayment(req.body.data.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('moyasar webhook', e);
    res.status(500).end();
  }
});

// ---------- المشاريع ----------
const BLOCK_TYPES = new Set(['text', 'fields', 'table', 'images', 'links', 'quote']);
const PAGE_TYPES = new Set(['cover', 'opening', 'toc', 'section', 'backcover']);
const str = (v, max = 2000) => String(v ?? '').slice(0, max);
const FILE_ID = /^[a-f0-9]{32}$/;
const MAX_FILES_PER_ITEM = 20;
const newBundleId = () => crypto.randomBytes(16).toString('hex');

// يحدّث مجموعات الملفات (رمز QR لكل بند) ويحذف من البنود الملفات التي لا يملكها المعلم
function syncBundles(userId, data) {
  const owns = db.prepare('SELECT 1 FROM files WHERE id = ? AND user_id = ?');
  const upsert = db.prepare(`INSERT INTO bundles (id, user_id, title, files, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, files = excluded.files, updated_at = excluded.updated_at
    WHERE bundles.user_id = excluded.user_id`);
  for (const p of data.pages) {
    for (const b of p.blocks) {
      if (b.type !== 'links') continue;
      for (const it of b.items) {
        if (!it.files) continue;
        it.files = it.files.filter((f) => owns.get(f.id, userId));
        upsert.run(it.bundleId, userId, it.title, JSON.stringify(it.files.map((f) => f.id)));
      }
    }
  }
  return data;
}

function cleanData(data) {
  if (!data || !Array.isArray(data.pages)) throw new Error('بيانات غير صالحة');
  const settings = {
    theme: THEMES[data.settings?.theme] ? data.settings.theme : 'mint',
    layout: data.settings?.layout === 'single' ? 'single' : 'spread',
  };
  const pages = data.pages.slice(0, 200).filter((p) => PAGE_TYPES.has(p.type)).map((p) => ({
    id: str(p.id, 40) || newId(),
    type: p.type,
    title: str(p.title, 200),
    width: p.width === 'half' ? 'half' : 'full',
    ...(p.hideInToc ? { hideInToc: true } : {}),
    blocks: (Array.isArray(p.blocks) ? p.blocks : []).slice(0, 50).filter((b) => BLOCK_TYPES.has(b.type)).map((b) => {
      const base = { id: str(b.id, 40) || newId(), type: b.type, heading: str(b.heading, 200) };
      switch (b.type) {
        case 'text': return { ...base, html: cleanRich(str(b.html, 50000)) };
        case 'fields': return { ...base, items: (b.items || []).slice(0, 60).map((i) => ({ label: str(i.label, 200), value: str(i.value, 2000) })) };
        case 'table': {
          const columns = (b.columns || []).slice(0, 12).map((c) => str(c, 200));
          return { ...base, columns, rows: (b.rows || []).slice(0, 80).map((r) => columns.map((_, i) => str((r || [])[i], 1000))) };
        }
        case 'images': return { ...base, items: (b.items || []).slice(0, 24).map((i) => ({ uploadId: /^[a-f0-9]{24}$/.test(i.uploadId) ? i.uploadId : '', caption: str(i.caption, 300) })) };
        case 'links': return {
          ...base,
          items: (b.items || []).slice(0, 40).map((i) => {
            // الصيغة القديمة: ملف واحد في fileId
            const raw = Array.isArray(i.files) ? i.files : (FILE_ID.test(i.fileId) ? [{ id: i.fileId, name: i.fileName }] : []);
            const files = raw.filter((f) => f && FILE_ID.test(f.id)).slice(0, MAX_FILES_PER_ITEM).map((f) => ({ id: f.id, name: str(f.name, 200) }));
            return files.length
              ? { title: str(i.title, 200), url: '', files, bundleId: FILE_ID.test(i.bundleId) ? i.bundleId : newBundleId() }
              : { title: str(i.title, 200), url: str(i.url, 2000) };
          }),
        };
        case 'quote': return { ...base, text: str(b.text, 1000), author: str(b.author, 200) };
        default: return base;
      }
    }),
  }));
  return { settings, pages };
}

function loadProject(req, res) {
  const row = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!row) { res.status(404).json({ error: 'الملف غير موجود' }); return null; }
  return { ...row, data: applyAccountName(JSON.parse(row.data), req.user.name) };
}

app.get('/api/projects', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, title, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({ projects: rows });
});

app.post('/api/projects', requireAuth, (req, res) => {
  const title = str(req.body.title, 200).trim() || 'ملف إنجاز جديد';
  const data = createProjectData(req.user.name);
  if (THEMES[req.body.theme]) data.settings.theme = req.body.theme;
  const info = db.prepare('INSERT INTO projects (user_id, title, data) VALUES (?, ?, ?)').run(req.user.id, title, JSON.stringify(data));
  res.json({ id: Number(info.lastInsertRowid) });
});

app.get('/api/projects/:id', requireAuth, (req, res) => {
  const p = loadProject(req, res);
  if (p) res.json({ project: { id: p.id, title: p.title, data: p.data, updated_at: p.updated_at, baseUrl: baseUrl(req) } });
});

app.put('/api/projects/:id', requireAuth, (req, res) => {
  const p = loadProject(req, res);
  if (!p) return;
  try {
    const data = syncBundles(req.user.id, applyAccountName(cleanData(req.body.data), req.user.name));
    const title = str(req.body.title, 200).trim() || p.title;
    db.prepare("UPDATE projects SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?").run(title, JSON.stringify(data), p.id);
    res.json({ ok: true, updated_at: db.prepare('SELECT updated_at FROM projects WHERE id = ?').get(p.id).updated_at });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/projects/:id/duplicate', requireAuth, (req, res) => {
  const p = loadProject(req, res);
  if (!p) return;
  // النسخة تأخذ رموز QR جديدة حتى لا يؤثر تعديلها على الملف الأصلي
  const data = cleanData(p.data);
  data.pages.forEach((pg) => pg.blocks.forEach((b) => { if (b.type === 'links') b.items.forEach((it) => { if (it.files) it.bundleId = newBundleId(); }); }));
  syncBundles(req.user.id, data);
  const info = db.prepare('INSERT INTO projects (user_id, title, data) VALUES (?, ?, ?)').run(req.user.id, p.title + ' (نسخة)', JSON.stringify(data));
  res.json({ id: Number(info.lastInsertRowid) });
});

app.delete('/api/projects/:id', requireAuth, (req, res) => {
  const p = loadProject(req, res);
  if (!p) return;
  db.prepare('DELETE FROM projects WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

app.get('/api/projects/:id/preview', requireAuth, async (req, res, next) => {
  try {
    const p = loadProject(req, res);
    if (!p) return;
    // غير المشترك يرى المعاينة بعلامة مائية ولا يستطيع طباعتها
    res.type('html').send(await renderProject(p, { screen: true, baseUrl: baseUrl(req), watermark: !isSubscribed(req.user) }));
  } catch (e) { next(e); }
});

app.get('/api/projects/:id/pdf', requireAuth, requireActive, async (req, res, next) => {
  try {
    const p = loadProject(req, res);
    if (!p) return;
    const pdf = await projectToPdf(p, baseUrl(req));
    const name = encodeURIComponent((p.title || 'ملف-إنجاز').replace(/[\\/:*?"<>|]/g, '-') + '.pdf');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` });
    res.send(Buffer.from(pdf));
  } catch (e) { next(e); }
});

// ---------- شهادات الشكر والتقدير ----------
const UPLOAD_ID = /^[a-f0-9]{24}$/;
function cleanCert(userId, d) {
  const x = CertRender.normalize(d);
  const owns = db.prepare('SELECT 1 FROM uploads WHERE id = ? AND user_id = ?');
  const logo = (id) => (UPLOAD_ID.test(String(id || '')) && owns.get(id, userId) ? id : '');
  const sign = (s) => ({ label: str(s.label, 60), name: str(s.name, 80) });
  return {
    design: x.design, title: str(x.title, 80), intro: str(x.intro, 300), lead: str(x.lead, 300),
    names: x.names.slice(0, 300).map((n) => str(n, 80)), body: str(x.body, 1200), date: str(x.date, 80),
    sign1: sign(x.sign1), sign2: sign(x.sign2), logoRight: logo(x.logoRight), logoLeft: logo(x.logoLeft),
  };
}
function loadCert(req, res) {
  const row = db.prepare('SELECT * FROM certificates WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!row) { res.status(404).json({ error: 'الشهادة غير موجودة' }); return null; }
  return { ...row, data: JSON.parse(row.data) };
}
app.get('/api/certificates', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM certificates WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({ certificates: rows.map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at, data: JSON.parse(r.data) })), designs: CertRender.designs });
});
app.post('/api/certificates', requireAuth, (req, res) => {
  if (db.prepare('SELECT COUNT(*) n FROM certificates WHERE user_id = ?').get(req.user.id).n >= 200) return res.status(400).json({ error: 'وصلت للحد الأقصى من الشهادات' });
  const data = cleanCert(req.user.id, { design: req.body.design });
  const info = db.prepare('INSERT INTO certificates (user_id, title, data) VALUES (?, ?, ?)').run(req.user.id, str(req.body.title, 100) || 'شهادة شكر وتقدير', JSON.stringify(data));
  res.json({ id: Number(info.lastInsertRowid) });
});
app.get('/api/certificates/:id', requireAuth, (req, res) => {
  const c = loadCert(req, res);
  if (c) res.json({ certificate: { id: c.id, title: c.title, data: c.data, updated_at: c.updated_at }, designs: CertRender.designs });
});
app.put('/api/certificates/:id', requireAuth, (req, res) => {
  const c = loadCert(req, res);
  if (!c) return;
  const data = cleanCert(req.user.id, req.body.data);
  const title = str(req.body.title, 100) || c.title;
  db.prepare("UPDATE certificates SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?").run(title, JSON.stringify(data), c.id);
  res.json({ ok: true, data });
});
app.post('/api/certificates/:id/duplicate', requireAuth, (req, res) => {
  const c = loadCert(req, res);
  if (!c) return;
  const info = db.prepare('INSERT INTO certificates (user_id, title, data) VALUES (?, ?, ?)').run(req.user.id, str(c.title + ' (نسخة)', 100), JSON.stringify(c.data));
  res.json({ id: Number(info.lastInsertRowid) });
});
app.delete('/api/certificates/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM certificates WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});
app.get('/api/certificates/:id/pdf', requireAuth, requireActive, async (req, res, next) => {
  try {
    const c = loadCert(req, res);
    if (!c) return;
    const pdf = await certificateToPdf(c);
    const name = encodeURIComponent((c.title || 'شهادة').replace(/[\\/:*?"<>|]/g, '-') + '.pdf');
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename*=UTF-8''${name}` });
    res.send(Buffer.from(pdf));
  } catch (e) { next(e); }
});

// ---------- الصور ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)),
});

app.post('/api/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'الملف يجب أن يكون صورة (PNG, JPG, WEBP) بحجم أقل من 8MB' });
  db.prepare('INSERT INTO uploads (id, user_id, filename, mime, size) VALUES (?, ?, ?, ?, ?)')
    .run(req.file.filename, req.user.id, str(req.file.originalname, 200), req.file.mimetype, req.file.size);
  res.json({ id: req.file.filename });
});

// رابط عام للصورة يفتحها كاملة عند الضغط عليها في الملف — المعرّف عشوائي فلا يمكن تخمينه
app.get('/i/:id', (req, res) => {
  if (!/^[a-f0-9]{24}$/.test(req.params.id)) return res.status(404).send('الصورة غير موجودة');
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(req.params.id);
  const file = row && path.join(DATA_DIR, 'uploads', row.id);
  if (!row || !fs.existsSync(file)) return res.status(404).send('الصورة غير موجودة');
  res.set({ 'Content-Type': row.mime, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cache-Control': 'public, max-age=86400' });
  res.sendFile(file);
});

app.get('/api/uploads/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM uploads WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  const file = row && path.join(DATA_DIR, 'uploads', row.id);
  if (!row || !fs.existsSync(file)) return res.status(404).end();
  res.type(row.mime).set('Cache-Control', 'private, max-age=31536000').sendFile(file);
});

// ---------- ملفات الشواهد ----------
const ALLOWED_FILE = /^(application\/pdf|image\/(png|jpe?g|webp|gif)|application\/(msword|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet|presentationml\.presentation)|vnd\.ms-excel|vnd\.ms-powerpoint)|text\/plain|video\/mp4|audio\/mpeg)$/;
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'files'),
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(16).toString('hex')),
  }),
  limits: { fileSize: FILE_MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, ALLOWED_FILE.test(file.mimetype)),
});

app.post('/api/files', requireAuth, (req, res, next) => {
  fileUpload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `حجم الملف أكبر من ${FILE_MAX_MB} ميجابايت` : 'تعذر رفع الملف' });
    if (!req.file) return res.status(400).json({ error: 'نوع الملف غير مدعوم. المسموح: PDF، Word، Excel، PowerPoint، الصور، MP4' });
    const used = db.prepare('SELECT COALESCE(SUM(size),0) AS s FROM files WHERE user_id = ?').get(req.user.id).s;
    if (used + req.file.size > STORAGE_QUOTA_MB * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'تجاوزت المساحة المتاحة لحسابك' });
    }
    // multer يقرأ أسماء الملفات العربية بترميز latin1
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    db.prepare('INSERT INTO files (id, user_id, filename, mime, size) VALUES (?, ?, ?, ?, ?)')
      .run(req.file.filename, req.user.id, str(name, 200), req.file.mimetype, req.file.size);
    res.json({ id: req.file.filename, name, url: `${baseUrl(req)}/f/${req.file.filename}` });
  });
});

// رابط عام للملف (هو ما يفتحه رمز QR) — الرمز عشوائي وطويل فلا يمكن تخمينه
app.get('/f/:id', (req, res) => {
  if (!FILE_ID.test(req.params.id)) return res.status(404).send('الملف غير موجود');
  const row = db.prepare('SELECT * FROM files WHERE id = ?').get(req.params.id);
  const file = row && path.join(DATA_DIR, 'files', row.id);
  if (!row || !fs.existsSync(file)) return res.status(404).send('الملف غير موجود');
  const inline = /^(application\/pdf|image\/|video\/|audio\/|text\/plain)/.test(row.mime);
  res.set({
    'Content-Type': row.mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
    'Cache-Control': 'public, max-age=86400',
  });
  res.sendFile(file);
});

// متاح بدون تسجيل دخول لتجربة رمز QR في الصفحة الرئيسية (نص قصير فقط)
// صفحة بند الشواهد (يفتحها رمز QR): ملف واحد يُفتح مباشرة، وأكثر من ملف تظهر قائمة بها
const FILE_KIND = (mime) => (/pdf/.test(mime) ? ['PDF', '#c4534a'] : /word/.test(mime) ? ['Word', '#2b5797'] : /sheet|excel/.test(mime) ? ['Excel', '#1e7145']
  : /presentation|powerpoint/.test(mime) ? ['عرض', '#c55a11'] : /^image\//.test(mime) ? ['صورة', '#5f978f'] : /^video\//.test(mime) ? ['فيديو', '#7c6aa8']
  : /^audio\//.test(mime) ? ['صوت', '#7c6aa8'] : ['ملف', '#6c7471']);
const fmtSize = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' م.ب' : Math.max(1, Math.round(n / 1024)) + ' ك.ب');
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

app.get('/b/:id', (req, res) => {
  if (!FILE_ID.test(req.params.id)) return res.status(404).send('الصفحة غير موجودة');
  const bundle = db.prepare('SELECT b.*, u.name AS teacher FROM bundles b JOIN users u ON u.id = b.user_id WHERE b.id = ?').get(req.params.id);
  if (!bundle) return res.status(404).send('الصفحة غير موجودة');
  const get = db.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?');
  const files = JSON.parse(bundle.files).map((id) => get.get(id, bundle.user_id)).filter(Boolean);
  if (files.length === 1) return res.redirect(302, `/f/${files[0].id}`);
  const cards = files.map((f) => {
    const [kind, color] = FILE_KIND(f.mime);
    const thumb = /^image\//.test(f.mime) ? `<img src="/f/${f.id}" alt="" loading="lazy">` : `<span class="ic" style="background:${color}">${kind}</span>`;
    return `<a class="card" href="/f/${f.id}" target="_blank" rel="noopener">${thumb}<span class="nm">${escHtml(f.filename)}</span><span class="meta">${kind} · ${fmtSize(f.size)}</span><span class="go">فتح ←</span></a>`;
  }).join('');
  res.set({ 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self'", 'X-Content-Type-Options': 'nosniff' });
  res.type('html').send(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(bundle.title || 'الشواهد')}</title><style>
@font-face{font-family:'Tajawal';font-weight:500;src:url(/fonts/tajawal/files/tajawal-arabic-500-normal.woff2) format('woff2')}
@font-face{font-family:'Tajawal';font-weight:800;src:url(/fonts/tajawal/files/tajawal-arabic-800-normal.woff2) format('woff2')}
*{box-sizing:border-box}body{margin:0;font-family:'Tajawal',system-ui,sans-serif;background:#f6f4f0;color:#2f3432}
header{background:#5f978f;background-image:repeating-linear-gradient(45deg,rgba(255,255,255,.12) 0 10px,transparent 10px 30px);color:#fff;padding:34px 16px 54px;text-align:center}
header small{opacity:.85}header h1{margin:.3em 0 .1em;font-size:1.6em;font-weight:800}
main{max-width:720px;margin:-30px auto 40px;padding:0 16px;display:grid;gap:10px}
.card{display:grid;grid-template-columns:56px 1fr auto;grid-template-rows:auto auto;column-gap:14px;align-items:center;background:#fff;border:1px solid #e4e0d9;border-radius:14px;padding:12px 14px;text-decoration:none;color:inherit;box-shadow:0 2px 10px rgba(30,40,38,.06)}
.card:hover{border-color:#5f978f}
.card img,.card .ic{grid-row:1 / 3;width:56px;height:56px;border-radius:10px;object-fit:cover}
.card .ic{display:grid;place-items:center;color:#fff;font-weight:800;font-size:.8em}
.nm{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{color:#6c7471;font-size:.85em}
.go{grid-row:1 / 3;grid-column:3;color:#467a73;font-weight:800;white-space:nowrap}
footer{text-align:center;color:#6c7471;font-size:.85em;padding-bottom:30px}
</style></head><body><header><small>${escHtml(bundle.teacher)}</small><h1>${escHtml(bundle.title || 'الشواهد')}</h1><small>${files.length} ملفات</small></header>
<main>${cards || '<p style="text-align:center">لا توجد ملفات في هذا البند حاليًا.</p>'}</main><footer>مركز المعلم</footer></body></html>`);
});

app.get('/api/qr', async (req, res) => {
  const u = str(req.query.u, req.user ? 2000 : 300);
  if (!u) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(u, { type: 'svg', margin: 1 }));
});

app.get('/api/themes', (_req, res) => res.json({ themes: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, colors: [t.frame, t.accent, t.accent2, t.panel] })) }));

// ---------- لوحة الإدارة ----------
const targetUser = (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) { res.status(404).json({ error: 'المستخدم غير موجود' }); return null; }
  return u;
};
const notSelf = (req, res, u) => {
  if (u.id === req.user.id) { res.status(400).json({ error: 'لا يمكن تنفيذ هذا الإجراء على حسابك أنت' }); return false; }
  return true;
};

// قائمة المعلمين مع البحث بالاسم أو البريد أو الجوال
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const q = str(req.query.q, 100).trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const where = q ? 'WHERE u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?' : '';
  const args = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
  const total = db.prepare(`SELECT COUNT(*) AS n FROM users u ${where}`).get(...args).n;
  const users = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.created_at, u.is_admin, u.suspended,
      (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset)
    .map((u) => ({ ...u, subscription: payments.subscriptionInfo(u.id) }));
  res.json({ users, total });
});

app.get('/api/admin/summary', requireAdmin, (_req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 0').get().n;
  const active = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM subscriptions WHERE status IN ('active','trialing') AND current_period_end > ?").get(Date.now()).n;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'paid'").get().t / 100;
  const month = new Date().toISOString().slice(0, 7);
  const newThisMonth = db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 0 AND substr(created_at,1,7) = ?').get(month).n;
  const revenueThisMonth = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payments WHERE status = 'paid' AND substr(created_at,1,7) = ?").get(month).t / 100;
  res.json({ users, active, revenue, newThisMonth, revenueThisMonth });
});

app.put('/api/admin/users/:id/name', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u) return;
  const name = str(req.body.name, 100).trim();
  if (name.length < 2) return res.status(400).json({ error: 'الاسم مطلوب' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, u.id);
  res.json({ ok: true });
});

// إضافة مدة اشتراك (+ تسجيلها كدفعة مستلمة اختياريًا)
app.post('/api/admin/users/:id/grant', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u) return;
  const plan = payments.getPlans()[req.body.plan] ? req.body.plan : 'monthly';
  const ref = req.body.record ? payments.recordManualPayment(u.id, plan, req.user.id) : 'by-' + req.user.id;
  payments.activate(u.id, plan, 'admin', ref);
  res.json({ ok: true, subscription: payments.subscriptionInfo(u.id) });
});

// إلغاء الاشتراك أو تحديد تاريخ انتهائه
app.post('/api/admin/users/:id/subscription', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u) return;
  if (req.body.action === 'cancel') {
    payments.cancelSubscription(u.id);
  } else if (req.body.action === 'set') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body.endsAt || ''));
    const end = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], 23, 59, 59) : NaN;
    if (!m || Number.isNaN(end) || end <= Date.now()) return res.status(400).json({ error: 'اختر تاريخًا صحيحًا في المستقبل' });
    payments.setSubscriptionEnd(u.id, end, req.body.plan);
  } else {
    return res.status(400).json({ error: 'إجراء غير معروف' });
  }
  res.json({ ok: true, subscription: payments.subscriptionInfo(u.id) });
});

// إعادة تعيين كلمة المرور: تُنشأ كلمة جديدة وتظهر للمدير مرة واحدة، وتُسجَّل خروج المعلم من كل الأجهزة
app.post('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u) return;
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const password = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join('');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 10), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ password });
});

// إيقاف الحساب أو إعادة تفعيله
app.post('/api/admin/users/:id/suspend', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u || !notSelf(req, res, u)) return;
  const suspended = req.body.suspended ? 1 : 0;
  db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended, u.id);
  if (suspended) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  res.json({ ok: true, suspended: !!suspended });
});

// حذف الحساب نهائيًا مع ملفاته وصوره وشواهده
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = targetUser(req, res); if (!u || !notSelf(req, res, u)) return;
  if (String(req.body.confirm || '').trim().toLowerCase() !== u.email) return res.status(400).json({ error: 'اكتب بريد المعلم للتأكيد' });
  for (const r of db.prepare('SELECT id FROM uploads WHERE user_id = ?').all(u.id)) fs.unlink(path.join(DATA_DIR, 'uploads', r.id), () => {});
  for (const r of db.prepare('SELECT id FROM files WHERE user_id = ?').all(u.id)) fs.unlink(path.join(DATA_DIR, 'files', r.id), () => {});
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});

// سجل المدفوعات
app.get('/api/admin/payments', requireAdmin, (req, res) => {
  const status = ['paid', 'pending'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT p.id, p.plan, p.amount, p.status, p.provider, p.provider_ref, p.created_at, u.name, u.email, c.code AS coupon
      FROM payments p JOIN users u ON u.id = p.user_id LEFT JOIN coupons c ON c.id = p.coupon_id
      ${status ? 'WHERE p.status = ?' : ''} ORDER BY p.id DESC LIMIT 300`).all(...(status ? [status] : []));
  res.json({ payments: rows.map((r) => ({ ...r, amount: r.amount / 100 })) });
});

// إحصائيات للرسوم البيانية: آخر 30 يومًا أو آخر 12 شهرًا
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const months = req.query.range === 'months';
  const keyLen = months ? 7 : 10;
  const keys = [];
  const now = new Date();
  for (let i = months ? 11 : 29; i >= 0; i--) {
    const d = months ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    keys.push(d.toISOString().slice(0, keyLen));
  }
  const since = months ? keys[0] + '-01' : keys[0];
  const group = (sql) => Object.fromEntries(db.prepare(sql).all(since).map((r) => [r.k, r.v]));
  const reg = group(`SELECT substr(created_at,1,${keyLen}) AS k, COUNT(*) AS v FROM users WHERE created_at >= ? GROUP BY k`);
  const subs = group(`SELECT substr(created_at,1,${keyLen}) AS k, COUNT(*) AS v FROM subscriptions WHERE plan != 'trial' AND provider_ref IS NOT 'set-end' AND created_at >= ? GROUP BY k`);
  const rev = group(`SELECT substr(created_at,1,${keyLen}) AS k, SUM(amount) / 100.0 AS v FROM payments WHERE status = 'paid' AND created_at >= ? GROUP BY k`);
  res.json({ range: months ? 'months' : 'days', points: keys.map((k) => ({ key: k, registrations: reg[k] || 0, subscriptions: subs[k] || 0, revenue: rev[k] || 0 })) });
});

// إصدار الموقع الحالي (رقم آخر تعديل من GitHub) — للتأكد من وصول التحديثات
const STARTED_AT = Date.now();
app.get('/api/admin/version', requireAdmin, (_req, res) => {
  const [commit, date] = String(process.env.APP_VERSION || '').split('|');
  res.json({ commit: commit || null, date: date || null, startedAt: STARTED_AT });
});

// أكواد الخصم
const couponView = (c) => ({ ...c, active: !!c.active, uses: payments.couponUses(c.id) });
app.get('/api/admin/coupons', requireAdmin, (_req, res) => {
  res.json({ coupons: db.prepare('SELECT * FROM coupons ORDER BY id DESC').all().map(couponView) });
});
app.post('/api/admin/coupons', requireAdmin, (req, res) => {
  const code = payments.normCode(req.body.code);
  const type = req.body.type === 'amount' ? 'amount' : 'percent';
  const value = Number(req.body.value);
  const plans = ['monthly', 'yearly'].includes(req.body.plans) ? req.body.plans : 'all';
  const maxUses = req.body.maxUses === '' || req.body.maxUses == null ? null : Math.floor(Number(req.body.maxUses));
  let expiresAt = null;
  if (req.body.expiresAt) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.body.expiresAt));
    if (!m) return res.status(400).json({ error: 'تاريخ الانتهاء غير صحيح' });
    expiresAt = Date.UTC(+m[1], +m[2] - 1, +m[3], 20, 59, 59); // نهاية اليوم بتوقيت السعودية
  }
  if (!payments.CODE_RE.test(code)) return res.status(400).json({ error: 'الكود من 3 إلى 30 حرفًا عربيًا أو إنجليزيًا أو رقمًا (بدون مسافات)' });
  if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 100) || (type === 'amount' && value > 10000)) {
    return res.status(400).json({ error: type === 'percent' ? 'نسبة الخصم بين 1 و100' : 'مبلغ الخصم غير صحيح' });
  }
  if (maxUses != null && (!Number.isFinite(maxUses) || maxUses < 1)) return res.status(400).json({ error: 'عدد مرات الاستخدام غير صحيح' });
  if (payments.findCoupon(code)) return res.status(409).json({ error: 'هذا الكود موجود مسبقًا' });
  const info = db.prepare('INSERT INTO coupons (code, type, value, plans, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(code, type, value, plans, maxUses, expiresAt);
  res.json({ coupon: couponView(db.prepare('SELECT * FROM coupons WHERE id = ?').get(Number(info.lastInsertRowid))) });
});
app.put('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  const r = db.prepare('UPDATE coupons SET active = ? WHERE id = ?').run(req.body.active ? 1 : 0, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'الكود غير موجود' });
  res.json({ ok: true });
});
app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// إعدادات الموقع (الأسعار)
app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  const p = payments.getPlans();
  res.json({
    priceMonthly: p.monthly.price, priceYearly: p.yearly.price,
    methods: payments.paymentMethods(), samsungServiceId: payments.samsungServiceId(),
    appleDomainFile: !!payments.getSetting('apple_domain_file'),
  });
});

// طرق الدفع الإضافية (Apple Pay / STC Pay / Samsung Pay) وملف توثيق دومين Apple Pay
app.put('/api/admin/payment-methods', requireAdmin, (req, res) => {
  const methods = (Array.isArray(req.body.methods) ? req.body.methods : []).filter((m) => payments.PAY_METHODS.includes(m));
  payments.setSetting('pay_methods', ['creditcard', ...methods.filter((m) => m !== 'creditcard')].join(','));
  if (req.body.samsungServiceId !== undefined) payments.setSetting('samsung_service_id', String(req.body.samsungServiceId).trim().slice(0, 200));
  if (typeof req.body.appleDomainFile === 'string' && req.body.appleDomainFile.trim()) {
    if (req.body.appleDomainFile.length > 20000) return res.status(400).json({ error: 'ملف التوثيق أكبر من المتوقع — تأكد أنك اخترت الملف الصحيح' });
    payments.setSetting('apple_domain_file', req.body.appleDomainFile.trim());
  }
  res.json({ ok: true });
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const m = Number(req.body.priceMonthly), y = Number(req.body.priceYearly);
  const ok = (v) => Number.isFinite(v) && v >= 1 && v <= 10000;
  if (!ok(m) || !ok(y)) return res.status(400).json({ error: 'الأسعار يجب أن تكون بين 1 و10000 ريال' });
  payments.setSetting('price_monthly', Math.round(m * 100) / 100);
  payments.setSetting('price_yearly', Math.round(y * 100) / 100);
  res.json({ ok: true });
});

// ---------- الصفحات ----------
app.use('/vendor/moyasar', express.static(path.join(__dirname, '..', 'node_modules', 'moyasar-payment-form', 'dist'), { maxAge: '7d' }));
app.use('/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource'), { maxAge: '30d' }));
app.get(['/', '/index.html'], (req, res) => res.type('html').send(seo.renderHome(PUBLIC, baseUrl(req), payments.getPlans())));
// ملف توثيق الدومين لـ Apple Pay (يُرفع من لوحة الإدارة)
app.get('/.well-known/apple-developer-merchantid-domain-association', (_req, res) => {
  const f = payments.getSetting('apple_domain_file');
  if (!f) return res.status(404).end();
  res.type('text/plain').send(f);
});
app.get('/robots.txt', (req, res) => res.type('text/plain').send(seo.robots(baseUrl(req))));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(seo.sitemap(baseUrl(req), PUBLIC)));
app.use(express.static(PUBLIC, { extensions: ['html'] }));
const pageRoutes = { '/login': 'auth.html', '/register': 'auth.html', '/forgot': 'forgot.html', '/reset': 'forgot.html', '/app': 'app.html', '/subscribe': 'subscribe.html', '/admin': 'admin.html' };
Object.entries(pageRoutes).forEach(([route, file]) => app.get(route, (_req, res) => res.sendFile(path.join(PUBLIC, file))));
app.get('/editor/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'editor.html')));
app.get('/certificate/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'certificate.html')));
app.get('/assets/fonts.css', (_req, res) => res.type('text/css').set('Cache-Control', 'public, max-age=86400').send(fontCss(false)));
app.get('/assets/js/cert-render.js', (_req, res) => res.type('application/javascript').sendFile(path.join(__dirname, 'cert-render.js')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`✓ المنصة تعمل على http://localhost:${PORT}`));
}

module.exports = app;
