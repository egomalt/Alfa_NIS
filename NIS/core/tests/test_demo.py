"""Демонстрационные данные не должны устаревать к показу."""

from datetime import datetime, time, timedelta
from io import StringIO

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from authorization.models import ROLE_USER, Account
from contests.contests_cabinet.management.commands.seed_contest_catalog import OPEN, spread_deadlines
from contests.contests_cabinet.models import Contest
from core.demo import MARK, TAKER_PREFIX
from tests.constructor.models import Test, TestAttempt


def run(command, *args):
    call_command(command, *args, stdout=StringIO(), stderr=StringIO())


class ContestCatalogSeedTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        run('seed_companies')

    def until(self, days):
        day = timezone.localdate() + timedelta(days=days)
        return day, timezone.make_aware(datetime.combine(day, time(23, 59)))

    def test_open_contests_close_evenly_until_the_date(self):
        day, end = self.until(70)
        run('seed_contest_catalog', '--until', day.isoformat())

        open_contests = Contest.objects.filter(status=Contest.STATUS_ACTIVE, case_text__contains=MARK)
        deadlines = sorted(open_contests.values_list('deadline', flat=True))
        self.assertEqual(len(deadlines), len(OPEN))
        now = timezone.now()
        self.assertLess(deadlines[0], now + timedelta(days=3))
        self.assertLessEqual(deadlines[-1], end)
        self.assertTrue(Contest.objects.filter(status=Contest.STATUS_FINISHED, case_text__contains=MARK).exists())

    def test_rerun_moves_expired_deadlines_forward(self):
        day, _ = self.until(70)
        run('seed_contest_catalog', '--until', day.isoformat())
        Contest.objects.filter(case_text__contains=MARK, status=Contest.STATUS_ACTIVE).update(
            deadline=timezone.now() - timedelta(days=1)
        )

        run('seed_contest_catalog', '--until', day.isoformat())

        expired = Contest.objects.filter(case_text__contains=MARK, status=Contest.STATUS_ACTIVE, deadline__lt=timezone.now())
        self.assertFalse(expired.exists())
        self.assertEqual(Contest.objects.filter(case_text__contains=MARK, status=Contest.STATUS_ACTIVE).count(), len(OPEN))

    def test_clear_removes_only_its_contests(self):
        day, _ = self.until(70)
        run('seed_contest_catalog', '--until', day.isoformat())
        own = Contest.objects.create(company_username='yandex-demo', title='Свой конкурс', status=Contest.STATUS_ACTIVE)

        run('seed_contest_catalog', '--clear')

        self.assertEqual(list(Contest.objects.values_list('id', flat=True)), [own.id])

    def test_spread_has_a_deadline_every_few_days(self):
        now = timezone.now()
        deadlines = sorted(spread_deadlines(now, now + timedelta(days=70), 22))
        gaps = [later - earlier for earlier, later in zip(deadlines, deadlines[1:], strict=False)]
        self.assertLess(max(gaps), timedelta(days=4))


class RefreshDemoTests(TestCase):
    def test_dates_move_to_today_and_manual_records_stay(self):
        Account.objects.create_user(f'{TAKER_PREFIX}0', name='Кандидат 1', password='x' * 12, role=ROLE_USER)
        test = Test.objects.create(owner_username='firma', title='Тест', description=f'Демо {MARK}')
        attempt = TestAttempt.objects.create(test=test, candidate_username=f'{TAKER_PREFIX}0')
        month_ago = timezone.now() - timedelta(days=30)
        TestAttempt.objects.filter(pk=attempt.pk).update(started_at=month_ago, finished_at=month_ago)
        demo = Contest.objects.create(
            company_username='firma', title='Демо', case_text=MARK, status=Contest.STATUS_ACTIVE, deadline=month_ago
        )
        manual = Contest.objects.create(company_username='firma', title='Свой', status=Contest.STATUS_ACTIVE, deadline=month_ago)

        run('refresh_demo')

        attempt.refresh_from_db()
        demo.refresh_from_db()
        manual.refresh_from_db()
        self.assertEqual(timezone.localdate(attempt.started_at), timezone.localdate())
        self.assertGreater(demo.deadline, timezone.now() - timedelta(days=1))
        self.assertEqual(manual.deadline, month_ago)

    def test_candidate_streak_reaches_today_and_nothing_lands_in_the_future(self):
        Account.objects.create_user(f'{TAKER_PREFIX}0', name='Кандидат 1', password='x' * 12, role=ROLE_USER)
        test = Test.objects.create(owner_username='firma', title='Тест', description=f'Демо {MARK}')
        streak = TestAttempt.objects.create(test=test, candidate_username='egor', session_key=MARK)
        later = TestAttempt.objects.create(test=test, candidate_username=f'{TAKER_PREFIX}0')
        now = timezone.now()
        TestAttempt.objects.filter(pk=streak.pk).update(started_at=now - timedelta(days=30))
        TestAttempt.objects.filter(pk=later.pk).update(started_at=now - timedelta(days=29))

        run('refresh_demo')

        streak.refresh_from_db()
        later.refresh_from_db()
        self.assertEqual(timezone.localdate(streak.started_at), timezone.localdate())
        self.assertLessEqual(later.started_at, timezone.now())
        self.assertIsNone(later.finished_at)

    def test_without_demo_data_nothing_happens(self):
        out = StringIO()
        call_command('refresh_demo', stdout=out)
        self.assertIn('seed_all', out.getvalue())


class CatalogCategoryTests(TestCase):
    def test_filter_key_finds_contests_saved_with_russian_name(self):
        Contest.objects.create(company_username='firma', title='Кейс', category='Аналитика', status=Contest.STATUS_ACTIVE)
        data = self.client.get('/api/v1/contests/catalog/?category=analytics').json()
        self.assertEqual(data['total'], 1)
