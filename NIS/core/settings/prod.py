"""Сервер: отладка выключена, всё секретное — из окружения (.env)."""

import os

from .base import *  # noqa: F403
from .base import env_flag

DEBUG = False

SECRET_KEY = os.getenv('SECRET_KEY', '')
if len(SECRET_KEY) < 32:
    raise RuntimeError('Задайте в окружении SECRET_KEY длиной от 32 символов.')

if ALLOWED_HOSTS == ['*']:  # noqa: F405
    raise RuntimeError('Задайте в окружении ALLOWED_HOSTS — домен сайта.')
# Проверку живости Docker делает изнутри контейнера, по адресу 127.0.0.1
ALLOWED_HOSTS += ['127.0.0.1', 'localhost']  # noqa: F405

# Сайт стоит за Caddy: схему запроса (https) он передаёт заголовком
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Без HTTPS (сайт по IP, COOKIE_SECURE=0) защищённые cookie и HSTS выключаются
HTTPS = env_flag('COOKIE_SECURE', True)
SESSION_COOKIE_SECURE = HTTPS
CSRF_COOKIE_SECURE = HTTPS
SECURE_CONTENT_TYPE_NOSNIFF = True
# Браузер запоминает на год, что сайт открывается только по HTTPS
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365 if HTTPS else 0

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': 'WARNING'},
}
