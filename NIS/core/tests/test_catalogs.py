"""Каталоги: пагинация, фильтры и число запросов к базе."""

from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from articles.constructor.models import Article
from authorization.models import ROLE_USER, Account
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import TestAttempt
from users.models import UserProfile

from .base import PASSWORD, BaseCase


class PaginationTests(BaseCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        Article.objects.bulk_create(
            [Article(author_username='kandidat', title=f'Статья {i}', status=Article.STATUS_PUBLISHED) for i in range(130)]
        )

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
        """Карточки кандидатов собираются пачкой, а не по запросу на заявку."""
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
        Article.objects.bulk_create(
            [
                Article(author_username='kandidat', title=f'С {i}', status=Article.STATUS_PUBLISHED, tags=['python'])
                for i in range(130)
            ]
        )
        main = self.make_article(author='kandidat', tags=['python'])
        with CaptureQueriesContext(connection) as ctx:
            response = Client().get(f'/articles/{main.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertLess(len(ctx.captured_queries), 15)

    def test_catalog_resolves_author_names_in_one_query(self):
        """Имена авторов берутся на всю страницу разом, а не по статье."""
        for i in range(30):
            username = f'avtor{i}'
            Account.objects.create_user(username, name=f'Автор {i}', password=PASSWORD, role=ROLE_USER)
            self.make_article(author=username, title=f'Статья {i}')

        with CaptureQueriesContext(connection) as ctx:
            response = Client().get('/api/v1/articles/catalog/')

        articles = response.json()['articles']
        self.assertEqual(len(articles), 30)
        self.assertEqual(articles[0]['author_name'], 'Автор 29')
        self.assertLess(len(ctx.captured_queries), 8)

    def test_catalog_falls_back_to_username_without_account(self):
        """Статья могла остаться от удалённого аккаунта — карточка не должна пустеть."""
        self.make_article(author='udalyonnyy', title='Осиротевшая')
        card = Client().get('/api/v1/articles/catalog/').json()['articles'][0]
        self.assertEqual(card['author_name'], 'udalyonnyy')


class CompanyCatalogTests(BaseCase):
    """Каталог компаний: порядок и поля, которые читает страница."""

    def test_companies_sorted_by_published_tests(self):
        """Каталог компаний сортируется по числу опубликованных тестов."""
        self.make_test(owner='firma', published=True)
        self.make_test(owner='firma', published=True)
        self.make_test(owner='konkurent', published=True)
        self.make_test(owner='konkurent', published=False)  # черновик не в счёт

        companies = Client().get('/api/v1/companies/').json()['companies']
        order = [(c['username'], c['tests_count']) for c in companies]
        self.assertEqual(order[0], ('firma', 2))
        self.assertEqual(order[1], ('konkurent', 1))

    def test_card_fields_present(self):
        company = Client().get('/api/v1/companies/').json()['companies'][0]
        for key in (
            'username',
            'name',
            'description',
            'industry',
            'city',
            'tests_count',
            'avg_rating',
            'profile_url',
            'avatar_url',
        ):
            self.assertIn(key, company)

    def test_catalog_page_opens(self):
        self.assertEqual(Client().get('/companies/').status_code, 200)


class TestsCatalogTests(BaseCase):
    """Каталог тестов: поля карточки и фильтры из адреса."""

    def test_card_fields_present(self):
        self.make_test(owner='firma', published=True)
        test = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        for key in ('id', 'title', 'description', 'owner_name', 'level', 'category', 'page_count', 'submissions', 'url'):
            self.assertIn(key, test)

    def test_submissions_count_comes_from_finished_attempts(self):
        """Счётчик перестал быть числом в stats: считаем завершённые попытки.

        Открытые попытки в число прохождений не входят — иначе оно росло бы
        от одного открытия страницы.
        """
        test = self.make_test(owner='firma', published=True)
        test.stats = {'level': 'junior', 'category': 'backend', 'submissions': 42}
        test.save(update_fields=['stats'])

        for i in range(3):
            TestAttempt.objects.create(test=test, candidate_username=f'kto{i}', finished_at=timezone.now(), score=1, max_score=1)
        TestAttempt.objects.create(test=test, candidate_username='eshchyo-idyot')

        card = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        self.assertEqual(card['submissions'], 3)
        self.assertEqual(card['level'], 'junior')
        self.assertEqual(card['category'], 'backend')

    def test_only_published_tests_in_catalog(self):
        self.make_test(owner='firma', published=True, title='Опубликован')
        self.make_test(owner='firma', published=False, title='Черновик')
        titles = [t['title'] for t in Client().get('/api/v1/tests/catalog/').json()['tests']]
        self.assertIn('Опубликован', titles)
        self.assertNotIn('Черновик', titles)

    def test_catalog_page_opens_with_url_filters(self):
        for url in ['/tests/', '/tests/?cat=backend', '/tests/?level=junior', '/tests/?q=тест']:
            with self.subTest(url=url):
                self.assertEqual(Client().get(url).status_code, 200)


class ContestsCatalogTests(BaseCase):
    """Каталог конкурсов: поля карточки и что в него попадает."""

    def test_card_fields_present(self):
        self.make_contest(owner='firma', status='active', prize='100 000 ₽', category='backend')
        contest = Client().get('/api/v1/contests/catalog/').json()['contests'][0]
        for key in ('id', 'title', 'excerpt', 'status', 'deadline', 'prize', 'category', 'participants_count', 'company_name'):
            self.assertIn(key, contest)

    def test_drafts_are_not_in_catalog(self):
        self.make_contest(owner='firma', status='active', title='Открытый')
        self.make_contest(owner='firma', status='draft', title='Черновик')
        titles = [c['title'] for c in Client().get('/api/v1/contests/catalog/').json()['contests']]
        self.assertIn('Открытый', titles)
        self.assertNotIn('Черновик', titles)

    def test_finished_contests_are_shown(self):
        """Завершённые остаются в каталоге — их можно посмотреть, но не участвовать."""
        self.make_contest(owner='firma', status='finished', title='Завершённый')
        titles = [c['title'] for c in Client().get('/api/v1/contests/catalog/').json()['contests']]
        self.assertIn('Завершённый', titles)

    def test_catalog_page_opens(self):
        self.assertEqual(Client().get('/contests/').status_code, 200)
