// إدارة الاشتراكات والدفع.
// المزوّدات: moyasar (بوابة ميسر) | manual (المدير يفعّل من لوحة الإدارة) | mock (يفعّل بدون دفع — للتطوير فقط).
const crypto = require('crypto');
const { db } = require('./db');

const DAY = 24 * 60 * 60 * 1000;

const PLANS = {
  monthly: { id: 'monthly', name: 'اشتراك شهري', price: Number(process.env.PRICE_MONTHLY || 29), days: 30 },
  yearly: { id: 'yearly', name: 'اشتراك سنوي', price: Number(process.env.PRICE_YEARLY || 199), days: 365 },
};
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0);
const PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';

// ميسر: المفتاح العام للنموذج في المتصفح، والسري للتحقق من الدفع من الخادم فقط
const MOYASAR = {
  publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
  secretKey: process.env.MOYASAR_SECRET_KEY || '',
  apiBase: (process.env.MOYASAR_API_BASE || 'https://api.moyasar.com').replace(/\/+$/, ''),
  methods: (process.env.MOYASAR_METHODS || 'creditcard').split(',').map((m) => m.trim()).filter(Boolean),
};
if (PROVIDER === 'moyasar' && (!MOYASAR.publishableKey || !MOYASAR.secretKey)) {
  console.warn('⚠ PAYMENT_PROVIDER=moyasar لكن MOYASAR_PUBLISHABLE_KEY أو MOYASAR_SECRET_KEY غير مضبوط — الدفع لن يعمل');
}

function currentSubscription(userId) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY current_period_end DESC LIMIT 1').get(userId) || null;
}

function isActive(sub) {
  return !!sub && (sub.status === 'active' || sub.status === 'trialing') && sub.current_period_end > Date.now();
}

function startTrial(userId) {
  if (TRIAL_DAYS <= 0) return;
  db.prepare('INSERT INTO subscriptions (user_id, plan, status, current_period_end, provider) VALUES (?, ?, ?, ?, ?)')
    .run(userId, 'trial', 'trialing', Date.now() + TRIAL_DAYS * DAY, 'system');
}

function activate(userId, planId, provider, ref) {
  const plan = PLANS[planId];
  const sub = currentSubscription(userId);
  // يُضاف الوقت المتبقي من الاشتراك الحالي المدفوع (وليس التجربة)
  const base = sub && sub.status === 'active' && sub.current_period_end > Date.now() ? sub.current_period_end : Date.now();
  db.prepare('INSERT INTO subscriptions (user_id, plan, status, current_period_end, provider, provider_ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, planId, 'active', base + plan.days * DAY, provider, ref || null);
}

// يجهّز الدفع: يفعّل مباشرة في الوضع التجريبي، أو يُرجع إعدادات نموذج ميسر
function createCheckout(userId, planId, baseUrl) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('خطة غير معروفة');
  // التفعيل اليدوي: المدير يفعّل الاشتراك من لوحة الإدارة بعد استلام المبلغ
  if (PROVIDER === 'manual') throw new Error('التفعيل حاليًا يتم يدويًا. تواصل معنا لإتمام الدفع وسيُفعّل اشتراكك مباشرة.');
  if (PROVIDER === 'moyasar' && (!MOYASAR.publishableKey || !MOYASAR.secretKey)) throw new Error('بوابة الدفع غير مهيأة. تواصل مع الدعم.');

  const token = crypto.randomBytes(16).toString('hex');
  const amount = Math.round(plan.price * 100); // بالهللة
  const info = db.prepare('INSERT INTO payments (user_id, plan, amount, status, provider, token) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, planId, amount, 'pending', PROVIDER, token);
  const paymentId = Number(info.lastInsertRowid);

  if (PROVIDER === 'mock') {
    db.prepare("UPDATE payments SET status = 'paid', provider_ref = ? WHERE id = ?").run('mock-' + paymentId, paymentId);
    activate(userId, planId, 'mock', 'mock-' + paymentId);
    return { done: true };
  }
  if (PROVIDER === 'moyasar') {
    return {
      provider: 'moyasar',
      form: {
        publishable_api_key: MOYASAR.publishableKey,
        amount,
        currency: 'SAR',
        description: `${plan.name} — ملف إنجاز المعلم`,
        callback_url: `${baseUrl}/payments/moyasar/callback`,
        methods: MOYASAR.methods,
        supported_networks: ['mada', 'visa', 'mastercard'],
        metadata: { ref: token },
        ...(process.env.MOYASAR_API_BASE ? { base_url: MOYASAR.apiBase } : {}),
      },
    };
  }
  throw new Error('بوابة الدفع غير مهيأة بعد');
}

// يتحقق من عملية الدفع مباشرة من ميسر ثم يفعّل الاشتراك (آمن للتكرار: لا يفعّل نفس الدفعة مرتين)
async function confirmMoyasarPayment(moyasarId) {
  if (!/^[\w-]{8,64}$/.test(String(moyasarId || ''))) return { ok: false, reason: 'معرّف الدفع غير صالح' };
  const res = await fetch(`${MOYASAR.apiBase}/v1/payments/${encodeURIComponent(moyasarId)}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR.secretKey + ':').toString('base64') },
  });
  if (!res.ok) return { ok: false, reason: 'تعذر التحقق من عملية الدفع' };
  const p = await res.json();
  const row = p.metadata && p.metadata.ref ? db.prepare('SELECT * FROM payments WHERE token = ?').get(String(p.metadata.ref)) : null;
  if (!row) return { ok: false, reason: 'عملية دفع غير معروفة' };
  if (row.status === 'paid') return { ok: row.provider_ref === p.id, userId: row.user_id, already: true };
  if (p.status !== 'paid') {
    return { ok: false, reason: (p.source && p.source.message) || 'لم تكتمل عملية الدفع' };
  }
  if (p.amount !== row.amount || String(p.currency).toUpperCase() !== 'SAR') return { ok: false, reason: 'مبلغ الدفع لا يطابق الخطة' };
  if (db.prepare('SELECT 1 FROM payments WHERE provider_ref = ?').get(p.id)) return { ok: false, reason: 'عملية الدفع مستخدمة مسبقًا' };
  // التحديث مشروط بأن الحالة ما زالت pending حتى لا يُفعَّل نفس الطلب مرتين بالتوازي
  const upd = db.prepare("UPDATE payments SET status = 'paid', provider_ref = ? WHERE id = ? AND status = 'pending'").run(p.id, row.id);
  if (upd.changes === 1) activate(row.user_id, row.plan, 'moyasar', p.id);
  return { ok: true, userId: row.user_id };
}

function subscriptionInfo(userId) {
  const sub = currentSubscription(userId);
  return {
    active: isActive(sub),
    status: sub ? sub.status : 'none',
    plan: sub ? sub.plan : null,
    endsAt: sub ? sub.current_period_end : null,
    provider: PROVIDER,
  };
}

module.exports = { PLANS, TRIAL_DAYS, PROVIDER, startTrial, activate, createCheckout, confirmMoyasarPayment, subscriptionInfo, isActive, currentSubscription };
