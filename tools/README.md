# Проверка стиля кода

Локальные инструменты для `NIS/`: ESLint и Prettier для JS и CSS, djlint для шаблонов Django, ruff для Python.
Папка не попадает в репозиторий (`tools/` в `.gitignore`).

Установка (один раз, нужны Node.js и Python 3):

    bash tools/install.sh

Запуск из корня репозитория:

    bash tools/style.sh check   # только проверить
    bash tools/style.sh fix     # исправить и отформатировать

Настройки: `.prettierrc.json`, `eslint.config.mjs`, `ruff.toml`; параметры djlint — в `style.sh`.
