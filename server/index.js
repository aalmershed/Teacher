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
const { renderProject, THEMES, cleanRich } = require('./render');
const { projectToPdf } = require('./pdf');
const payments = require('./payments');

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
    const row = db.prepare('SELECT u.id, u.name, u.email, u.phone, u.is_admin, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
    if (row && row.expires_at > Date.now()) req.user = row;
  }
  next();
});

const requireAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'يجب تسجيل الدخول' }));
const requireActive = (req, res, next) => {
  if (payments.subscriptionInfo(req.user.id).active || req.user.is_admin) return next();
  res.status(402).json({ error: 'اشتراكك غير مفعل. فعّل اشتراكك للمتابعة.', code: 'SUBSCRIPTION_REQUIRED' });
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
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
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
app.get('/api/plans', (_req, res) => res.json({ plans: Object.values(payments.PLANS), trialDays: payments.TRIAL_DAYS, currency: 'ر.س' }));

app.post('/api/subscribe', requireAuth, (req, res) => {
  try {
    const result = payments.createCheckout(req.user.id, String(req.body.plan));
    res.json({ ...result, subscription: payments.subscriptionInfo(req.user.id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
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

app.post('/api/projects', requireAuth, requireActive, (req, res) => {
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

app.put('/api/projects/:id', requireAuth, requireActive, (req, res) => {
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

app.post('/api/projects/:id/duplicate', requireAuth, requireActive, (req, res) => {
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
    res.type('html').send(await renderProject(p, { screen: true, baseUrl: baseUrl(req) }));
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

// ---------- الصور ----------
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(DATA_DIR, 'uploads'),
    filename: (_req, _file, cb) => cb(null, crypto.randomBytes(12).toString('hex')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)),
});

app.post('/api/uploads', requireAuth, requireActive, upload.single('file'), (req, res) => {
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

app.post('/api/files', requireAuth, requireActive, (req, res, next) => {
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
<main>${cards || '<p style="text-align:center">لا توجد ملفات في هذا البند حاليًا.</p>'}</main><footer>ملف إنجاز</footer></body></html>`);
});

app.get('/api/qr', async (req, res) => {
  const u = str(req.query.u, req.user ? 2000 : 300);
  if (!u) return res.status(400).end();
  res.type('image/svg+xml').send(await QRCode.toString(u, { type: 'svg', margin: 1 }));
});

app.get('/api/themes', (_req, res) => res.json({ themes: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, colors: [t.frame, t.accent, t.accent2, t.panel] })) }));

// ---------- لوحة الإدارة ----------
app.get('/api/admin/users', requireAdmin, (_req, res) => {
  const users = db.prepare(`SELECT u.id, u.name, u.email, u.phone, u.created_at,
      (SELECT COUNT(*) FROM projects p WHERE p.user_id = u.id) AS projects FROM users u ORDER BY u.id DESC`).all()
    .map((u) => ({ ...u, subscription: payments.subscriptionInfo(u.id) }));
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE status = 'paid'").get().total;
  res.json({ users, stats: { users: users.length, active: users.filter((u) => u.subscription.active).length, revenue: paid / 100 } });
});

app.put('/api/admin/users/:id/name', requireAdmin, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) return res.status(400).json({ error: 'الاسم مطلوب' });
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/grant', requireAdmin, (req, res) => {
  const plan = payments.PLANS[req.body.plan] ? req.body.plan : 'monthly';
  payments.activate(Number(req.params.id), plan, 'admin', 'by-' + req.user.id);
  res.json({ ok: true });
});

// ---------- الصفحات ----------
app.use('/fonts', express.static(path.join(__dirname, '..', 'node_modules', '@fontsource'), { maxAge: '30d' }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));
const pageRoutes = { '/login': 'auth.html', '/register': 'auth.html', '/app': 'app.html', '/subscribe': 'subscribe.html', '/admin': 'admin.html' };
Object.entries(pageRoutes).forEach(([route, file]) => app.get(route, (_req, res) => res.sendFile(path.join(PUBLIC, file))));
app.get('/editor/:id', (_req, res) => res.sendFile(path.join(PUBLIC, 'editor.html')));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'حدث خطأ غير متوقع' });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`✓ المنصة تعمل على http://localhost:${PORT}`));
}

module.exports = app;
