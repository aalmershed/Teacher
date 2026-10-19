#!/usr/bin/env bash
# تحديث تلقائي: يعمل كل 5 دقائق (cron). إن وُجدت تعديلات جديدة على GitHub يسحبها ويعيد بناء الموقع.
# البيانات في مجلد data لا تتأثر.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
exec 9>/tmp/injaz-update.lock
flock -n 9 || exit 0   # تحديث آخر يعمل الآن

OWNER=$(stat -c %U "$DIR")
as_owner() { if [ "$(id -un)" = "$OWNER" ]; then "$@"; else sudo -u "$OWNER" "$@"; fi; }

BRANCH=$(as_owner git rev-parse --abbrev-ref HEAD)
as_owner git fetch -q origin "$BRANCH"
LOCAL=$(as_owner git rev-parse HEAD)
REMOTE=$(as_owner git rev-parse "origin/$BRANCH")
[ "$LOCAL" = "$REMOTE" ] && exit 0

echo "$(date '+%F %T') تحديث ${LOCAL:0:7} → ${REMOTE:0:7}"
as_owner git pull -q --ff-only origin "$BRANCH"
export APP_VERSION="$(as_owner git log -1 --format='%h|%cI')"
if [ "${SKIP_DOCKER:-}" != "1" ]; then
  docker compose up -d --build --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
fi
echo "$(date '+%F %T') تم التحديث"
