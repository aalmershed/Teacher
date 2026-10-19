// إدارة الاشتراكات والدفع.
// المزوّدات: moyasar (بوابة ميسر) | manual (المدير يفعّل من لوحة الإدارة) | mock (يفعّل بدون دفع — للتطوير فقط).
const crypto = require('crypto');
const { db } = require('./db');

const DAY = 24 * 60 * 60 * 1000;

// إعدادات تُعدّل من لوحة الإدارة (مثل الأسعار)، والقيمة الافتراضية من متغيرات البيئة
const getSetting = (key) => { const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key); return r ? r.value : null; };
const setSetting = (key, value) => db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));

function getPlans() {
  const price = (key, env, def) => Number(getSetting(key) ?? process.env[env] ?? def);
  return {
    monthly: { id: 'monthly', name: 'اشتراك شهري', price: price('price_monthly', 'PRICE_MONTHLY', 29), days: 30 },
    yearly: { id: 'yearly', name: 'اشتراك سنوي', price: price('price_yearly', 'PRICE_YEARLY', 199), days: 365 },
  };
}
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0);
const PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';

// ميسر: المفتاح العام للنموذج في المتصفح، والسري للتحقق من الدفع من الخادم فقط
const MOYASAR = {
  publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
  secretKey: process.env.MOYASAR_SECRET_KEY || '',
  apiBase: (process.env.MOYASAR_API_BASE || 'https://api.moyasar.com').replace(/\/+$/, ''),
};

// طرق الدفع: تُختار من لوحة الإدارة، والافتراضي من متغيرات البيئة. البطاقات (مدى/فيزا/ماستركارد) مفعّلة دائمًا
const PAY_METHODS = ['creditcard', 'applepay', 'stcpay', 'samsungpay'];
function paymentMethods() {
  const raw = getSetting('pay_methods') ?? process.env.MOYASAR_METHODS ?? 'creditcard';
  const list = raw.split(',').map((m) => m.trim()).filter((m) => PAY_METHODS.includes(m));
  return ['creditcard', ...list.filter((m) => m !== 'creditcard')];
}
const samsungServiceId = () => getSetting('samsung_service_id') ?? process.env.MOYASAR_SAMSUNG_SERVICE_ID ?? '';
if (PROVIDER === 'moyasar' && (!MOYASAR.publishableKey || !MOYASAR.secretKey)) {
  console.warn('⚠ PAYMENT_PROVIDER=moyasar لكن MOYASAR_PUBLISHABLE_KEY أو MOYASAR_SECRET_KEY غير مضبوط — الدفع لن يعمل');
}

