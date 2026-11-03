from datetime import date, timedelta
from unittest import mock

from django.test import Client, SimpleTestCase
from django.utils import timezone

from articles.constructor.models import Article
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import Test, TestAttempt
from users import activity

from .base import BaseCase


class StreakCalculationTests(SimpleTestCase):
    TODAY = date(2026, 11, 3)

    def series(self, length, end=0):
        return {(self.TODAY - timedelta(days=back)).isoformat(): 1 for back in range(end, end + length)}

    def calculate(self, counts):
        with mock.patch('users.activity.timezone.localdate', return_value=self.TODAY):
            return activity.streaks(counts)

    def test_current_streak_is_not_limited_to_the_heatmap_window(self):
        self.assertEqual(self.calculate(self.series(400)), {'current': 400, 'best': 400, 'today': 1})

    def test_yesterday_keeps_a_long_streak_alive(self):
        self.assertEqual(self.calculate(self.series(400, end=1)), {'current': 400, 'best': 400, 'today': 0})

    def test_best_streak_is_kept_outside_the_heatmap_window(self):
        counts = self.series(400, end=500) | self.series(3)
        self.assertEqual(self.calculate(counts), {'current': 3, 'best': 400, 'today': 1})

    def test_a_missed_day_breaks_the_current_streak(self):
        self.assertEqual(self.calculate(self.series(4, end=2)), {'current': 0, 'best': 4, 'today': 0})

    def test_multiple_events_count_as_one_active_day(self):
        counts = self.series(3)
        counts[self.TODAY.isoformat()] = 5
        self.assertEqual(self.calculate(counts), {'current': 3, 'best': 3, 'today': 5})

    def test_empty_days_and_future_events_do_not_create_a_streak(self):
        counts = {self.TODAY.isoformat(): 0, (self.TODAY + timedelta(days=1)).isoformat(): 2}
        self.assertEqual(self.calculate(counts), {'current': 0, 'best': 0, 'today': 0})


class ActivityHistoryTests(BaseCase):
    def test_cabinet_and_public_profile_use_the_entire_history(self):
        test = self.make_test(owner='firma')
        today = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        TestAttempt.objects.bulk_create(
            [
                TestAttempt(
                    test=test,
                    candidate_username='kandidat',
                    score=1,
                    max_score=1,
                    finished_at=today - timedelta(days=back),
                )
                for back in range(400)
            ]
        )
        cabinet = self.login('kandidat').get('/api/v1/tests/my-attempts/').json()
        profile = Client().get('/api/v1/candidates/kandidat/').json()['candidate']
        self.assertEqual(cabinet['streak'], {'current': 400, 'best': 400, 'today': 1})
        self.assertEqual(profile['streak'], cabinet['streak'])
        self.assertEqual(len(cabinet['daily']), activity.WINDOW_DAYS)
        self.assertEqual(min(cabinet['daily']), (today.date() - timedelta(days=181)).isoformat())

    def test_all_event_types_contribute_to_old_streaks(self):
        today = timezone.localtime().replace(hour=12, minute=0, second=0, microsecond=0)
        test = self.make_test(owner='kandidat')
        Test.objects.filter(pk=test.pk).update(created_at=today - timedelta(days=303))
        article = self.make_article(author='kandidat')
        Article.objects.filter(pk=article.pk).update(created_at=today - timedelta(days=302))
        submission = ContestSubmission.objects.create(contest=self.make_contest(), candidate_username='kandidat')
        ContestSubmission.objects.filter(pk=submission.pk).update(created_at=today - timedelta(days=301))
        TestAttempt.objects.create(test=test, candidate_username='kandidat', finished_at=today - timedelta(days=300))
        response = self.login('kandidat').get('/api/v1/tests/my-attempts/').json()
        self.assertEqual(response['streak'], {'current': 0, 'best': 4, 'today': 0})
        self.assertEqual(response['daily'], {})

    def test_heatmap_includes_the_whole_first_local_day(self):
        test = self.make_test(owner='firma')
        now = timezone.localtime().replace(hour=18, minute=0, second=0, microsecond=0)
        first = (now - timedelta(days=activity.WINDOW_DAYS - 1)).replace(hour=0, minute=1)
        TestAttempt.objects.create(test=test, candidate_username='kandidat', finished_at=first)
        TestAttempt.objects.create(test=test, candidate_username='kandidat', finished_at=first - timedelta(minutes=2))
        with mock.patch('users.activity.timezone.now', return_value=now):
            self.assertEqual(activity.daily('kandidat'), {first.date().isoformat(): 1})
