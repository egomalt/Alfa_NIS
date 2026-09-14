"""Права доступа: кто что может, и закрытые дыры."""
import json

from django.test import Client

from articles.constructor.models import Article
from companies.models import Company
from tests.constructor.models import Test, TestPage

from .base import BaseCase


class ApiGuardTests(BaseCase):
    """Единый декоратор: аноним — 401, чужая роль — 403."""

    def test_article_creation_is_for_candidates(self):
        self.assertEqual(Client().post('/api/v1/articles/create/').status_code, 401)
        self.assertEqual(self.login('firma').post('/api/v1/articles/create/').status_code, 403)
        self.assertEqual(self.login('kandidat').post('/api/v1/articles/create/').status_code, 200)

    def test_company_contest_list_is_for_companies(self):
        self.assertEqual(Client().get('/api/v1/contests/company/').status_code, 401)
        self.assertEqual(self.login('kandidat').get('/api/v1/contests/company/').status_code, 403)
        self.assertEqual(self.login('firma').get('/api/v1/contests/company/').status_code, 200)

    def test_rating_is_for_candidates(self):
        body = json.dumps({'rating': 5})
        ct = 'application/json'
        self.assertEqual(Client().post('/api/v1/companies/firma/rate/', body, ct).status_code, 401)
        self.assertEqual(self.login('firma').post('/api/v1/companies/firma/rate/', body, ct).status_code, 403)
        self.assertEqual(self.login('kandidat').post('/api/v1/companies/firma/rate/', body, ct).status_code, 200)

    def test_admin_endpoints_are_moderator_only(self):
        for url in ['/api/v1/admin/overview/', '/api/v1/admin/users/',
                    '/api/v1/admin/reports/', '/api/v1/admin/verifications/']:
            with self.subTest(url=url):
                self.assertEqual(Client().get(url).status_code, 401)
                self.assertEqual(self.login('firma').get(url).status_code, 403)
                self.assertEqual(self.login('moder').get(url).status_code, 200)

    def test_silent_denial_replaced_with_explicit(self):
        """Три эндпоинта раньше отдавали 200 с пустым списком вместо отказа."""
        self.assertEqual(Client().get('/api/v1/companies/my-ratings/').status_code, 401)
        self.assertEqual(Client().get('/api/v1/contests/user-history/').status_code, 401)


class PageGuardTests(BaseCase):
    def test_protected_pages_redirect_to_signin(self):
        for url in ['/cabinet/user/', '/cabinet/company/', '/administration/',
                    '/cabinet/user/articles/', '/cabinet/company/contests/',
                    '/export/user/statistics.pdf']:
            with self.subTest(url=url):
                response = Client().get(url)
                self.assertEqual(response.status_code, 302)
                self.assertIn('signin', response['Location'])


class OwnershipTests(BaseCase):
    def test_article_edits_are_owner_only(self):
        article = self.make_article(author='kandidat')
        body, ct = json.dumps({'title': 'взлом'}), 'application/json'
        self.assertEqual(Client().patch(f'/api/v1/articles/{article.id}/', body, ct).status_code, 401)
        self.assertEqual(self.login('drugoy').patch(f'/api/v1/articles/{article.id}/', body, ct).status_code, 404)
        self.assertEqual(self.login('kandidat').patch(f'/api/v1/articles/{article.id}/', body, ct).status_code, 200)

    def test_article_delete_is_owner_only(self):
        article = self.make_article(author='kandidat')
        self.assertEqual(self.login('drugoy').delete(f'/api/v1/articles/{article.id}/delete/').status_code, 404)
        self.assertTrue(Article.objects.filter(id=article.id).exists())
        self.assertEqual(self.login('kandidat').delete(f'/api/v1/articles/{article.id}/delete/').status_code, 200)


class TestsCrudHoleTests(BaseCase):
    """Раздел тестов работал вообще без авторизации."""

    def test_anonymous_cannot_delete_or_rewrite(self):
        test = self.make_test(owner='firma')
        self.assertEqual(Client().delete(f'/api/v1/tests/{test.id}/').status_code, 401)
        response = Client().put(f'/api/v1/tests/{test.id}/', json.dumps({'title': 'взлом'}), 'application/json')
        self.assertEqual(response.status_code, 401)
        self.assertTrue(Test.objects.filter(id=test.id, title='Тест').exists())

    def test_rival_company_cannot_touch_foreign_test(self):
        test = self.make_test(owner='firma')
        self.assertEqual(self.login('konkurent').delete(f'/api/v1/tests/{test.id}/').status_code, 403)
        self.assertEqual(self.login('konkurent').get(f'/api/v1/tests/{test.id}/').status_code, 403)

    def test_draft_cannot_be_published_by_stranger(self):
        draft = self.make_test(owner='firma', published=False)
        self.assertEqual(Client().post(f'/api/v1/tests/{draft.id}/publish/').status_code, 401)
        self.assertEqual(Test.objects.get(id=draft.id).status, Test.STATUS_DRAFT)

    def test_owner_is_taken_from_session_not_request(self):
        """Раньше owner_username приходил из тела запроса."""
        response = self.login('konkurent').post(
            '/api/v1/tests/create/',
            json.dumps({'owner_username': 'firma', 'title': 'Подделка'}), 'application/json')
        self.assertEqual(response.status_code, 201)
        self.assertFalse(Test.objects.filter(owner_username='firma', title='Подделка').exists())
        self.assertTrue(Test.objects.filter(owner_username='konkurent', title='Подделка').exists())

    def test_own_tests_list_hides_foreign_drafts(self):
        self.make_test(owner='firma', published=False, title='Секретный черновик')
        data = self.login('konkurent').get('/api/v1/tests/?owner=firma').json()
        self.assertTrue(all(t['owner_username'] == 'konkurent' for t in data['tests']))


