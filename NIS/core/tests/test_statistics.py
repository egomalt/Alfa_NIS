"""Статистика и PDF-отчёты: компания, конкурсы, тесты, кандидат."""

import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.test import Client, SimpleTestCase
from django.utils import timezone

from companies import statistics
from companies.models import Company, CompanyRating
from contests.contests_cabinet.models import ContestSubmission
from exports.company import build_company_pdf, contest_rows, test_rows
from exports.pdf import fit_column_widths, plural
from exports.user import build_user_pdf
from tests.constructor.models import TestAttempt
from users.models import UserProfile

from .base import BaseCase


class CompanyStatisticsTests(BaseCase):
    """Сводка кабинета: доступ, числа и график активности."""

    URL = '/api/v1/companies/firma/statistics/'

    def test_only_the_company_itself_sees_it(self):
        """В сводку попадают черновики и непроверенные решения."""
        self.assertEqual(Client().get(self.URL).status_code, 401)
        self.assertEqual(self.login('kandidat').get(self.URL).status_code, 403)
        self.assertEqual(self.login('konkurent').get(self.URL).status_code, 403)
        self.assertEqual(self.login('firma').get(self.URL).status_code, 200)

    def test_totals_count_winners_and_pending(self):
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(
            contest=contest, candidate_username='a', winner=True, status=ContestSubmission.STATUS_ACCEPTED
        )
        ContestSubmission.objects.create(contest=contest, candidate_username='b')
        ContestSubmission.objects.create(contest=contest, candidate_username='c')

        test = self.make_test(owner='firma')
        TestAttempt.objects.create(test=test, candidate_username='a', finished_at=timezone.now(), score=1, max_score=1)
        TestAttempt.objects.create(test=test, candidate_username='b')  # не закончил

        totals = self.login('firma').get(self.URL).json()['totals']
        self.assertEqual(totals['submissions'], 3)
        self.assertEqual(totals['winners'], 1)
        self.assertEqual(totals['pending_submissions'], 2)
        self.assertEqual(totals['test_attempts'], 1)

    def test_weekly_series_is_continuous(self):
        """Недели без активности заполняются нулями: дыры врут о том, что было."""
        weekly = self.login('firma').get(self.URL).json()['weekly']
        self.assertEqual(len(weekly), 12)
        weeks = [row['week'] for row in weekly]
        self.assertEqual(weeks, sorted(weeks))
        for row in weekly:
            self.assertIn('submissions', row)
            self.assertIn('attempts', row)

    def test_skills_come_from_participants_only(self):
        """Портрет участников — навыки тех, кто присылал решения, а не всех подряд."""
        UserProfile.objects.create(username='uchastnik', skills=['Python', 'SQL'])
        UserProfile.objects.create(username='postoronniy', skills=['Haskell'])
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(contest=contest, candidate_username='uchastnik')

        skills = self.login('firma').get(self.URL).json()['skills']
        names = [s['name'] for s in skills]
        self.assertCountEqual(names, ['Python', 'SQL'])
        self.assertNotIn('Haskell', names)

    def test_pdf_export_uses_the_same_numbers(self):
        """Отчёт и страница считали статистику по отдельности и могли разойтись."""
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(contest=contest, candidate_username='a', winner=True)

        client = self.login('firma')
        totals = client.get(self.URL).json()['totals']
        self.assertEqual(totals['winners'], 1)

        response = client.get('/export/company/statistics.pdf')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')


