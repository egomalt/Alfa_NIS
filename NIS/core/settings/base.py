"""Общие настройки. Режим запуска задаёт dev.py (разработка) или prod.py (сервер)."""

import os
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent


def env_flag(name, default):
    return os.getenv(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


# Список доменов через запятую: ALLOWED_HOSTS=career.example.com,www.career.example.com
ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '*').split(',') if h.strip()]

CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()]

INSTALLED_APPS = [
    'django.contrib.sessions',
    'core',
    'authorization',
    'companies',
    'company_catalog',
    'users',
    'cabinet',
    'profiles',
    'tests.constructor',
    'tests.tests_app',
    'tests.tests_cabinet',
    'tests.tests_catalog',
    'articles.constructor',
    'articles.articles_app',
    'articles.articles_cabinet',
    'articles.articles_catalog',
    'contests.contests_cabinet',
    'contests.contests_app',
    'administration.dashboard',
    'administration.verification',
    'administration.moderation',
    'administration.reports',
    'exports',
    'home',
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'django.contrib.messages',
    'django.contrib.admin',
    'django.contrib.staticfiles',
]

AUTH_USER_MODEL = 'authorization.Account'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Отдаёт собранную статику без отдельного веб-сервера перед проектом
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

SESSION_ENGINE = 'django.contrib.sessions.backends.db'
SESSION_COOKIE_AGE = 60 * 60 * 24 * 30  # 30 дней
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'core.password_validators.MinimumLengthValidator',
        'OPTIONS': {'min_length': 8},
    },
    {'NAME': 'core.password_validators.CommonPasswordValidator'},
    {'NAME': 'core.password_validators.NumericPasswordValidator'},
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
                'core.context_processors.asset_version',
            ],
        },
    },
]


def _asset_version():
    """Версия статики в ссылках ?v=: коммит, из которого собран сайт.

    Меняется с каждым обновлением сама, и браузер не держит старые CSS/JS.
    В образе Docker папки .git нет — коммит передаётся при сборке (ASSET_VERSION)."""
    if os.getenv('ASSET_VERSION'):
        return os.environ['ASSET_VERSION']
    try:
        return subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'], cwd=BASE_DIR, capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return 'dev'


ASSET_VERSION = _asset_version()

WSGI_APPLICATION = 'core.wsgi.application'

if os.getenv('POSTGRES_HOST'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('POSTGRES_DB', 'nis_db'),
            'USER': os.getenv('POSTGRES_USER', 'admin'),
            'PASSWORD': os.getenv('POSTGRES_PASSWORD', 'admin'),
            'HOST': os.getenv('POSTGRES_HOST', 'localhost'),
            'PORT': os.getenv('POSTGRES_PORT', '5432'),
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db_dev.sqlite3',
        }
    }

LANGUAGE_CODE = 'ru-ru'
# Хранится всё в UTC, а показывается и считается по дням — по Москве
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
# Куда collectstatic соберёт статику для раздачи веб-сервером
STATIC_ROOT = BASE_DIR / 'staticfiles'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Раздавать ли загруженные файлы силами Django с выключённым DEBUG
SERVE_MEDIA = env_flag('SERVE_MEDIA', True)

# Файлы вне раздаваемой папки: доступ к ним даёт только вьюха с проверкой прав
# (core.storage). Сюда складываются регистрационные документы компаний.
PRIVATE_MEDIA_ROOT = BASE_DIR / 'private_media'

# Тесты пишут загрузки во временные папки, а не в media/ и private_media/
TEST_RUNNER = 'core.tests.runner.TempMediaRunner'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
