# HSE Lyceum IT Projects | Egor Maltsev

Сайт: https://glowdy.ru. Справка для пользователей: https://glowdy.ru/help/.

## Требования для запуска

Команды ниже рассчитаны на Linux x86_64.

- Git для получения исходников.
- Docker Engine с работающим демоном для запуска сервиса и проверки задач на код.
- Плагин Docker Compose v2 или новее для запуска всего сервиса в контейнерах. В этом варианте Python на хосте не нужен.
- Браузер с включёнными JavaScript и cookies для входа в аккаунт.

Получите исходники:

```bash
git clone https://github.com/egomalt/Alfa_NIS.git
cd Alfa_NIS
```

Подготовьте образы для задач на Python, JavaScript и C++:

```bash
docker pull python:3.11-alpine
docker pull node:20-alpine
docker pull gcc:12
```

Команда `docker info` должна выполняться от пользователя, который запускает приложение.

## Сборка и запуск через Docker

Выполняйте команды на сервере из корня репозитория. Привяжите домен к IP сервера и откройте порты 80 и 443. Эти порты должны быть свободны для Caddy.

```bash
cp .env.example .env
```

Заполните `.env`, заменив `example.com` своим доменом:

```dotenv
DOMAIN=example.com
SECRET_KEY=ваш-случайный-ключ-длиной-от-32-символов
ALLOWED_HOSTS=example.com
CSRF_TRUSTED_ORIGINS=https://example.com
COOKIE_SECURE=1
POSTGRES_DB=nis_db
POSTGRES_USER=nis
POSTGRES_PASSWORD=ваш-пароль-базы
```

Создать случайный ключ и отдельный пароль базы можно командой:

```bash
docker run --rm python:3.12-slim python -c "import secrets; print('SECRET_KEY=' + secrets.token_urlsafe(50)); print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32))"
```

Замените соответствующие значения в `.env` полученными строками.

```bash
docker compose up -d --build --wait
docker compose ps
```

При сборке устанавливаются зависимости Python. При старте приложение применяет миграции и собирает статику. PostgreSQL хранит данные, Gunicorn запускает Django, Caddy принимает запросы и автоматически получает HTTPS-сертификат.

Откройте `https://ваш-домен`. Проверка `https://ваш-домен/healthz/` должна вернуть `{"ok": true}`. После изменения `.env` повторите `docker compose up -d --build --wait`.

Логи и остановка:

```bash
docker compose logs --tail=100 web caddy db
docker compose down
```

База, публичные и приватные загрузки сохраняются в отдельных томах Docker. Обычный `docker compose down` оставляет эти данные для следующего запуска.

## Демонстрационные данные и роли

После запуска контейнеров заполните базу и создайте отдельного модератора:

```bash
docker compose exec web python manage.py seed_all
docker compose exec web python manage.py create_moderator demo-moderator --name "Модератор"
```

Команда `seed_all` создаёт компании, статьи, тесты, конкурсы, результаты кандидата и примеры обращений для модерации.

Для обновления дат демоданных перед показом:

```bash
docker compose exec web python manage.py refresh_demo
```

## Проверки проекта

Из корня репозитория:

```bash
docker compose exec web python manage.py check
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py test
```

Тесты используют отдельную базу и временные папки загрузок. Для тестов запуска пользовательского кода нужны три образа, перечисленные выше.

Проверка стиля из корня репозитория требует Node.js 20 или новее и Python 3:

```bash
bash tools/install.sh
bash tools/style.sh check
```
