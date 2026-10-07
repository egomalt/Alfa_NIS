#!/usr/bin/env bash
# Установка инструментов в эту папку: Node-пакеты и Python-окружение с djlint и ruff.
set -euo pipefail
cd "$(dirname "$0")"
npm ci --no-fund --no-audit
python3 -m venv .venv
.venv/bin/pip install --quiet -r requirements.txt
echo "Готово. Проверка: bash style.sh check"