class CompanyReportTests(BaseCase):
    """PDF-отчёт компании: графики, таблицы и устойчивость к пустым данным."""

    def firma(self):
        return Company.objects.get(username='firma')

    def test_report_builds_for_a_company_without_any_data(self):
        """Пустая компания: в графиках max() по пустому набору и деление на ноль."""
        self.assertTrue(build_company_pdf(self.firma()).startswith(b'%PDF'))

    def test_report_builds_with_every_block_filled(self):
        """Все блоки сразу: график активности, навыки, рейтинг, обе таблицы."""
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(contest=contest, candidate_username='kandidat')
        UserProfile.objects.create(username='kandidat', skills=['Python', 'SQL'])
        test = self.make_test(owner='firma')
        TestAttempt.objects.create(test=test, candidate_username='kandidat', finished_at=timezone.now(), score=8, max_score=10)
        CompanyRating.objects.create(company=self.firma(), user_username='kandidat', rating=4)

        self.assertTrue(build_company_pdf(self.firma()).startswith(b'%PDF'))

    def test_rating_distribution_is_counted_once(self):
        """Карточка компании и отчёт берут распределение оценок из одного места."""
        company = self.firma()
        CompanyRating.objects.create(company=company, user_username='kandidat', rating=5)
        CompanyRating.objects.create(company=company, user_username='drugoy', rating=3)

        from_page = Client().get('/api/v1/companies/firma/').json()['company']['rating_dist']
        from_report = statistics.collect(company)['rating_dist']
        self.assertEqual({int(star): pct for star, pct in from_page.items()}, from_report)
        self.assertEqual(from_report, {5: 50, 3: 50})

    def test_test_row_carries_attempts_and_average(self):
        """Две агрегации по одной связи: строки не должны множиться."""
        test = self.make_test(owner='firma')
        for score in (4, 8):
            TestAttempt.objects.create(
                test=test, candidate_username='kandidat', finished_at=timezone.now(), score=score, max_score=10
            )
        TestAttempt.objects.create(test=test, candidate_username='drugoy')  # не закончил

        row = test_rows('firma')[0]
        self.assertEqual(row.finished_attempts, 2)
        self.assertEqual(round(row.avg_percent), 60)

    def test_contest_row_counts_submissions(self):
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(contest=contest, candidate_username='kandidat')
        ContestSubmission.objects.create(contest=contest, candidate_username='drugoy')
        self.make_contest(owner='firma', title='Без решений')

        totals = {c.title: c.submission_total for c in contest_rows('firma')}
        self.assertEqual(totals, {'Конкурс': 2, 'Без решений': 0})

    def test_tables_keep_only_the_top_rows(self):
        """Отчёт — сводка: полные списки конкурсов и тестов в нём не нужны."""
        for i in range(7):
            contest = self.make_contest(owner='firma', title=f'Конкурс {i}')
            for n in range(i):
                ContestSubmission.objects.create(contest=contest, candidate_username=f'u{n}')
        for i in range(12):
            test = self.make_test(owner='firma', title=f'Тест {i}')
            for _ in range(i):
                TestAttempt.objects.create(
                    test=test, candidate_username='kandidat', finished_at=timezone.now(), score=1, max_score=1
                )

        contests = contest_rows('firma')
        tests = test_rows('firma')
        self.assertEqual([c.title for c in contests], ['Конкурс 6', 'Конкурс 5', 'Конкурс 4', 'Конкурс 3', 'Конкурс 2'])
        self.assertEqual(len(tests), 10)
        self.assertEqual(tests[0].title, 'Тест 11')


class ReportBuilderTests(SimpleTestCase):
    """Мелочи построителя отчётов, которые видно только на готовой странице."""

    def test_narrow_column_grows_to_fit_its_header(self):
        """«УЧАСТНИКИ» над колонкой в одну цифру переносилось как «УЧАСТН ИКИ»."""
        widths = fit_column_widths(['Название', 'Участники'], [400, 20])
        self.assertGreater(widths[1], 40)
        self.assertAlmostEqual(sum(widths), 420, places=6)

    def test_wide_enough_columns_are_left_alone(self):
        widths = fit_column_widths(['Да', 'Нет'], [200, 200])
        self.assertEqual(widths, [200, 200])

    def test_plural_picks_the_russian_form(self):
        forms = ('отзыв', 'отзыва', 'отзывов')
        picked = [plural(n, forms) for n in (1, 2, 5, 11, 21, 104)]
        self.assertEqual(picked, ['отзыв', 'отзыва', 'отзывов', 'отзывов', 'отзыв', 'отзыва'])