function currentSubscription(userId) {
  // الاشتراك الفعال أولًا (حتى لو كان لاشتراك ملغى تاريخ أبعد)، ثم الأحدث انتهاءً
  return db.prepare(`SELECT * FROM subscriptions WHERE user_id = ?
    ORDER BY (status IN ('active','trialing') AND current_period_end > ?) DESC, current_period_end DESC LIMIT 1`).get(userId, Date.now()) || null;
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
  const plan = getPlans()[planId];
  const sub = currentSubscription(userId);
  // يُضاف الوقت المتبقي من الاشتراك الحالي المدفوع (وليس التجربة)
  const base = sub && sub.status === 'active' && sub.current_period_end > Date.now() ? sub.current_period_end : Date.now();
  db.prepare('INSERT INTO subscriptions (user_id, plan, status, current_period_end, provider, provider_ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, planId, 'active', base + plan.days * DAY, provider, ref || null);
}

// ---------- أكواد الخصم ----------
const normCode = (c) => String(c || '').trim().toUpperCase();
const couponUses = (id) => db.prepare('SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = ?').get(id).n;

// يتحقق من الكود لهذا المستخدم ويحسب السعر بعد الخصم لكل خطة
function evaluateCoupon(code, userId) {
  const c = db.prepare('SELECT * FROM coupons WHERE code = ?').get(normCode(code));
  if (!c || !c.active) return { ok: false, error: 'كود الخصم غير صحيح' };
  if (c.expires_at && c.expires_at < Date.now()) return { ok: false, error: 'انتهت صلاحية كود الخصم' };
  if (c.max_uses != null && couponUses(c.id) >= c.max_uses) return { ok: false, error: 'وصل كود الخصم للحد الأقصى من الاستخدام' };
  if (db.prepare('SELECT 1 FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?').get(c.id, userId)) return { ok: false, error: 'استخدمت هذا الكود من قبل' };
  const prices = {};
  for (const p of Object.values(getPlans())) {
    const applies = c.plans === 'all' || c.plans === p.id;
    let final = p.price;
    if (applies) final = c.type === 'percent' ? p.price * (1 - c.value / 100) : p.price - c.value;
    final = Math.max(0, Math.round(final * 100) / 100);
    if (final < 1) final = 0; // أقل من ريال = مجاني
    prices[p.id] = { price: p.price, final, applies };
  }
  return { ok: true, coupon: c, prices, label: c.type === 'percent' ? `خصم ${c.value}%` : `خصم ${c.value} ر.س` };
}

function redeemCoupon(couponId, userId, paymentId) {
  if (!couponId) return;
  db.prepare('INSERT INTO coupon_redemptions (coupon_id, user_id, payment_id) VALUES (?, ?, ?)').run(couponId, userId, paymentId || null);
}

// يجهّز الدفع: يفعّل مباشرة في الوضع التجريبي أو عند خصم 100%، أو يُرجع إعدادات نموذج ميسر
function createCheckout(userId, planId, baseUrl, couponCode) {
  const plan = getPlans()[planId];
  if (!plan) throw new Error('خطة غير معروفة');

  let coupon = null, price = plan.price;
  if (normCode(couponCode)) {
    const ev = evaluateCoupon(couponCode, userId);
    if (!ev.ok) throw new Error(ev.error);
    if (!ev.prices[planId].applies) throw new Error('كود الخصم لا ينطبق على هذه الخطة');
    coupon = ev.coupon;
    price = ev.prices[planId].final;
  }
  const amount = Math.round(price * 100); // بالهللة
  const token = crypto.randomBytes(16).toString('hex');

  // خصم كامل: تفعيل مجاني فوري في أي وضع دفع
  if (amount === 0) {
    const info = db.prepare("INSERT INTO payments (user_id, plan, amount, status, provider, provider_ref, token, coupon_id) VALUES (?, ?, 0, 'paid', 'coupon', ?, ?, ?)")
      .run(userId, planId, 'coupon-' + coupon.code + '-' + Date.now(), token, coupon.id);
    redeemCoupon(coupon.id, userId, Number(info.lastInsertRowid));
    activate(userId, planId, 'coupon', coupon.code);
    return { done: true, free: true };
  }

  // التفعيل اليدوي: المدير يفعّل الاشتراك من لوحة الإدارة بعد استلام المبلغ
  if (PROVIDER === 'manual') throw new Error(`التفعيل حاليًا يتم يدويًا. تواصل معنا لإتمام الدفع (${price} ر.س${coupon ? ' بعد الخصم' : ''}) وسيُفعّل اشتراكك مباشرة.`);
  if (PROVIDER === 'moyasar' && (!MOYASAR.publishableKey || !MOYASAR.secretKey)) throw new Error('بوابة الدفع غير مهيأة. تواصل مع الدعم.');

  const info = db.prepare('INSERT INTO payments (user_id, plan, amount, status, provider, token, coupon_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, planId, amount, 'pending', PROVIDER, token, coupon ? coupon.id : null);
  const paymentId = Number(info.lastInsertRowid);

  if (PROVIDER === 'mock') {
    db.prepare("UPDATE payments SET status = 'paid', provider_ref = ? WHERE id = ?").run('mock-' + paymentId, paymentId);
    redeemCoupon(coupon && coupon.id, userId, paymentId);
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
        description: `${plan.name}${coupon ? ' (بعد الخصم)' : ''} — ملف إنجاز المعلم`,
        callback_url: `${baseUrl}/payments/moyasar/callback`,
        ...walletConfig(token),
        supported_networks: ['mada', 'visa', 'mastercard'],
        metadata: { ref: token },
        ...(process.env.MOYASAR_API_BASE ? { base_url: MOYASAR.apiBase } : {}),
      },
    };
  }
  throw new Error('بوابة الدفع غير مهيأة بعد');
}

