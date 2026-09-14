"""Общая основа для тестов.

Тесты лежат в core/tests/, а не в tests/ — каталог верхнего уровня с таким именем
занят доменным приложением (конструктор тестов, прохождение, каталог).
"""
from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from articles.constructor.models import Article
from authorization.models import Account, ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from companies.models import Company
from contests.contests_cabinet.models import Contest
from tests.constructor.models import Test, TestAnswer, TestPage

PASSWORD = 'Prochniy-Parol-77'


class BaseCase(TestCase):
    """Готовый набор аккаунтов и контента для сценарных тестов."""

    @classmethod
    def setUpTestData(cls):
        cls.candidate = Account.objects.create_user('kandidat', name='Кандидат', password=PASSWORD, role=ROLE_USER)
        cls.other = Account.objects.create_user('drugoy', name='Другой', password=PASSWORD, role=ROLE_USER)
        cls.company = Account.objects.create_user('firma', name='Фирма', password=PASSWORD, role=ROLE_COMPANY)
        cls.rival = Account.objects.create_user('konkurent', name='Конкурент', password=PASSWORD, role=ROLE_COMPANY)
        cls.moderator = Account.objects.create_user('moder', name='Модератор', password=PASSWORD, role=ROLE_MODERATOR)

        Company.objects.create(username='firma', name='Фирма', verification_status=Company.VERIF_APPROVED)
        Company.objects.create(username='konkurent', name='Конкурент', verification_status=Company.VERIF_APPROVED)

        cls.future = timezone.now() + timedelta(days=7)
        cls.past = timezone.now() - timedelta(days=1)

    def login(self, username=None):
        """Клиент, вошедший под указанным логином (или анонимный)."""
        client = Client()
        if username:
            response = client.post('/api/v1/auth/signin/', {'username': username, 'password': PASSWORD})
            self.assertEqual(response.status_code, 200, f'не удалось войти как {username}')
        return client

    # ── фабрики контента ────────────────────────────────────────────────

    def make_article(self, author='kandidat', published=True, **kwargs):
        kwargs.setdefault('title', 'Статья')
        return Article.objects.create(
            author_username=author,
            status=Article.STATUS_PUBLISHED if published else Article.STATUS_DRAFT,
            published_at=timezone.now() if published else None,
            **kwargs,
        )

    def make_contest(self, owner='firma', status='active', deadline='future', **kwargs):
        kwargs.setdefault('title', 'Конкурс')
        kwargs.setdefault('case_text', 'Условие задания')
        if deadline == 'future':
            kwargs['deadline'] = self.future
        elif deadline == 'past':
            kwargs['deadline'] = self.past
        return Contest.objects.create(company_username=owner, status=status, **kwargs)

    def make_test(self, owner='firma', published=True, with_quiz=True, **kwargs):
        kwargs.setdefault('title', 'Тест')
        test = Test.objects.create(
            owner_username=owner,
            status=Test.STATUS_PUBLISHED if published else Test.STATUS_DRAFT,
            **kwargs,
        )
        if with_quiz:
            page = TestPage.objects.create(test=test, order=0, type=TestPage.TYPE_QUIZ, title='Вопрос')
            TestAnswer.objects.create(page=page, text='Верный', is_correct=True, order=0)
            TestAnswer.objects.create(page=page, text='Неверный', is_correct=False, order=1)
        return test
