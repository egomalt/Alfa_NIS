"""Пагинация, число запросов к базе и дымовой обход всех адресов."""
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext

from articles.constructor.models import Article
from authorization.models import Account, ROLE_USER
from contests.contests_cabinet.models import ContestSubmission
from users.models import UserProfile

from .base import PASSWORD, BaseCase


class PaginationTests(BaseCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        Article.objects.bulk_create([
            Article(author_username='kandidat', title=f'Статья {i}', status=Article.STATUS_PUBLISHED)
            for i in range(130)
        ])

    def test_response_is_capped(self):
        data = Client().get('/api/v1/articles/catalog/').json()
        self.assertEqual(len(data['articles']), 100)

    def test_metadata_present(self):
        data = Client().get('/api/v1/articles/catalog/').json()
        for key in ('page', 'per_page', 'total', 'pages'):
            self.assertIn(key, data)
        self.assertEqual(data['total'], 130)

    def test_second_page_differs(self):
        first = Client().get('/api/v1/articles/catalog/').json()
        second = Client().get('/api/v1/articles/catalog/?page=2').json()
        self.assertEqual(len(second['articles']), 30)
        self.assertNotEqual(first['articles'][0]['id'], second['articles'][0]['id'])

    def test_per_page_is_capped(self):
        self.assertEqual(Client().get('/api/v1/articles/catalog/?per_page=99999').json()['per_page'], 100)

    def test_garbage_params_do_not_crash(self):
        self.assertEqual(Client().get('/api/v1/articles/catalog/?page=абв').status_code, 200)
        self.assertEqual(Client().get('/api/v1/articles/catalog/?page=9999').json()['page'], 2)

    def test_admin_lists_paginate(self):
        client = self.login('moder')
        for url in ['/api/v1/admin/users/', '/api/v1/admin/reports/']:
            with self.subTest(url=url):
                data = client.get(url).json()
                self.assertIn('total', data)
                self.assertIn('pages', data)


class QueryCountTests(BaseCase):
    def test_submissions_list_has_no_n_plus_one(self):
        """Раньше карточка кандидата стоила 2 запроса на каждую заявку."""
        contest = self.make_contest()
        for i in range(20):
            username = f'uch{i}'
            Account.objects.create_user(username, name=username, password=PASSWORD, role=ROLE_USER)
            UserProfile.objects.create(username=username, bio='b', skills=['x'])
            ContestSubmission.objects.create(contest=contest, candidate_username=username, candidate_name=username)

        client = self.login('firma')
        with CaptureQueriesContext(connection) as ctx:
            response = client.get(f'/api/v1/contests/{contest.id}/submissions/')
        self.assertEqual(len(response.json()['submissions']), 20)
        self.assertLess(len(ctx.captured_queries), 15)

    def test_article_page_does_not_scan_whole_table(self):
        """«Похожие статьи» поднимали в память всю таблицу."""
        Article.objects.bulk_create([
            Article(author_username='kandidat', title=f'С {i}', status=Article.STATUS_PUBLISHED, tags=['python'])
            for i in range(130)
        ])
        main = self.make_article(author='kandidat', tags=['python'])
        with CaptureQueriesContext(connection) as ctx:
            response = Client().get(f'/articles/{main.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 15)


class UploadValidationTests(BaseCase):
    def test_avatar_rejects_svg_and_oversized(self):
        client = self.login('kandidat')
        url = '/api/v1/candidates/kandidat/avatar/'
        svg = SimpleUploadedFile('a.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        self.assertEqual(client.post(url, {'avatar': svg}).status_code, 400)
        big = SimpleUploadedFile('big.png', b'x' * (6 * 1024 * 1024), content_type='image/png')
        self.assertEqual(client.post(url, {'avatar': big}).status_code, 400)
        ok = SimpleUploadedFile('ok.png', b'x' * 1000, content_type='image/png')
        self.assertEqual(client.post(url, {'avatar': ok}).status_code, 200)

    def test_email_is_validated(self):
        client = self.login('kandidat')
        url = '/api/v1/candidates/kandidat/update/'
        good = client.patch(url, json.dumps({'name': 'К', 'email': 'a@b.ru'}), 'application/json')
        self.assertEqual(good.status_code, 200)
        self.assertEqual(Account.objects.get(username='kandidat').email, 'a@b.ru')

        bad = client.patch(url, json.dumps({'name': 'К', 'email': 'не-email'}), 'application/json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(Account.objects.get(username='kandidat').email, 'a@b.ru')


class SmokeTests(BaseCase):
    """Ни один адрес не должен отвечать ошибкой 500 ни для одной роли."""

    PAGES = [
        '/', '/companies/', '/articles/', '/tests/', '/contests/', '/constructor/',
        '/cabinet/', '/cabinet/user/', '/cabinet/user/articles/', '/cabinet/user/tests/',
        '/cabinet/user/contests/', '/cabinet/user/settings/', '/cabinet/user/statistics/',
        '/cabinet/user/articles/new/', '/cabinet/company/', '/cabinet/company/settings/',
        '/cabinet/company/statistics/', '/cabinet/company/tests/', '/cabinet/company/contests/',
        '/cabinet/company/contests/new/', '/administration/', '/kandidat/', '/firma/',
        '/kandidat/articles/', '/firma/contests/', '/tests/?q=тест', '/tests/?cat=backend',
        '/export/user/statistics.pdf', '/export/company/statistics.pdf', '/export/admin/statistics.pdf',
    ]

    API = [
        '/api/v1/auth/me/', '/api/v1/companies/', '/api/v1/companies/my-ratings/',
        '/api/v1/companies/firma/', '/api/v1/companies/firma/tests/', '/api/v1/companies/firma/contests/',
        '/api/v1/candidates/kandidat/', '/api/v1/candidates/kandidat/articles/',
        '/api/v1/candidates/kandidat/contests/', '/api/v1/articles/catalog/', '/api/v1/articles/my/',
        '/api/v1/tests/', '/api/v1/tests/catalog/', '/api/v1/contests/catalog/',
        '/api/v1/contests/company/', '/api/v1/contests/user-history/',
        '/api/v1/admin/overview/', '/api/v1/admin/verifications/', '/api/v1/admin/users/',
        '/api/v1/admin/reports/', '/api/v1/admin/users/kandidat/content/',
    ]

    def test_no_server_errors_for_any_role(self):
        article = self.make_article(author='kandidat')
        contest = self.make_contest()
        test = self.make_test()
        urls = self.PAGES + self.API + [
            f'/articles/{article.id}/', f'/contests/{contest.id}/', f'/tests/{test.id}/',
            f'/api/v1/tests/{test.id}/', f'/api/v1/tests/{test.id}/view/',
            f'/api/v1/contests/{contest.id}/', f'/api/v1/contests/{contest.id}/submissions/',
            f'/api/v1/contests/{contest.id}/my-submissions/',
        ]
        for username in [None, 'kandidat', 'firma', 'moder']:
            client = self.login(username) if username else Client()
            for url in urls:
                with self.subTest(role=username or 'аноним', url=url):
                    self.assertLess(client.get(url).status_code, 500)

    def test_django_admin_pages_open(self):
        client = self.login('moder')
        for url in ['/django-admin/', '/django-admin/authorization/account/',
                    '/django-admin/companies/company/', '/django-admin/articles_constructor/article/',
                    '/django-admin/constructor/test/', '/django-admin/contests_cabinet/contest/',
                    '/django-admin/admin_reports/report/', '/django-admin/users/userprofile/']:
            with self.subTest(url=url):
                self.assertEqual(client.get(url).status_code, 200)


class ContactDetailsTests(BaseCase):
    """Телефон кандидата: раньше поле было в интерфейсе, но сервер его не знал."""

    def test_phone_is_saved_and_returned_to_owner(self):
        client = self.login('kandidat')
        response = client.patch('/api/v1/candidates/kandidat/update/',
                                json.dumps({'name': 'К', 'phone': '+7 900 000-00-00'}), 'application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['candidate']['phone'], '+7 900 000-00-00')

    def test_phone_is_private(self):
        self.login('kandidat').patch('/api/v1/candidates/kandidat/update/',
                                     json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json')
        self.assertNotIn('+79000000000', Client().get('/api/v1/candidates/kandidat/').content.decode())

    def test_company_sees_contacts_of_its_participants(self):
        self.login('kandidat').patch('/api/v1/candidates/kandidat/update/',
                                     json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json')
        contest = self.make_contest(submission_type='text')
        self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})

        data = self.login('firma').get(f'/api/v1/contests/{contest.id}/submissions/').json()
        self.assertEqual(data['submissions'][0]['candidate_phone'], '+79000000000')


class ContestCountersTests(BaseCase):
    """«Решений прислано» всегда показывалось нулём — сервер не отдавал поле."""

    def test_submissions_count_is_returned(self):
        contest = self.make_contest(submission_type='text')
        self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})

        public = Client().get(f'/api/v1/contests/{contest.id}/').json()['contest']
        self.assertEqual(public['submissions_count'], 1)

        cabinet = self.login('firma').get('/api/v1/contests/company/').json()
        target = next(c for c in cabinet['contests'] if c['id'] == contest.id)
        self.assertEqual(target['submissions_count'], 1)

    def test_company_contest_list_stats_are_correct(self):
        self.make_contest(status='draft')
        self.make_contest(status='active')
        self.make_contest(status='finished')
        stats = self.login('firma').get('/api/v1/contests/company/').json()['stats']
        self.assertEqual(stats['total'], 3)
        self.assertEqual(stats['draft'], 1)
        self.assertEqual(stats['active'], 1)
        self.assertEqual(stats['finished'], 1)


class AdminSearchTests(BaseCase):
    """Поиск в админке раньше искал только по имени, хотя показывается логин."""

    def test_search_by_username_and_name(self):
        client = self.login('moder')
        by_login = client.get('/api/v1/admin/users/?q=kandidat').json()['users']
        self.assertTrue(any(u['username'] == 'kandidat' for u in by_login))

        by_name = client.get('/api/v1/admin/users/?q=Фирма').json()['users']
        self.assertTrue(any(u['username'] == 'firma' for u in by_name))


class CompanyCatalogTests(BaseCase):
    """Каталог компаний: порядок и поля, которые читает страница."""

    def test_companies_sorted_by_published_tests(self):
        """Раньше сортировка шла по дате регистрации — пустые карточки лезли наверх."""
        self.make_test(owner='firma', published=True)
        self.make_test(owner='firma', published=True)
        self.make_test(owner='konkurent', published=True)
        self.make_test(owner='konkurent', published=False)   # черновик не в счёт

        companies = Client().get('/api/v1/companies/').json()['companies']
        order = [(c['username'], c['tests_count']) for c in companies]
        self.assertEqual(order[0], ('firma', 2))
        self.assertEqual(order[1], ('konkurent', 1))

    def test_card_fields_present(self):
        company = Client().get('/api/v1/companies/').json()['companies'][0]
        for key in ('username', 'name', 'description', 'industry', 'city',
                    'tests_count', 'avg_rating', 'profile_url', 'avatar_url'):
            self.assertIn(key, company)

    def test_catalog_page_opens(self):
        self.assertEqual(Client().get('/companies/').status_code, 200)
