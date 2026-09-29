"""Общие проверки страниц: дымовой обход адресов и комментарии в шаблонах."""

import re
from pathlib import Path

from django.conf import settings
from django.test import Client, SimpleTestCase

from .base import BaseCase


class SmokeTests(BaseCase):
    """Ни один адрес не должен отвечать ошибкой 500 ни для одной роли."""

    PAGES = [
        '/',
        '/companies/',
        '/articles/',
        '/tests/',
        '/contests/',
        '/constructor/',
        '/cabinet/',
        '/cabinet/user/',
        '/cabinet/user/articles/',
        '/cabinet/user/tests/',
        '/cabinet/user/contests/',
        '/cabinet/user/settings/',
        '/cabinet/user/statistics/',
        '/cabinet/user/articles/new/',
        '/cabinet/company/',
        '/cabinet/company/settings/',
        '/cabinet/company/statistics/',
        '/cabinet/company/tests/',
        '/cabinet/company/contests/',
        '/cabinet/company/contests/new/',
        '/administration/',
        '/kandidat/',
        '/firma/',
        '/firma/tests/',
        '/kandidat/articles/',
        '/firma/contests/',
        '/tests/?q=тест',
        '/tests/?cat=backend',
        '/export/user/statistics.pdf',
        '/export/company/statistics.pdf',
        '/export/admin/statistics.pdf',
    ]

    API = [
        '/api/v1/auth/me/',
        '/api/v1/companies/',
        '/api/v1/companies/my-ratings/',
        '/api/v1/companies/firma/',
        '/api/v1/companies/firma/tests/',
        '/api/v1/companies/firma/contests/',
        '/api/v1/candidates/kandidat/',
        '/api/v1/candidates/kandidat/articles/',
        '/api/v1/candidates/kandidat/contests/',
        '/api/v1/articles/catalog/',
        '/api/v1/articles/my/',
        '/api/v1/tests/',
        '/api/v1/tests/catalog/',
        '/api/v1/contests/catalog/',
        '/api/v1/contests/company/',
        '/api/v1/contests/user-history/',
        '/api/v1/admin/overview/',
        '/api/v1/admin/verifications/',
        '/api/v1/admin/users/',
        '/api/v1/admin/reports/',
        '/api/v1/admin/users/kandidat/content/',
    ]

    def test_no_server_errors_for_any_role(self):
        article = self.make_article(author='kandidat')
        contest = self.make_contest()
        test = self.make_test()
        urls = (
            self.PAGES
            + self.API
            + [
                f'/articles/{article.id}/',
                f'/contests/{contest.id}/',
                f'/tests/{test.id}/',
                f'/api/v1/tests/{test.id}/',
                f'/api/v1/tests/{test.id}/view/',
                f'/api/v1/contests/{contest.id}/',
                f'/api/v1/contests/{contest.id}/submissions/',
                f'/api/v1/contests/{contest.id}/my-submissions/',
            ]
        )
        for username in [None, 'kandidat', 'firma', 'moder']:
            client = self.login(username) if username else Client()
            for url in urls:
                with self.subTest(role=username or 'аноним', url=url):
                    self.assertLess(client.get(url).status_code, 500)

    def test_django_admin_pages_open(self):
        client = self.login('moder')
        for url in [
            '/django-admin/',
            '/django-admin/authorization/account/',
            '/django-admin/companies/company/',
            '/django-admin/articles_constructor/article/',
            '/django-admin/constructor/test/',
            '/django-admin/contests_cabinet/contest/',
            '/django-admin/admin_reports/report/',
            '/django-admin/users/userprofile/',
        ]:
            with self.subTest(url=url):
                self.assertEqual(client.get(url).status_code, 200)


class TemplateCommentTests(SimpleTestCase):
    """Комментарии в шаблонах не должны попадать на страницу.

    Django понимает {# … #} только в одну строку: многострочный такой
    комментарий не распознаётся и выводится читателю как обычный текст.
    Для нескольких строк нужен {% comment %}.
    """

    def test_no_multiline_hash_comments(self):
        broken = []
        for path in Path(settings.BASE_DIR).rglob('*.html'):
            if 'venv' in path.parts:
                continue
            text = path.read_text(encoding='utf-8')
            for match in re.finditer(r'\{#', text):
                end = text.find('#}', match.start())
                if end == -1 or '\n' in text[match.start() : end]:
                    broken.append(f'{path.relative_to(settings.BASE_DIR)}:{text[: match.start()].count(chr(10)) + 1}')

        self.assertEqual(broken, [], 'многострочный {# #} выводится на страницу, нужен {% comment %}: ' + ', '.join(broken))
