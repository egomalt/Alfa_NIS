"""Тесты: конструктор и прохождение."""

import json
import re

from django.db import connection
from django.test import Client
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from tests.constructor.models import TestAttempt, TestPage

from .base import BaseCase


class ConstructorTests(BaseCase):
    """Конструкторы не должны обещать больше, чем умеет сервер."""

    def test_code_languages_match_executor(self):
        """В селекте были python, js, ts, java, cpp, go, rust — исполнитель знает три."""
        from tests.constructor.executor import LANGUAGES

        body = self.login('firma').get('/constructor/').content.decode()
        offered = set(re.findall(r'<option value="([a-z+]+)">', body))
        self.assertEqual(offered, set(LANGUAGES))

    def test_attachment_limit_shown_matches_server(self):
        """Подсказка обещала «до 100 МБ», сервер отклонял всё крупнее 25 МБ."""
        from core.uploads import MAX_DOCUMENT_SIZE

        body = self.login('firma').get('/cabinet/company/contests/new/').content.decode()
        self.assertIn(f'до {MAX_DOCUMENT_SIZE // (1024 * 1024)} МБ на файл', body)

    def test_status_targets_exist(self):
        """setStatus() писал в элементы, которых не было в разметке."""
        tests_page = self.login('firma').get('/constructor/').content.decode()
        self.assertIn('id="cst-save-status"', tests_page)

        contest_page = self.login('firma').get('/cabinet/company/contests/new/').content.decode()
        self.assertIn('id="ccon-status"', contest_page)

        article_page = self.login('kandidat').get('/cabinet/user/articles/new/').content.decode()
        self.assertIn('id="status-msg"', article_page)


class TestAttemptTests(BaseCase):
    """Учёт прохождений: открытие, завершение и защита от накрутки."""

    def _open(self, client, test):
        return client.get(f'/api/v1/tests/{test.id}/view/')

    def _submit(self, client, test, answers=None):
        return client.post(f'/api/v1/tests/{test.id}/submit/', json.dumps({'answers': answers or {}}), 'application/json')

    def test_opening_records_an_unfinished_attempt(self):
        test = self.make_test(owner='firma')
        self._open(self.login('kandidat'), test)

        attempt = TestAttempt.objects.get(test=test)
        self.assertEqual(attempt.candidate_username, 'kandidat')
        self.assertIsNone(attempt.finished_at)

    def test_reload_does_not_create_a_second_attempt(self):
        """Повторная отправка и перезагрузка не должны накручивать счётчики."""
        test = self.make_test(owner='firma')
        client = self.login('kandidat')
        for _ in range(4):
            self._open(client, test)
        self.assertEqual(TestAttempt.objects.filter(test=test).count(), 1)

    def test_submit_closes_the_attempt_and_stores_score(self):
        test = self.make_test(owner='firma')
        page = test.pages.first()
        correct = page.answers.get(is_correct=True)

        client = self.login('kandidat')
        self._open(client, test)
        self._submit(client, test, {str(page.id): [correct.id]})

        attempt = TestAttempt.objects.get(test=test)
        self.assertIsNotNone(attempt.finished_at)
        self.assertEqual((attempt.score, attempt.max_score), (1, 1))
        self.assertEqual(attempt.percent, 100)

    def test_anonymous_attempts_are_counted_separately(self):
        """Тест открыт всем: анонимов различаем по сессии, а не сливаем в одного."""
        test = self.make_test(owner='firma')
        self._open(Client(), test)
        self._open(Client(), test)
        self.assertEqual(TestAttempt.objects.filter(test=test).count(), 2)

    def test_preview_by_owner_is_not_recorded(self):
        """Автор смотрит свой черновик — это не прохождение."""
        test = self.make_test(owner='firma', published=False)
        client = self.login('firma')
        self._open(client, test)  # без preview черновик недоступен
        client.get(f'/api/v1/tests/{test.id}/view/?preview=1')
        self._submit(client, test)
        self.assertEqual(TestAttempt.objects.filter(test=test).count(), 0)

    def test_catalog_counts_only_finished(self):
        test = self.make_test(owner='firma')
        client = self.login('kandidat')
        self._open(client, test)

        card = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        self.assertEqual(card['submissions'], 0)

        self._submit(client, test)
        card = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        self.assertEqual(card['submissions'], 1)

    def test_page_count_is_not_multiplied_by_attempts(self):
        """Два Count по разным связям в одном запросе перемножают строки.

        Без distinct у Count('pages') тест с 3 страницами и 57 попытками
        показывал в каталоге 171 вопрос.
        """
        test = self.make_test(owner='firma', with_quiz=False)
        for order in range(3):
            TestPage.objects.create(test=test, order=order, type=TestPage.TYPE_QUIZ, title=f'В{order}')
        for i in range(5):
            TestAttempt.objects.create(test=test, candidate_username=f'k{i}', finished_at=timezone.now(), score=1, max_score=3)

        card = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        self.assertEqual(card['page_count'], 3)
        self.assertEqual(card['submissions'], 5)

        company_card = Client().get('/api/v1/companies/firma/tests/').json()['tests'][0]
        self.assertEqual(company_card['page_count'], 3)
        self.assertEqual(company_card['submissions'], 5)

    def test_catalog_has_no_query_per_test(self):
        """Счётчик считается аннотацией, а не отдельным запросом на карточку."""
        for i in range(25):
            self.make_test(owner='firma', title=f'Тест {i}')

        with CaptureQueriesContext(connection) as ctx:
            response = Client().get('/api/v1/tests/catalog/')

        self.assertEqual(len(response.json()['tests']), 25)
        self.assertLess(len(ctx.captured_queries), 8)
