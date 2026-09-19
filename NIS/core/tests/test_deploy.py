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
    def _load(self, **env):
        """Перечитывает core.settings с подменённым окружением."""
        import core.settings as module
        with mock.patch.dict(os.environ, env, clear=False):
            return importlib.reload(module)

    def tearDown(self):
        # Возвращаем модуль в состояние текущего запуска
        import core.settings
        importlib.reload(core.settings)

    def test_debug_key_is_refused_in_production(self):
        """С выключенным DEBUG отладочный SECRET_KEY запускать нельзя."""
        with self.assertRaises(RuntimeError):
            self._load(DJANGO_DEBUG='0', SECRET_KEY='dev-secret-key-change-in-prod')

    def test_production_mode_tightens_cookies(self):
        module = self._load(DJANGO_DEBUG='0', SECRET_KEY='nastoyashiy-klyuch-dlya-testa')
        self.assertFalse(module.DEBUG)
        self.assertTrue(module.SESSION_COOKIE_SECURE)
        self.assertTrue(module.CSRF_COOKIE_SECURE)

    def test_hosts_and_origins_are_split_by_comma(self):
        module = self._load(
            DJANGO_DEBUG='1',
            ALLOWED_HOSTS='career.example.com, www.example.com',
            CSRF_TRUSTED_ORIGINS='https://career.example.com',
        )
        self.assertEqual(module.ALLOWED_HOSTS, ['career.example.com', 'www.example.com'])
        self.assertEqual(module.CSRF_TRUSTED_ORIGINS, ['https://career.example.com'])

    def test_static_is_served_without_a_web_server(self):
        """Собранную статику отдаёт WhiteNoise — иначе сайт уйдёт в бой без стилей."""
        self.assertIn('whitenoise.middleware.WhiteNoiseMiddleware', settings.MIDDLEWARE)
        self.assertTrue(settings.STATIC_ROOT)

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
        Account.objects.create_user('egor', name='Настоящее имя',
                                    password='Moy-Sobstvenniy-Parol-1', role='user')

        call_command('seed_all', stdout=StringIO(), stderr=StringIO())

        account = Account.objects.get(username='egor')
        self.assertEqual(account.name, 'Настоящее имя')
        self.assertTrue(account.check_password('Moy-Sobstvenniy-Parol-1'))
