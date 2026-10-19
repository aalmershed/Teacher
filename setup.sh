#!/usr/bin/env bash
# تثبيت منصة "ملف إنجاز المعلم" على خادم Ubuntu بأمر واحد:
#   bash setup.sh
# يسألك عن بريدك ومفاتيح ميسر، ثم يثبّت Docker ويفتح المنافذ ويشغّل الموقع مع شهادة HTTPS.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1;32m%s\033[0m\n' "$*"; }
ask() { local p="$1" v; read -r -p "$p" v; printf '%s' "$v"; }

say "== إعداد منصة ملف إنجاز المعلم =="

if [ -f .env ] && [ "${RECONFIGURE:-}" != "1" ]; then
  echo "ملف الإعدادات .env موجود مسبقًا — سأستخدمه (لإعادة الإعداد: RECONFIGURE=1 bash setup.sh)"
else
  IP=$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)
  # بديل: أول عنوان IPv4 عام على الخادم نفسه
  [ -z "$IP" ] && IP=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -vE '^(10|127|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.' | head -1 || true)
  DEFAULT_DOMAIN=""
  [ -n "$IP" ] && DEFAULT_DOMAIN="${IP//./-}.sslip.io"
  echo "عنوان الخادم: ${IP:-غير معروف}"
  DOMAIN=$(ask "الدومين (اضغط Enter لاستخدام ${DEFAULT_DOMAIN:-دومينك}): ")
  DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
  [ -z "$DOMAIN" ] && { echo "لا بد من دومين"; exit 1; }
  ADMIN_EMAIL=$(ask "بريدك (تسجّل به في الموقع لتصبح مديرًا): ")
  PK=$(ask "مفتاح ميسر العام pk_ (اضغط Enter للتخطي وتفعيل الاشتراكات يدويًا): ")
  SK=""
  if [ -n "$PK" ]; then
    read -r -s -p "مفتاح ميسر السري (يبدأ بـ sk_ — لن يظهر أثناء الكتابة): " SK; echo
    case "$PK" in pk_*) ;; *) echo "المفتاح العام يجب أن يبدأ بـ pk_"; exit 1;; esac
    case "$SK" in sk_*) ;; *) echo "المفتاح السري يجب أن يبدأ بـ sk_"; exit 1;; esac
    PROVIDER=moyasar
  else
    PROVIDER=manual
  fi
  WEBHOOK_SECRET=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')

  umask 077
  cat > .env <<EOF
DOMAIN=$DOMAIN
PUBLIC_URL=https://$DOMAIN
ADMIN_EMAIL=$ADMIN_EMAIL
PAYMENT_PROVIDER=$PROVIDER
MOYASAR_PUBLISHABLE_KEY=$PK
MOYASAR_SECRET_KEY=$SK
MOYASAR_WEBHOOK_SECRET=$WEBHOOK_SECRET
MOYASAR_METHODS=creditcard
PRICE_MONTHLY=29
PRICE_YEARLY=199
TRIAL_DAYS=0
FILE_MAX_MB=25
STORAGE_QUOTA_MB=1000
EOF
  echo "تم حفظ الإعدادات في .env"
fi

[ "${SKIP_INSTALL:-}" = "1" ] && { echo "SKIP_INSTALL=1 — تم إنشاء الإعدادات فقط"; exit 0; }

if ! command -v docker >/dev/null 2>&1; then
  say "تثبيت Docker..."
  curl -fsSL https://get.docker.com | sudo sh
fi

# خوادم Oracle تمنع المنافذ افتراضيًا داخل النظام نفسه — نفتح 80 و443
if command -v iptables >/dev/null 2>&1 && sudo iptables -S INPUT 2>/dev/null | grep -q REJECT; then
  say "فتح المنافذ 80 و443..."
  for port in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p tcp --dport "$port" -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null 2>&1; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi
fi

say "تشغيل الموقع (أول مرة تأخذ 3–5 دقائق)..."
export APP_VERSION="$(git log -1 --format='%h|%cI' 2>/dev/null || true)"
sudo -E docker compose up -d --build

# التحديث التلقائي: كل 5 دقائق يتحقق من GitHub ويحدّث الموقع إن وُجد جديد
if [ "${NO_AUTO_UPDATE:-}" != "1" ]; then
  say "تفعيل التحديث التلقائي من GitHub..."
  chmod +x "$PWD/auto-update.sh"
  echo "*/5 * * * * root $PWD/auto-update.sh >> /var/log/injaz-update.log 2>&1" | sudo tee /etc/cron.d/injaz-autoupdate >/dev/null
  sudo chmod 644 /etc/cron.d/injaz-autoupdate
fi

DOMAIN=$(grep '^DOMAIN=' .env | cut -d= -f2-)
say "تم! افتح موقعك: https://$DOMAIN"
echo "التحديث التلقائي مفعّل: أي تعديل يُرفع على GitHub يظهر في الموقع خلال 5 دقائق (السجل: /var/log/injaz-update.log)."
echo "إن لم يفتح مباشرة انتظر دقيقة حتى تصدر شهادة الأمان."
echo "سجّل في الموقع بالبريد الذي أدخلته لتصبح مديرًا."
if grep -q '^PAYMENT_PROVIDER=moyasar' .env; then
  echo
  echo "لإشعارات ميسر (اختياري): أضف في لوحة ميسر Webhook على الرابط https://$DOMAIN/payments/moyasar/webhook"
  echo "وكلمة السر (Secret Token): $(grep '^MOYASAR_WEBHOOK_SECRET=' .env | cut -d= -f2-)"
else
  echo "الدفع: تفعيل يدوي — فعّل اشتراكات المعلمين من لوحة الإدارة. لربط ميسر لاحقًا: RECONFIGURE=1 bash setup.sh"
fi
