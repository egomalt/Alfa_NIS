import json
from datetime import timedelta
from unittest import mock

from django.test import Client
from django.utils import timezone

from articles.constructor.models import ArticleVote
from authorization.models import Account
from companies.models import CompanyRating
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import TestAttempt, TestPage

from .base import BaseCase


class BlockedContentTests(BaseCase):
    def setUp(self):
        self.test = self.make_test(owner='firma', title='Скрытый тест')
        self.article = self.make_article(author='kandidat', title='Скрытая статья', tags=['python'])
        self.contest = self.make_contest(owner='firma', title='Скрытый конкурс', submission_type='text')

    def block(self, username, until=None):
        Account.objects.filter(username=username).update(status='banned', ban_until=until)

    def test_banned_company_card_is_hidden(self):
        self.block('firma')
        self.assertEqual(Client().get('/api/v1/companies/firma/').status_code, 404)

    def test_company_pages_and_api_follow_the_same_access_rules(self):
        self.block('firma')
        urls = (
            '/firma/',
            '/firma/tests/',
            '/firma/contests/',
            '/api/v1/companies/firma/',
            '/api/v1/companies/firma/tests/',
            '/api/v1/companies/firma/contests/',
            f'/tests/{self.test.id}/',
            f'/api/v1/tests/{self.test.id}/view/',
            f'/contests/{self.contest.id}/',
            f'/api/v1/contests/{self.contest.id}/',
        )
        for username, status in ((None, 404), ('drugoy', 404), ('konkurent', 404), ('firma', 200), ('moder', 200)):
            client = self.login(username)
            for url in urls:
                with self.subTest(viewer=username, url=url):
                    self.assertEqual(client.get(url).status_code, status)

    def test_candidate_materials_are_visible_only_to_owner_and_moderator(self):
        test = self.make_test(owner='kandidat')
        self.block('kandidat')
        urls = (
            '/kandidat/',
            '/kandidat/articles/',
            '/api/v1/candidates/kandidat/',
            '/api/v1/candidates/kandidat/articles/',
            '/api/v1/candidates/kandidat/contests/',
            f'/articles/{self.article.id}/',
            f'/tests/{test.id}/',
            f'/api/v1/tests/{test.id}/view/',
        )
        for username, status in ((None, 404), ('drugoy', 404), ('kandidat', 200), ('moder', 200)):
            client = self.login(username)
            for url in urls:
                with self.subTest(viewer=username, url=url):
                    self.assertEqual(client.get(url).status_code, status)

    def test_expired_ban_and_unban_restore_public_access(self):
        urls = (
            '/api/v1/companies/firma/',
            '/api/v1/companies/firma/tests/',
            '/api/v1/companies/firma/contests/',
            f'/tests/{self.test.id}/',
            f'/api/v1/tests/{self.test.id}/view/',
            f'/contests/{self.contest.id}/',
            f'/api/v1/contests/{self.contest.id}/',
        )
        self.block('firma', timezone.now() - timedelta(seconds=1))
        for url in urls:
            with self.subTest(state='expired', url=url):
                self.assertEqual(Client().get(url).status_code, 200)
        self.block('firma')
        Account.objects.filter(username='firma').update(status='active', ban_until=None)
        for url in urls:
            with self.subTest(state='unbanned', url=url):
                self.assertEqual(Client().get(url).status_code, 200)

    def test_hidden_test_cannot_be_submitted(self):
        self.block('firma')
        for client in (Client(), self.login('drugoy')):
            response = client.post(f'/api/v1/tests/{self.test.id}/submit/', json.dumps({'answers': {}}), 'application/json')
            self.assertEqual(response.status_code, 404)
        self.assertFalse(TestAttempt.objects.filter(test=self.test).exists())

    def test_banned_candidate_cannot_submit_a_visible_test(self):
        self.block('kandidat')
        response = self.login('kandidat').post(
            f'/api/v1/tests/{self.test.id}/submit/', json.dumps({'answers': {}}), 'application/json'
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'banned')
        self.assertFalse(TestAttempt.objects.filter(test=self.test).exists())

    def test_hidden_code_page_does_not_start_a_container(self):
        page = TestPage.objects.create(
            test=self.test,
            order=1,
            type=TestPage.TYPE_CODE,
            page_meta={'language': 'python', 'test_cases': [{'input': '', 'expected': '1'}]},
        )
        self.block('firma')
        with mock.patch('tests.constructor.views.run_in_docker') as run:
            response = self.login('drugoy').post(
                f'/api/v1/tests/pages/{page.id}/run/', json.dumps({'code': 'print(1)'}), 'application/json'
            )
        self.assertEqual(response.status_code, 404)
        run.assert_not_called()

    def test_hidden_contest_cannot_receive_a_submission(self):
        self.block('firma')
        response = self.login('drugoy').post(f'/api/v1/contests/{self.contest.id}/submit/', {'text': 'Решение'})
        self.assertEqual(response.status_code, 404)
        self.assertFalse(self.contest.submissions.exists())

    def test_hidden_authors_cannot_receive_votes_or_ratings(self):
        self.block('kandidat')
        self.block('firma')
        client = self.login('drugoy')
        vote = client.post(f'/api/v1/articles/{self.article.id}/vote/', json.dumps({'direction': 1}), 'application/json')
        rating = client.post('/api/v1/companies/firma/rate/', json.dumps({'rating': 5}), 'application/json')
        self.assertEqual(vote.status_code, 404)
        self.assertEqual(rating.status_code, 404)
        self.assertFalse(ArticleVote.objects.filter(article=self.article).exists())
        self.assertFalse(CompanyRating.objects.exists())

    def test_recommendations_do_not_show_hidden_articles(self):
        visible = self.make_article(author='drugoy', tags=['python'])
        self.block('kandidat')
        self.assertNotContains(Client().get(f'/articles/{visible.id}/'), self.article.title)

    def test_public_history_hides_a_blocked_company_but_preserves_own_history(self):
        submission = ContestSubmission.objects.create(contest=self.contest, candidate_username='drugoy', text='Решение')
        self.block('firma')
        public = Client().get('/api/v1/candidates/drugoy/contests/')
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.json()['submissions'], [])
        own = self.login('drugoy').get(f'/api/v1/contests/my-submissions/{submission.id}/')
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.json()['submission']['text'], 'Решение')

    def test_draft_contest_page_is_private(self):
        draft = self.make_contest(status='draft')
        for client in (Client(), self.login('drugoy'), self.login('moder')):
            self.assertEqual(client.get(f'/contests/{draft.id}/').status_code, 404)
        self.assertEqual(self.login('firma').get(f'/contests/{draft.id}/').status_code, 200)
