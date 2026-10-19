#!/usr/bin/env bash
# تحديث الموقع لآخر نسخة من GitHub (البيانات في مجلد data تبقى كما هي)
#   bash update.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull
sudo docker compose up -d --build
echo "تم التحديث."
