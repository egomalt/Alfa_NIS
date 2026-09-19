import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env_flag(name, default):
    return os.getenv(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


# Режим разработки. На сервере выключается переменной DJANGO_DEBUG=0.
DEBUG = env_flag('DJANGO_DEBUG', True)

# Ключ подписи сессий и токенов. Значение по умолчанию годится только для
# разработки, поэтому с выключённым DEBUG запуск без своего ключа запрещён.
SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-prod')
if not DEBUG and SECRET_KEY == 'dev-secret-key-change-in-prod':
    raise RuntimeError('Задайте переменную окружения SECRET_KEY: с отладочным ключом сервер запускать нельзя.')

# Список доменов через запятую: ALLOWED_HOSTS=career.example.com,www.career.example.com
ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '*').split(',') if h.strip()]

CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', '').split(',') if o.strip()
]

# За обратным прокси схему запроса подсказывает заголовок, иначе Django
# считает все запросы http и ломает защиту cookie
if env_flag('BEHIND_PROXY', False):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

if not DEBUG:
    SESSION_COOKIE_SECURE = env_flag('COOKIE_SECURE', True)
    CSRF_COOKIE_SECURE = env_flag('COOKIE_SECURE', True)
    SECURE_CONTENT_TYPE_NOSNIFF = True

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

# Версия статики: подставляется ко всем ссылкам на CSS/JS как ?v=.
# Поменял статику — подними значение (или задай ASSET_VERSION в окружении).
ASSET_VERSION = os.getenv('ASSET_VERSION', '20260919-1')

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
TIME_ZONE = 'UTC'
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

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
