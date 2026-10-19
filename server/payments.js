// إدارة الاشتراكات والدفع.
// المزوّدات: mock (تجريبي يفعّل مباشرة — للتطوير فقط) | manual (المدير يفعّل من لوحة الإدارة).
// لاحقًا: نضيف مزوّد Moyasar / Tap / Stripe بنفس الواجهة (createCheckout + handleCallback).
const { db } = require('./db');

const DAY = 24 * 60 * 60 * 1000;

const PLANS = {
  monthly: { id: 'monthly', name: 'اشتراك شهري', price: Number(process.env.PRICE_MONTHLY || 29), days: 30 },
  yearly: { id: 'yearly', name: 'اشتراك سنوي', price: Number(process.env.PRICE_YEARLY || 199), days: 365 },
};
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 0);
const PROVIDER = process.env.PAYMENT_PROVIDER || 'mock';

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

// يُرجع رابط صفحة الدفع أو يفعّل مباشرة في الوضع التجريبي
function createCheckout(userId, planId) {
  const plan = PLANS[planId];
  if (!plan) throw new Error('خطة غير معروفة');
  // التفعيل اليدوي: المدير يفعّل الاشتراك من لوحة الإدارة بعد استلام المبلغ
  if (PROVIDER === 'manual') throw new Error('التفعيل حاليًا يتم يدويًا. تواصل معنا لإتمام الدفع وسيُفعّل اشتراكك مباشرة.');
  const info = db.prepare('INSERT INTO payments (user_id, plan, amount, status, provider) VALUES (?, ?, ?, ?, ?)')
    .run(userId, planId, plan.price * 100, 'pending', PROVIDER);
  const paymentId = Number(info.lastInsertRowid);

  if (PROVIDER === 'mock') {
    db.prepare("UPDATE payments SET status = 'paid', provider_ref = ? WHERE id = ?").run('mock-' + paymentId, paymentId);
    activate(userId, planId, 'mock', 'mock-' + paymentId);
    return { done: true };
  }
  throw new Error('بوابة الدفع غير مهيأة بعد');
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

module.exports = { PLANS, TRIAL_DAYS, startTrial, activate, createCheckout, subscriptionInfo, isActive, currentSubscription };