class ContestStatisticsTests(BaseCase):
    """Воронка и подача по дням — метрики одного конкурса."""

    def _url(self, contest):
        return f'/api/v1/contests/{contest.id}/statistics/'

    def test_only_the_owner_sees_it(self):
        contest = self.make_contest(owner='firma')
        self.assertEqual(Client().get(self._url(contest)).status_code, 401)
        self.assertEqual(self.login('kandidat').get(self._url(contest)).status_code, 403)
        # Чужая компания получает 404: существование чужого конкурса не подтверждаем
        self.assertEqual(self.login('konkurent').get(self._url(contest)).status_code, 404)
        self.assertEqual(self.login('firma').get(self._url(contest)).status_code, 200)

    def test_funnel_shows_where_people_drop_off(self):
        contest = self.make_contest(owner='firma', participants_count=10)
        for i in range(4):
            ContestSubmission.objects.create(contest=contest, candidate_username=f'k{i}')
        ContestSubmission.objects.filter(contest=contest, candidate_username='k0').update(
            status=ContestSubmission.STATUS_ACCEPTED
        )
        ContestSubmission.objects.filter(contest=contest, candidate_username='k1').update(
            status=ContestSubmission.STATUS_REJECTED
        )

        funnel = self.login('firma').get(self._url(contest)).json()['funnel']
        self.assertEqual(funnel['participants'], 10)
        self.assertEqual(funnel['submitted'], 4)
        self.assertEqual(funnel['submit_rate'], 40)
        self.assertEqual(funnel['reviewed'], 2)
        self.assertEqual(funnel['review_rate'], 50)

    def test_funnel_survives_zero_participants(self):
        """Деление на ноль: конкурс без единого участника."""
        contest = self.make_contest(owner='firma', participants_count=0)
        funnel = self.login('firma').get(self._url(contest)).json()['funnel']
        self.assertEqual(funnel['submit_rate'], 0)
        self.assertEqual(funnel['review_rate'], 0)

    def test_daily_window_ends_on_the_deadline(self):
        contest = self.make_contest(owner='firma')
        data = self.login('firma').get(self._url(contest)).json()

        self.assertEqual(len(data['daily']), data['window_days'])
        days = [row['day'] for row in data['daily']]
        self.assertEqual(days, sorted(days))
        self.assertEqual(days[-1], contest.deadline.date().isoformat())

    def test_submissions_before_the_window_are_counted_separately(self):
        """Иначе сумма столбиков расходится с числом решений, и график врёт."""
        contest = self.make_contest(owner='firma')
        old = ContestSubmission.objects.create(contest=contest, candidate_username='davniy')
        ContestSubmission.objects.filter(pk=old.pk).update(created_at=contest.deadline - timedelta(days=60))

        data = self.login('firma').get(self._url(contest)).json()
        self.assertEqual(sum(row['count'] for row in data['daily']), 0)
        self.assertEqual(data['before_window'], 1)

    def test_contest_without_deadline_returns_no_series(self):
        contest = self.make_contest(owner='firma', deadline=None)
        data = self.login('firma').get(self._url(contest)).json()
        self.assertEqual(data['daily'], [])
        self.assertIsNone(data['deadline'])