// إعدادات Apple Pay و Samsung Pay لنموذج ميسر (تظهر أزرارها فقط على الأجهزة والمتصفحات الداعمة)
function walletConfig(token) {
  let methods = paymentMethods();
  const sid = samsungServiceId();
  if (!sid) methods = methods.filter((m) => m !== 'samsungpay'); // سامسونج باي يحتاج Service ID من ميسر
  const label = 'MualimHub'; // ميسر تشترط أن يكون اسم المتجر في Apple Pay بحروف إنجليزية
  return {
    methods,
    ...(methods.includes('applepay') ? { apple_pay: { country: 'SA', label, validate_merchant_url: `${MOYASAR.apiBase}/v1/applepay/initiate` } } : {}),
    ...(methods.includes('samsungpay') ? { samsung_pay: { service_id: sid, order_number: token, country: 'SA', label } } : {}),
  };
}

// يتحقق من عملية الدفع مباشرة من ميسر ثم يفعّل الاشتراك (آمن للتكرار: لا يفعّل نفس الدفعة مرتين)
async function confirmMoyasarPayment(moyasarId) {
  if (!/^[\w-]{8,64}$/.test(String(moyasarId || ''))) return { ok: false, reason: 'معرّف الدفع غير صالح' };
  const res = await fetch(`${MOYASAR.apiBase}/v1/payments/${encodeURIComponent(moyasarId)}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(MOYASAR.secretKey + ':').toString('base64') },
  });
  if (!res.ok) {
    console.warn(`moyasar verify ${moyasarId}: HTTP ${res.status}${res.status === 401 ? ' (المفتاح السري MOYASAR_SECRET_KEY غير صحيح)' : ''}`);
    return { ok: false, reason: 'تعذر التحقق من عملية الدفع، تواصل معنا إن خُصم المبلغ' };
  }
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
  if (upd.changes === 1) {
    redeemCoupon(row.coupon_id, row.user_id, row.id);
    activate(row.user_id, row.plan, 'moyasar', p.id);
  }
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

// إلغاء الاشتراك الحالي (المدير)
function cancelSubscription(userId) {
  db.prepare("UPDATE subscriptions SET status = 'canceled' WHERE user_id = ? AND status IN ('active','trialing')").run(userId);
}

// تحديد تاريخ انتهاء الاشتراك يدويًا (المدير): يحل محل الاشتراك الحالي
function setSubscriptionEnd(userId, endsAt, planId) {
  const sub = currentSubscription(userId);
  const plan = getPlans()[planId] ? planId : (sub && getPlans()[sub.plan] ? sub.plan : 'monthly');
  cancelSubscription(userId);
  db.prepare('INSERT INTO subscriptions (user_id, plan, status, current_period_end, provider, provider_ref) VALUES (?, ?, ?, ?, ?, ?)')
    .run(userId, plan, 'active', endsAt, 'admin', 'set-end');
}

// تسجيل دفعة استلمها المدير يدويًا (تحويل بنكي مثلًا)
function recordManualPayment(userId, planId, adminId) {
  const plan = getPlans()[planId];
  const ref = `manual-${adminId}-${Date.now()}`;
  db.prepare("INSERT INTO payments (user_id, plan, amount, status, provider, provider_ref, token) VALUES (?, ?, ?, 'paid', 'manual', ?, ?)")
    .run(userId, planId, Math.round(plan.price * 100), ref, crypto.randomBytes(16).toString('hex'));
  return ref;
}

module.exports = { paymentMethods, samsungServiceId, PAY_METHODS, evaluateCoupon, couponUses, normCode, getPlans, getSetting, setSetting, cancelSubscription, setSubscriptionEnd, recordManualPayment, TRIAL_DAYS, PROVIDER, startTrial, activate, createCheckout, confirmMoyasarPayment, subscriptionInfo, isActive, currentSubscription };
