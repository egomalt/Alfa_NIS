"""Настройки запуска: боевой режим, раздача файлов, демонстрационные данные."""

import importlib
import os
from io import StringIO
from unittest import mock

from django.conf import settings
from django.core.management import call_command
from django.test import SimpleTestCase, TestCase

from authorization.models import Account
from companies.models import Company
from tests.constructor.models import TestPage


class SettingsTests(SimpleTestCase):
    def _load(self, name, **env):
        """Загружает модуль настроек с подменённым окружением, не трогая текущий запуск."""
        import sys

        with mock.patch.dict(os.environ, env, clear=False):
            for module in ('core.settings.prod', 'core.settings.dev', 'core.settings.base'):
                sys.modules.pop(module, None)
            try:
                return importlib.import_module(f'core.settings.{name}')
            finally:
                for module in ('core.settings.prod', 'core.settings.dev', 'core.settings.base'):
                    sys.modules.pop(module, None)

    PROD_ENV = {'SECRET_KEY': 'n' * 40, 'ALLOWED_HOSTS': 'career.example.com'}

    def test_production_refuses_a_short_or_missing_key(self):
        with self.assertRaises(RuntimeError):
            self._load('prod', SECRET_KEY='', ALLOWED_HOSTS='career.example.com')
        with self.assertRaises(RuntimeError):
            self._load('prod', SECRET_KEY='korotkiy', ALLOWED_HOSTS='career.example.com')

    def test_production_needs_a_real_domain(self):
        with self.assertRaises(RuntimeError):
            self._load('prod', SECRET_KEY='n' * 40, ALLOWED_HOSTS='*')

    def test_production_mode_tightens_security(self):
        module = self._load('prod', **self.PROD_ENV)
        self.assertFalse(module.DEBUG)
        self.assertTrue(module.SESSION_COOKIE_SECURE)
        self.assertTrue(module.CSRF_COOKIE_SECURE)
        self.assertGreater(module.SECURE_HSTS_SECONDS, 0)
        self.assertTrue(module.SECURE_SSL_REDIRECT)
        # Проверка живости Docker идёт изнутри контейнера
        self.assertIn('127.0.0.1', module.ALLOWED_HOSTS)

    def test_site_without_https_keeps_cookies_working(self):
        """Сайт по IP без сертификата: защищённые cookie сломали бы вход."""
        module = self._load('prod', COOKIE_SECURE='0', **self.PROD_ENV)
        self.assertFalse(module.SESSION_COOKIE_SECURE)
        self.assertEqual(module.SECURE_HSTS_SECONDS, 0)
        self.assertFalse(module.SECURE_SSL_REDIRECT)

    def test_https_redirect_spares_the_health_check(self):
        from django.test import Client

        module = self._load('prod', **self.PROD_ENV)
        with self.settings(SECURE_SSL_REDIRECT=True, SECURE_REDIRECT_EXEMPT=module.SECURE_REDIRECT_EXEMPT):
            self.assertEqual(Client().get('/healthz/').status_code, 200)
            self.assertEqual(Client().get('/').status_code, 301)

    def test_dates_are_shown_in_moscow_time(self):
        self.assertEqual(settings.TIME_ZONE, 'Europe/Moscow')
        self.assertTrue(settings.USE_TZ)

    def test_hosts_and_origins_are_split_by_comma(self):
        module = self._load(
            'dev',
            ALLOWED_HOSTS='career.example.com, www.example.com',
            CSRF_TRUSTED_ORIGINS='https://career.example.com',
        )
        self.assertEqual(module.ALLOWED_HOSTS, ['career.example.com', 'www.example.com'])
        self.assertEqual(module.CSRF_TRUSTED_ORIGINS, ['https://career.example.com'])

    def test_static_is_served_without_a_web_server(self):
        """Собранную статику отдаёт WhiteNoise — иначе сайт уйдёт в бой без стилей."""
        self.assertIn('whitenoise.middleware.WhiteNoiseMiddleware', settings.MIDDLEWARE)
        self.assertTrue(settings.STATIC_ROOT)

    def test_health_endpoint_reports_the_database(self):
        from django.test import Client

        response = Client().get('/healthz/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True})

    def test_private_files_live_outside_media(self):
        self.assertNotEqual(settings.PRIVATE_MEDIA_ROOT, settings.MEDIA_ROOT)
        self.assertNotIn(str(settings.MEDIA_ROOT), str(settings.PRIVATE_MEDIA_ROOT))


class SeedAllTests(TestCase):
    """Одна команда должна поднимать демонстрационные данные с нуля."""

    def test_seed_all_fills_an_empty_database(self):
        call_command('seed_all', stdout=StringIO(), stderr=StringIO())

        self.assertTrue(Account.objects.filter(username='egor').exists())
        self.assertTrue(Company.objects.filter(username='alfa').exists())
        # Задачи на код — единственное, что проверяется запуском в контейнере
        self.assertTrue(TestPage.objects.filter(type=TestPage.TYPE_CODE).exists())

    def test_seed_all_does_not_touch_an_existing_account(self):
        """Пароль и имя уже заведённого аккаунта команда менять не должна."""
        Account.objects.create_user('egor', name='Настоящее имя', password='Moy-Sobstvenniy-Parol-1', role='user')

        call_command('seed_all', stdout=StringIO(), stderr=StringIO())

        account = Account.objects.get(username='egor')
        self.assertEqual(account.name, 'Настоящее имя')
        self.assertTrue(account.check_password('Moy-Sobstvenniy-Parol-1'))