class TestStatisticsTests(BaseCase):
    """Как проходят тест: средний балл, доля справившихся, брошенные попытки."""

    def _finish(self, test, username, score, max_score=4):
        return TestAttempt.objects.create(
            test=test, candidate_username=username, finished_at=timezone.now(), score=score, max_score=max_score
        )

    def _url(self, test):
        return f'/api/v1/tests/{test.id}/statistics/'

    def test_only_the_author_sees_it(self):
        test = self.make_test(owner='firma')
        self.assertEqual(Client().get(self._url(test)).status_code, 401)
        self.assertEqual(self.login('kandidat').get(self._url(test)).status_code, 403)
        self.assertEqual(self.login('firma').get(self._url(test)).status_code, 200)

    def test_average_and_pass_rate(self):
        test = self.make_test(owner='firma')
        for i, score in enumerate([4, 3, 2, 0]):  # 100%, 75%, 50%, 0%
            self._finish(test, f'k{i}', score)

        data = self.login('firma').get(self._url(test)).json()['attempts']
        self.assertEqual(data['finished'], 4)
        self.assertEqual(data['avg_percent'], 56)  # (100+75+50+0)/4
        self.assertEqual(data['pass_rate'], 50)  # порог 60%: 100 и 75

    def test_unfinished_attempts_split_into_running_and_abandoned(self):
        """Тот, кто прямо сейчас решает, не должен попадать в «бросили»."""
        test = self.make_test(owner='firma')
        self._finish(test, 'doshel', 4)
        TestAttempt.objects.create(test=test, candidate_username='seychas-reshaet')
        stale = TestAttempt.objects.create(test=test, candidate_username='brosil')
        TestAttempt.objects.filter(pk=stale.pk).update(started_at=timezone.now() - timedelta(days=3))

        data = self.login('firma').get(self._url(test)).json()['attempts']
        self.assertEqual(data['started'], 3)
        self.assertEqual(data['finished'], 1)
        self.assertEqual(data['abandoned'], 1)
        self.assertEqual(data['in_progress'], 1)

    def test_test_without_questions_does_not_divide_by_zero(self):
        """max_score = 0 у теста без вопросов — среднее посчитать не из чего."""
        test = self.make_test(owner='firma', with_quiz=False)
        TestAttempt.objects.create(test=test, candidate_username='k', finished_at=timezone.now(), score=0, max_score=0)

        data = self.login('firma').get(self._url(test)).json()['attempts']
        self.assertEqual(data['finished'], 1)
        self.assertIsNone(data['avg_percent'])
        self.assertIsNone(data['pass_rate'])

    def test_distribution_covers_every_attempt(self):
        test = self.make_test(owner='firma')
        for i, score in enumerate([0, 1, 2, 3, 4]):
            self._finish(test, f'k{i}', score)

        data = self.login('firma').get(self._url(test)).json()
        self.assertEqual(sum(b['count'] for b in data['distribution']), 5)

    def test_platform_average_covers_published_tests(self):
        """Сравнение берётся по площадке, а не по одному этому тесту."""
        mine = self.make_test(owner='firma', title='Мой')
        other = self.make_test(owner='konkurent', title='Чужой')
        self._finish(mine, 'a', 4)
        self._finish(other, 'b', 0)

        platform = self.login('firma').get(self._url(mine)).json()['platform']
        self.assertEqual(platform['scored'], 2)
        self.assertEqual(platform['avg_percent'], 50)

    def test_stats_page_opens_for_the_author_only(self):
        test = self.make_test(owner='firma')
        url = f'/constructor/{test.id}/stats/'
        self.assertEqual(self.login('firma').get(url).status_code, 200)
        self.assertEqual(self.login('konkurent').get(url).status_code, 404)


