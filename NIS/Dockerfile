FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=core.settings.prod

# Клиент Docker нужен для проверки задач на код: решение запускается
# соседним контейнером через сокет хоста, смонтированный в compose.
# Ставим только клиент — демон берём хостовый.
ARG DOCKER_CLI_VERSION=27.3.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL "https://download.docker.com/linux/static/stable/x86_64/docker-${DOCKER_CLI_VERSION}.tgz" \
       | tar -xz -C /tmp docker/docker \
    && mv /tmp/docker/docker /usr/local/bin/docker \
    && rm -rf /tmp/docker /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app

# Коммит, из которого собран образ: по нему меняются ссылки ?v= на статику
ARG ASSET_VERSION=dev
ENV ASSET_VERSION=$ASSET_VERSION

# Миграции и статика — при каждом старте: после обновления кода ничего не нужно делать руками.
# Таймаут с запасом: проверка задачи на код прогоняет решение на всех тест-кейсах
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && exec gunicorn core.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 120"]