class LeakTests(BaseCase):
    def test_correct_answers_hidden_while_taking(self):
        test = self.make_test(owner='firma')
        body = self.login('kandidat').get(f'/api/v1/tests/{test.id}/view/').content.decode()
        self.assertNotIn('is_correct', body)

    def test_owner_sees_correct_answers_in_editor(self):
        test = self.make_test(owner='firma')
        body = self.login('firma').get(f'/api/v1/tests/{test.id}/').content.decode()
        self.assertIn('is_correct', body)

    def test_preview_flag_does_not_expose_foreign_drafts(self):
        draft = self.make_test(owner='firma', published=False)
        self.assertEqual(Client().get(f'/api/v1/tests/{draft.id}/view/?preview=1').status_code, 404)
        self.assertEqual(self.login('konkurent').get(f'/api/v1/tests/{draft.id}/view/?preview=1').status_code, 404)
        self.assertEqual(self.login('firma').get(f'/api/v1/tests/{draft.id}/view/?preview=1').status_code, 200)

    def test_hidden_code_test_cases_stay_on_server(self):
        """Страница прохождения получает язык и примеры, но не скрытые тесты."""
        test = self.make_test(owner='firma', with_quiz=False)
        TestPage.objects.create(
            test=test, order=0, type=TestPage.TYPE_CODE, title='Сумма',
            page_meta={
                'language': 'cpp',
                'time_limit': 3,
                'test_cases': [
                    {'input': '1 2', 'expected': '3', 'is_sample': True},
                    {'input': 'SEKRETNIY-VVOD', 'expected': 'SEKRETNIY-OTVET', 'is_sample': False},
                ],
            },
        )
        page = self.login('kandidat').get(f'/api/v1/tests/{test.id}/view/').json()['pages'][0]

        self.assertEqual(page['page_meta']['language'], 'cpp')
        self.assertEqual(page['page_meta']['samples'], [{'input': '1 2', 'expected': '3'}])
        self.assertNotIn('SEKRETNIY-VVOD', json.dumps(page))
        self.assertNotIn('SEKRETNIY-OTVET', json.dumps(page))

    def test_company_document_is_private(self):
        Company.objects.filter(username='firma').update(registration_document='company_documents/doc.pdf')
        self.assertNotIn('registration_document_url',
                         self.login('konkurent').get('/api/v1/companies/firma/').content.decode())
        self.assertIn('registration_document_url',
                      self.login('firma').get('/api/v1/companies/firma/').content.decode())

    def test_candidate_email_is_private(self):
        self.candidate.email = 'secret@mail.ru'
        self.candidate.save(update_fields=['email'])
        self.assertNotIn('secret@mail.ru', Client().get('/api/v1/candidates/kandidat/').content.decode())
        self.assertIn('secret@mail.ru', self.login('kandidat').get('/api/v1/candidates/kandidat/').content.decode())

    def test_draft_contest_is_private(self):
        draft = self.make_contest(owner='firma', status='draft', case_text='СЕКРЕТ')
        self.assertEqual(Client().get(f'/api/v1/contests/{draft.id}/').status_code, 404)
        self.assertEqual(self.login('konkurent').get(f'/api/v1/contests/{draft.id}/').status_code, 404)
        response = self.login('firma').get(f'/api/v1/contests/{draft.id}/')
        self.assertEqual(response.json()['contest']['case_text'], 'СЕКРЕТ')

    def test_company_verification_requires_owner(self):
        """Раньше аноним снимал верификацию любой компании одним запросом."""
        self.assertEqual(Client().post('/api/v1/companies/firma/verification/', {}).status_code, 401)
        self.assertEqual(self.login('kandidat').post('/api/v1/companies/firma/verification/', {}).status_code, 403)
        self.assertEqual(self.login('konkurent').post('/api/v1/companies/firma/verification/', {}).status_code, 403)
