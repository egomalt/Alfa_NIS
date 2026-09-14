"""Жалобы: создание, защита от накрутки, снятие материала."""
import json

from django.test import Client

from administration.reports.models import ESCALATION_THRESHOLD, Report
from articles.constructor.models import Article

from .base import BaseCase


class ReportCreationTests(BaseCase):
    def _report(self, user, target_type, target_id, reason='Спам и оскорбления'):
        client = self.login(user) if user else Client()
        return client.post('/api/v1/reports/', json.dumps({
            'target_type': target_type, 'target_id': target_id, 'reason': reason,
        }), 'application/json')

    def test_anonymous_cannot_report(self):
        article = self.make_article()
        self.assertEqual(self._report(None, 'article', article.id).status_code, 401)

    def test_server_fills_target_details_itself(self):
        """Клиент присылает только тип, id и причину — остальное подставляет сервер."""
        article = self.make_article(author='kandidat', title='Плохая статья')
        self.assertEqual(self._report('drugoy', 'article', article.id).status_code, 201)

        report = Report.objects.get(target_type='article', target_id=str(article.id))
        self.assertEqual(report.target_title, 'Плохая статья')
        self.assertEqual(report.author_username, 'kandidat')
        self.assertEqual(report.target_url, f'/articles/{article.id}/')
        self.assertEqual(report.status, Report.STATUS_NEW)

    def test_duplicate_report_blocked(self):
        """Иначе порог эскалации накручивается одним человеком."""
        article = self.make_article()
        self.assertEqual(self._report('drugoy', 'article', article.id).status_code, 201)
        self.assertEqual(self._report('drugoy', 'article', article.id).status_code, 409)
        self.assertEqual(Report.objects.filter(target_id=str(article.id)).count(), 1)

    def test_cannot_report_own_content(self):
        article = self.make_article(author='kandidat')
        self.assertEqual(self._report('kandidat', 'article', article.id).status_code, 400)

    def test_invalid_input_rejected(self):
        article = self.make_article()
        self.assertEqual(self._report('drugoy', 'article', article.id, reason='  ').status_code, 400)
        self.assertEqual(self._report('drugoy', 'article', 99999).status_code, 404)
        self.assertEqual(self._report('drugoy', 'мусор', article.id).status_code, 400)

    def test_draft_contest_cannot_be_reported(self):
        draft = self.make_contest(status='draft')
        self.assertEqual(self._report('drugoy', 'contest', draft.id).status_code, 404)

    def test_escalation_counts_distinct_reporters(self):
        article = self.make_article(author='kandidat')
        for reporter in ['drugoy', 'firma', 'konkurent']:
            self.assertEqual(self._report(reporter, 'article', article.id).status_code, 201)

        data = self.login('moder').get('/api/v1/admin/reports/').json()
        target = next(r for r in data['reports'] if r['target_id'] == str(article.id))
        self.assertEqual(target['total_reports'], ESCALATION_THRESHOLD)
        self.assertTrue(target['escalated'])


class TakedownTests(BaseCase):
    """Кнопка «Снять материал» раньше только закрывала жалобу."""

    def _make_report(self, article):
        return Report.objects.create(
            target_type='article', target_id=str(article.id), target_title=article.title,
            target_url=f'/articles/{article.id}/', author_username=article.author_username,
            reporter_username='drugoy', reason='нарушение',
        )

    def test_takedown_deletes_content(self):
        article = self.make_article(author='kandidat')
        report = self._make_report(article)

        response = self.login('moder').post(f'/api/v1/admin/reports/{report.id}/takedown/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Article.objects.filter(id=article.id).exists())

    def test_takedown_closes_all_reports_on_same_target(self):
        article = self.make_article(author='kandidat')
        report = self._make_report(article)
        Report.objects.create(
            target_type='article', target_id=str(article.id), target_title=article.title,
            author_username='kandidat', reporter_username='firma', reason='ещё одна',
        )
        self.login('moder').post(f'/api/v1/admin/reports/{report.id}/takedown/')
        self.assertEqual(Report.objects.filter(target_type='article', target_id=str(article.id),
                                               status=Report.STATUS_NEW).count(), 0)

    def test_takedown_does_not_touch_other_types_with_same_id(self):
        article = self.make_article(author='kandidat')
        contest = self.make_contest()
        report = self._make_report(article)
        Report.objects.create(
            target_type='contest', target_id=str(contest.id), target_title=contest.title,
            author_username='firma', reporter_username='drugoy', reason='другое',
        )
        self.login('moder').post(f'/api/v1/admin/reports/{report.id}/takedown/')
        self.assertEqual(Report.objects.filter(target_type='contest', status=Report.STATUS_NEW).count(), 1)

    def test_takedown_is_moderator_only(self):
        article = self.make_article(author='kandidat')
        report = self._make_report(article)
        self.assertEqual(self.login('drugoy').post(f'/api/v1/admin/reports/{report.id}/takedown/').status_code, 403)
        self.assertTrue(Article.objects.filter(id=article.id).exists())
