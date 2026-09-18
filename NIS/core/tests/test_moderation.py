"""Модерация: жалобы, баны, верификация компаний и зачистка контента."""
import json
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.test import Client
from django.utils import timezone

from administration.moderation.api_views import MAX_BAN_DAYS
from administration.reports.models import ESCALATION_THRESHOLD, Report
from articles.constructor.models import Article
from authorization.models import Account, STATUS_ACTIVE, STATUS_BANNED
from companies.models import Company

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
    """«Снять материал» удаляет сам материал, а не только закрывает жалобу."""

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


class BanStateTests(BaseCase):
    """Истёкший бан не должен считаться действующим.

    Поле status снимается только при следующем входе пользователя, поэтому
    в базе он так и лежит со status='banned' — списки и счётчики админки
    обязаны смотреть на дату, а не на поле.
    """

    def _ban(self, username, until):
        account = Account.objects.get(username=username)
        account.status = STATUS_BANNED
        account.ban_until = until
        account.ban_reason = 'Нарушение правил'
        account.save(update_fields=['status', 'ban_until', 'ban_reason'])
        return account

    def test_expired_ban_is_not_counted_in_overview(self):
        self._ban('kandidat', timezone.now() - timedelta(days=1))
        self._ban('drugoy', timezone.now() + timedelta(days=1))

        data = self.login('moder').get('/api/v1/admin/overview/').json()
        self.assertEqual(data['stats']['banned'], 1)

    def test_expired_ban_drops_out_of_banned_filter(self):
        self._ban('kandidat', timezone.now() - timedelta(days=1))
        self._ban('drugoy', None)  # бессрочный

        data = self.login('moder').get('/api/v1/admin/users/?filter=banned').json()
        usernames = [u['username'] for u in data['users']]
        self.assertEqual(usernames, ['drugoy'])

    def test_expired_ban_shows_as_active_in_list(self):
        self._ban('kandidat', timezone.now() - timedelta(days=1))

        data = self.login('moder').get('/api/v1/admin/users/?q=kandidat').json()
        row = next(u for u in data['users'] if u['username'] == 'kandidat')
        self.assertEqual(row['status'], STATUS_ACTIVE)
        self.assertEqual(row['ban_reason'], '')

    def test_huge_ban_duration_does_not_crash(self):
        """int из формы уходит в timedelta: без потолка это OverflowError и 500."""
        response = self.login('moder').post(
            '/api/v1/admin/users/kandidat/ban/',
            json.dumps({'reason': 'Спам', 'duration': 10 ** 9}),
            'application/json',
        )
        self.assertEqual(response.status_code, 200)
        account = Account.objects.get(username='kandidat')
        self.assertTrue(account.is_banned)
        self.assertLess(account.ban_until, timezone.now() + timedelta(days=MAX_BAN_DAYS + 1))

    def test_moderator_cannot_be_banned(self):
        response = self.login('moder').post(
            '/api/v1/admin/users/moder/ban/',
            json.dumps({'reason': 'Проверка'}),
            'application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Account.objects.get(username='moder').is_banned)


class VerificationDecisionTests(BaseCase):
    def test_decision_only_on_pending_application(self):
        """Компания без поданной заявки не должна одобряться в один POST."""
        client = self.login('moder')
        self.assertEqual(client.post('/api/v1/admin/verifications/firma/approve/').status_code, 400)
        self.assertEqual(client.post('/api/v1/admin/verifications/firma/reject/').status_code, 400)

    def test_pending_application_can_be_decided(self):
        company = Company.objects.get(username='firma')
        company.verification_status = Company.VERIF_PENDING
        company.submitted_at = timezone.now()
        company.save(update_fields=['verification_status', 'submitted_at'])

        response = self.login('moder').post('/api/v1/admin/verifications/firma/approve/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(Company.objects.get(username='firma').is_verified)

    def test_document_is_not_served_to_outsiders(self):
        """Ссылка на документ ведёт во вьюху под проверкой роли, а не в /media/."""
        company = Company.objects.get(username='firma')
        company.registration_document.name = 'company_documents/ustav.pdf'
        company.verification_status = Company.VERIF_PENDING
        company.save(update_fields=['registration_document', 'verification_status'])

        data = self.login('moder').get('/api/v1/admin/verifications/?status=pending').json()
        url = data['verifications'][0]['document_url']
        self.assertEqual(url, '/administration/verification/firma/document/')

        # Посторонний уходит на форму входа, а не получает файл
        self.assertEqual(self.login('drugoy').get(url).status_code, 302)


class ContentPurgeTests(BaseCase):
    def test_purge_reports_real_counts(self):
        """delete() возвращает и связанные строки — счётчик должен быть по материалам."""
        self.make_article(author='kandidat')
        self.make_article(author='kandidat', title='Вторая')
        test = self.make_test(owner='kandidat')  # вопросы и ответы тоже попадут в delete()
        self.assertTrue(test.pages.exists())

        response = self.login('moder').post(
            '/api/v1/admin/users/kandidat/purge/',
            json.dumps({'categories': ['articles', 'tests']}),
            'application/json',
        )
        self.assertEqual(response.json()['removed'], {'articles': 2, 'tests': 1})
        self.assertEqual(Article.objects.filter(author_username='kandidat').count(), 0)

    def test_document_can_be_shown_in_admin_iframe(self):
        """Предпросмотр в модалке — это iframe: DENY из middleware его гасит."""
        media = Path(settings.MEDIA_ROOT) / 'company_documents'
        media.mkdir(parents=True, exist_ok=True)
        (media / 'ustav-test.pdf').write_bytes(b'%PDF-1.4 test')
        self.addCleanup(lambda: (media / 'ustav-test.pdf').unlink(missing_ok=True))

        company = Company.objects.get(username='firma')
        company.registration_document.name = 'company_documents/ustav-test.pdf'
        company.save(update_fields=['registration_document'])

        response = self.login('moder').get('/administration/verification/firma/document/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['X-Frame-Options'], 'SAMEORIGIN')