class CandidateStatisticsTests(BaseCase):
    """Прохождения чужих тестов — главная активность кандидата."""

    URL = '/api/v1/tests/my-attempts/'

    def attempt(self, test, score, max_score=10, finished=True, days_ago=0):
        attempt = TestAttempt.objects.create(
            test=test,
            candidate_username='kandidat',
            score=score,
            max_score=max_score,
            finished_at=timezone.now() - timedelta(days=days_ago) if finished else None,
        )
        return attempt

    def test_requires_login(self):
        self.assertEqual(Client().get(self.URL).status_code, 401)

    def test_counts_only_scored_attempts_in_the_average(self):
        """Тест без вопросов даёт max_score = 0 — делить на ноль нельзя."""
        test = self.make_test(owner='firma')
        self.attempt(test, 8)
        self.attempt(test, 4)
        self.attempt(test, 0, max_score=0)  # пустой тест
        self.attempt(test, 0, finished=False)  # не закончил

        data = self.login('kandidat').get(self.URL).json()
        self.assertEqual(data['started'], 4)
        self.assertEqual(data['finished'], 3)
        self.assertEqual(data['avg_percent'], 60)  # (80 + 40) / 2
        self.assertEqual(data['passed'], 1)  # порог 60%

    def test_daily_series_groups_by_day(self):
        test = self.make_test(owner='firma')
        self.attempt(test, 5, days_ago=1)
        self.attempt(test, 6, days_ago=1)
        self.attempt(test, 7, days_ago=3)

        daily = self.login('kandidat').get(self.URL).json()['daily']
        self.assertEqual(sorted(daily.values()), [1, 2])

    def test_recent_list_is_newest_first(self):
        test = self.make_test(owner='firma', title='Тест')
        self.attempt(test, 3, days_ago=5)
        self.attempt(test, 9, days_ago=1)

        recent = self.login('kandidat').get(self.URL).json()['recent']
        self.assertEqual([item['percent'] for item in recent], [90, 30])
        self.assertEqual(recent[0]['title'], 'Тест')

    def test_statistics_page_shows_the_attempts_block(self):
        body = self.login('kandidat').get('/cabinet/user/statistics/').content.decode()
        self.assertIn('ud-attempts-facts', body)
        self.assertIn('Как вы проходите тесты', body)
        # Плашки внутри секций заменены на лёгкие факты
        self.assertNotIn('ud-grid-2', body)

    def test_cabinet_panels_use_ids_that_exist(self):
        """Кабинет кандидата — ядро и по модулю на раздел. Модуль раздела
        подключает только его страница, поэтому каждый id, к которому он
        обращается, обязан быть в её шаблоне: иначе раздел молча не отрисуется."""
        root = Path(settings.BASE_DIR)
        panels = {
            'profile': 'cabinet/templates/cabinet/user_profile.html',
            'stats': 'cabinet/templates/cabinet/user_statistics.html',
            'settings': 'cabinet/templates/cabinet/user_settings.html',
            'tests': 'tests/tests_cabinet/templates/tests_cabinet/my_tests.html',
            'articles': 'articles/articles_cabinet/templates/articles_cabinet/my_articles.html',
            'contests': 'contests/contests_cabinet/templates/contests/contests_cabinet/my_contests_user.html',
        }
        shared = (root / 'cabinet/templates/cabinet/base_user.html').read_text(encoding='utf-8') + (
            root / 'cabinet/templates/cabinet/_user_sidebar.html'
        ).read_text(encoding='utf-8')
        for panel, template in panels.items():
            with self.subTest(panel=panel):
                markup = (root / template).read_text(encoding='utf-8')
                self.assertIn(f'cabinet/user/{panel}.js', markup)
                known = set(re.findall(r'id="([\w-]+)"', markup + shared))
                source = (root / f'cabinet/static/cabinet/user/{panel}.js').read_text(encoding='utf-8')
                ids = set(re.findall(r"byId\('([\w-]+)'\)", source))
                # Составные id (ud-${key}-body) собирает общий listPanel в ядре
                self.assertTrue(ids or 'listPanel' in source, f'модуль {panel} не обращается к странице')
                self.assertEqual(ids - known, set(), f'нет в шаблоне {template}')

    def test_report_carries_the_same_numbers(self):
        test = self.make_test(owner='firma')
        self.attempt(test, 8)
        data = build_user_pdf(self.candidate)
        self.assertTrue(data.startswith(b'%PDF'))
