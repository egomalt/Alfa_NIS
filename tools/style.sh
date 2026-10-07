#!/usr/bin/env bash
# Проверка и форматирование кода NIS: JS, CSS, шаблоны и Python.
#   bash style.sh check  — только проверить, ничего не меняя
#   bash style.sh fix    — исправить то, что можно автоматически, и отформатировать
set -uo pipefail

TOOLS="$(cd "$(dirname "$0")" && pwd)"
PROJECT="$TOOLS/../NIS"
BIN="$TOOLS/node_modules/.bin"
DJLINT="$TOOLS/.venv/bin/djlint"
MODE="${1:-check}"

if [[ ! -x "$BIN/prettier" || ! -x "$DJLINT" || ! -x "$TOOLS/.venv/bin/ruff" ]]; then
  echo "Инструменты не установлены. Выполните: bash $TOOLS/install.sh" >&2
  exit 1
fi

cd "$PROJECT"
# Свой код проекта: без виртуального окружения, собранной статики и сторонних библиотек
list() {
  find . -name "$1" -not -path './venv/*' -not -path './staticfiles/*' -not -path '*/vendor/*' -not -path '*/node_modules/*'
}
mapfile -t JS < <(list '*.js')
mapfile -t CSS < <(list '*.css')
mapfile -t HTML < <(list '*.html')

# D018 — ссылки через {% url %}, H021 — атрибуты style (остались только цвета из базы)
DJLINT_ARGS=(--profile=django --indent 2 --max-line-length 120)
failed=0

echo "== ESLint (JS), файлов: ${#JS[@]}"
if [[ "$MODE" == fix ]]; then
  "$BIN/eslint" -c "$TOOLS/eslint.config.mjs" --fix "${JS[@]}" || failed=1
else
  "$BIN/eslint" -c "$TOOLS/eslint.config.mjs" "${JS[@]}" || failed=1
fi

echo "== Prettier (JS и CSS), файлов: $(( ${#JS[@]} + ${#CSS[@]} ))"
if [[ "$MODE" == fix ]]; then
  "$BIN/prettier" --config "$TOOLS/.prettierrc.json" --log-level warn --write "${JS[@]}" "${CSS[@]}" || failed=1
else
  "$BIN/prettier" --config "$TOOLS/.prettierrc.json" --log-level warn --check "${JS[@]}" "${CSS[@]}" || failed=1
fi

echo "== djlint (шаблоны), файлов: ${#HTML[@]}"
if [[ "$MODE" == fix ]]; then
  "$DJLINT" "${DJLINT_ARGS[@]}" --reformat --quiet "${HTML[@]}" >/dev/null
fi
"$DJLINT" "${DJLINT_ARGS[@]}" --check --quiet "${HTML[@]}" >/dev/null || { echo "Шаблоны не отформатированы — запустите: bash style.sh fix"; failed=1; }
"$DJLINT" "${DJLINT_ARGS[@]}" --lint --ignore D018,H021 --quiet "${HTML[@]}" || failed=1

RUFF="$TOOLS/.venv/bin/ruff"
echo "== ruff (Python)"
if [[ "$MODE" == fix ]]; then
  "$RUFF" check --config "$TOOLS/ruff.toml" --fix --quiet . || failed=1
  "$RUFF" format --config "$TOOLS/ruff.toml" --quiet . || failed=1
else
  "$RUFF" check --config "$TOOLS/ruff.toml" --quiet . || failed=1
  "$RUFF" format --config "$TOOLS/ruff.toml" --check --quiet . || { echo "Python не отформатирован — запустите: bash style.sh fix"; failed=1; }
fi

if [[ $failed == 0 ]]; then echo "Всё чисто."; else echo "Есть замечания — см. выше."; fi
exit $failed
