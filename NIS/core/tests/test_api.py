"""Пагинация, число запросов к базе и дымовой обход всех адресов."""
import json
import re
import tempfile
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client, SimpleTestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from articles.constructor.models import Article
from authorization.models import Account, ROLE_USER
from companies import statistics
from companies.models import Company, CompanyRating
from contests.contests_cabinet.models import Contest, ContestSubmission
from exports.company import build_company_pdf, contest_rows, test_rows
from exports.pdf import fit_column_widths, plural
from exports.user import build_user_pdf
from tests.constructor.models import Test, TestAttempt, TestPage
from users.models import UserProfile

from .base import PASSWORD, BaseCase


class PaginationTests(BaseCase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        Article.objects.bulk_create([
            Article(author_username='kandidat', title=f'Статья {i}', status=Article.STATUS_PUBLISHED)
            for i in range(130)
        ])

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
        """Раньше карточка кандидата стоила 2 запроса на каждую заявку."""
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
        Article.objects.bulk_create([
            Article(author_username='kandidat', title=f'С {i}', status=Article.STATUS_PUBLISHED, tags=['python'])
            for i in range(130)
        ])
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


class ArticleAuthorLinkTests(BaseCase):
    """Блок автора под статьёй ведёт в профиль — и только туда, где он открывается."""

    def _page(self, author):
        article = self.make_article(author=author, title='Статья')
        return Client().get(f'/articles/{article.id}/').content.decode()

    def test_candidate_author_is_linked_by_name(self):
        body = self._page('kandidat')
        self.assertIn('href="/kandidat/"', body)
        self.assertIn('Кандидат', body)          # имя, а не логин
        self.assertEqual(Client().get('/kandidat/').status_code, 200)

    def test_verified_company_author_is_linked(self):
        self.assertIn('href="/firma/"', self._page('firma'))

    def test_author_without_public_profile_is_not_linked(self):
        """Ссылка на модератора и на удалённый аккаунт вела бы в 404."""
        self.assertEqual(Client().get('/moder/').status_code, 404)
        self.assertNotIn('href="/moder/"', self._page('moder'))
        self.assertNotIn('href="/udalyonnyy/"', self._page('udalyonnyy'))


class ProfilePageTests(BaseCase):
    """Публичные профили: страница собирается на клиенте, проверяем обвязку."""

    def test_profile_pages_load_plural_helper(self):
        """Счётчики на профилях склоняются общим js/plural.js."""
        for url in (f'/{self.candidate.username}/', '/firma/'):
            with self.subTest(url=url):
                body = Client().get(url).content.decode()
                self.assertIn('js/plural.js', body)

    def test_avatar_is_drawn_over_the_cover(self):
        """Баннер позиционирован, аватарка — нет: без position он её перекрывал."""
        for url, prefix in ((f'/{self.candidate.username}/', 'pu'), ('/firma/', 'pc')):
            with self.subTest(url=url):
                css = Client().get(url).content.decode()
                rule = re.search(rf'\.{prefix}-hero-av \{{([^}}]*)\}}', css)
                self.assertIsNotNone(rule, f'нет правила .{prefix}-hero-av')
                self.assertIn('position: relative', rule.group(1))

    def test_list_rows_wrap_on_a_phone(self):
        """Название стояло в строке с двумя nowrap-соседями и на телефоне
        ужималось до нуля: буква на строку. Лечится переносом строки."""
        pages = (
            ('/firma/', '.pc-row-main'),
            ('/firma/contests/', '.cc-card-main'),
            ('/firma/tests/', '.ct-card-main'),
        )
        for url, selector in pages:
            with self.subTest(url=url):
                css = Client().get(url).content.decode()
                rule = re.search(rf'{re.escape(selector)} \{{[^}}]*flex-basis:\s*100%', css)
                self.assertIsNotNone(rule, f'{selector} не занимает всю строку на узком экране')

    def test_company_tests_page_is_reachable_from_profile(self):
        """Раздел «Тесты компании» показывает три штуки — нужна ссылка на полный список."""
        self.make_test(owner='firma', published=True)
        # Статика тестовым клиентом не отдаётся — читаем исходник скрипта
        script = Path(settings.BASE_DIR) / 'profiles/static/profiles/company.js'
        self.assertIn("/tests/\">Все тесты компании", script.read_text(encoding='utf-8'))
        self.assertEqual(Client().get('/firma/tests/').status_code, 200)

    def test_company_tests_page_requires_verified_company(self):
        """Страницы кандидата и непроверенной компании не должны открываться."""
        self.assertEqual(Client().get(f'/{self.candidate.username}/tests/').status_code, 404)
        self.assertEqual(Client().get('/net-takoy-logina/tests/').status_code, 404)

    def test_stat_values_are_bottom_aligned(self):
        """Метка в две строки сдвигала число вниз относительно соседних плашек."""
        for url, prefix in ((f'/{self.candidate.username}/', 'pu'), ('/firma/', 'pc')):
            with self.subTest(url=url):
                css = Client().get(url).content.decode()
                rule = re.search(rf'\.{prefix}-stat-value \{{([^}}]*)\}}', css)
                self.assertIsNotNone(rule, f'нет правила .{prefix}-stat-value')
                self.assertIn('margin-top: auto', rule.group(1))


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
        ContestSubmission.objects.create(contest=contest, candidate_username='a', winner=True,
                                         status=ContestSubmission.STATUS_ACCEPTED)
        ContestSubmission.objects.create(contest=contest, candidate_username='b')
        ContestSubmission.objects.create(contest=contest, candidate_username='c')

        test = self.make_test(owner='firma')
        TestAttempt.objects.create(test=test, candidate_username='a',
                                   finished_at=timezone.now(), score=1, max_score=1)
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
        TestAttempt.objects.create(test=test, candidate_username='kandidat',
                                   finished_at=timezone.now(), score=8, max_score=10)
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
            TestAttempt.objects.create(test=test, candidate_username='kandidat',
                                       finished_at=timezone.now(), score=score, max_score=10)
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
                TestAttempt.objects.create(test=test, candidate_username='kandidat',
                                           finished_at=timezone.now(), score=1, max_score=1)

        contests = contest_rows('firma')
        tests = test_rows('firma')
        self.assertEqual([c.title for c in contests],
                         ['Конкурс 6', 'Конкурс 5', 'Конкурс 4', 'Конкурс 3', 'Конкурс 2'])
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
        self.assertEqual(picked, ['отзыв', 'отзыва', 'отзывов',
                                  'отзывов', 'отзыв', 'отзыва'])


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
            status=ContestSubmission.STATUS_ACCEPTED)
        ContestSubmission.objects.filter(contest=contest, candidate_username='k1').update(
            status=ContestSubmission.STATUS_REJECTED)

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
        ContestSubmission.objects.filter(pk=old.pk).update(
            created_at=contest.deadline - timedelta(days=60))

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
            test=test, candidate_username=username,
            finished_at=timezone.now(), score=score, max_score=max_score)

    def _url(self, test):
        return f'/api/v1/tests/{test.id}/statistics/'

    def test_only_the_author_sees_it(self):
        test = self.make_test(owner='firma')
        self.assertEqual(Client().get(self._url(test)).status_code, 401)
        self.assertEqual(self.login('kandidat').get(self._url(test)).status_code, 403)
        self.assertEqual(self.login('firma').get(self._url(test)).status_code, 200)

    def test_average_and_pass_rate(self):
        test = self.make_test(owner='firma')
        for i, score in enumerate([4, 3, 2, 0]):   # 100%, 75%, 50%, 0%
            self._finish(test, f'k{i}', score)

        data = self.login('firma').get(self._url(test)).json()['attempts']
        self.assertEqual(data['finished'], 4)
        self.assertEqual(data['avg_percent'], 56)          # (100+75+50+0)/4
        self.assertEqual(data['pass_rate'], 50)            # порог 60%: 100 и 75

    def test_unfinished_attempts_split_into_running_and_abandoned(self):
        """Тот, кто прямо сейчас решает, не должен попадать в «бросили»."""
        test = self.make_test(owner='firma')
        self._finish(test, 'doshel', 4)
        TestAttempt.objects.create(test=test, candidate_username='seychas-reshaet')
        stale = TestAttempt.objects.create(test=test, candidate_username='brosil')
        TestAttempt.objects.filter(pk=stale.pk).update(
            started_at=timezone.now() - timedelta(days=3))

        data = self.login('firma').get(self._url(test)).json()['attempts']
        self.assertEqual(data['started'], 3)
        self.assertEqual(data['finished'], 1)
        self.assertEqual(data['abandoned'], 1)
        self.assertEqual(data['in_progress'], 1)

    def test_test_without_questions_does_not_divide_by_zero(self):
        """max_score = 0 у теста без вопросов — среднее посчитать не из чего."""
        test = self.make_test(owner='firma', with_quiz=False)
        TestAttempt.objects.create(test=test, candidate_username='k',
                                   finished_at=timezone.now(), score=0, max_score=0)

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


class UserTestsSectionTests(BaseCase):
    """«Мои тесты» кандидата собраны из тех же блоков, что раздел компании."""

    URL = '/cabinet/user/tests/'

    def test_page_uses_the_shared_list_components(self):
        body = self.login('kandidat').get(self.URL).content.decode()
        for marker in ('list-card', 'tests-table', 'cr-chip', 'ud-tests-body'):
            with self.subTest(marker=marker):
                self.assertIn(marker, body)
        # Свой список строками и своя квадратная копия чипов больше не нужны
        self.assertNotIn('ud-tests-list', body)
        self.assertNotIn('ud-filter-btn', body)

    def test_rows_offer_statistics_for_published_tests(self):
        """Ссылки «Как проходят тест» в кабинете кандидата не было вовсе."""
        script = Path(settings.BASE_DIR) / 'cabinet/static/cabinet/user.js'
        source = script.read_text(encoding='utf-8')
        self.assertIn("stats/", source)
        self.assertIn('action-icon-btn', source)

    def test_candidate_opens_statistics_of_own_test(self):
        test = self.make_test(owner='kandidat')
        response = self.login('kandidat').get(f'/constructor/{test.id}/stats/')
        self.assertEqual(response.status_code, 200)
        # Кабинет кандидата, а не компании: базовый шаблон выбирается по роли
        self.assertIn('ud-sidebar', response.content.decode())

    def test_draft_title_links_to_preview(self):
        """Публичный адрес черновика отдаёт 404 даже владельцу."""
        test = self.make_test(owner='kandidat', published=False)
        self.assertEqual(Client().get(f'/tests/{test.id}/').status_code, 404)
        client = self.login('kandidat')
        self.assertEqual(client.get(f'/tests/{test.id}/').status_code, 404)
        self.assertEqual(client.get(f'/tests/{test.id}/?preview=1').status_code, 200)

        for path in ('cabinet/static/cabinet/user.js', 'companies/static/companies/app.js'):
            with self.subTest(path=path):
                source = (Path(settings.BASE_DIR) / path).read_text(encoding='utf-8')
                self.assertIn('?preview=1', source)


class CandidateStatisticsTests(BaseCase):
    """Прохождения чужих тестов — главная активность кандидата."""

    URL = '/api/v1/tests/my-attempts/'

    def attempt(self, test, score, max_score=10, finished=True, days_ago=0):
        attempt = TestAttempt.objects.create(
            test=test, candidate_username='kandidat', score=score, max_score=max_score,
            finished_at=timezone.now() - timedelta(days=days_ago) if finished else None)
        return attempt

    def test_requires_login(self):
        self.assertEqual(Client().get(self.URL).status_code, 401)

    def test_counts_only_scored_attempts_in_the_average(self):
        """Тест без вопросов даёт max_score = 0 — делить на ноль нельзя."""
        test = self.make_test(owner='firma')
        self.attempt(test, 8)
        self.attempt(test, 4)
        self.attempt(test, 0, max_score=0)          # пустой тест
        self.attempt(test, 0, finished=False)       # не закончил

        data = self.login('kandidat').get(self.URL).json()
        self.assertEqual(data['started'], 4)
        self.assertEqual(data['finished'], 3)
        self.assertEqual(data['avg_percent'], 60)   # (80 + 40) / 2
        self.assertEqual(data['passed'], 1)         # порог 60%

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

    def test_cabinet_script_guards_on_ids_that_exist(self):
        """Скрипт кабинета выходит по проверке «моя ли это страница».

        Один раз проверка осталась висеть на блоке, который переехал в JS,
        и страница статистики молча опустела целиком. Теперь каждый такой
        якорь обязан существовать хотя бы в одном шаблоне кабинета.
        """
        root = Path(settings.BASE_DIR)
        source = (root / 'cabinet/static/cabinet/user.js').read_text(encoding='utf-8')
        known = set()
        for template in (root / 'cabinet/templates/cabinet').glob('*.html'):
            known |= set(re.findall(r'id="([\w-]+)"', template.read_text(encoding='utf-8')))

        guards = re.findall(r"if \(!document\.getElementById\('([\w-]+)'\)\) return;", source)
        self.assertTrue(guards, 'у разделов кабинета нет проверки на свою страницу')
        for element_id in guards:
            with self.subTest(id=element_id):
                self.assertIn(element_id, known)

    def test_report_carries_the_same_numbers(self):
        test = self.make_test(owner='firma')
        self.attempt(test, 8)
        data = build_user_pdf(self.candidate)
        self.assertTrue(data.startswith(b'%PDF'))


class UserArticlesSectionTests(BaseCase):
    """«Мои статьи» собраны из тех же блоков, что тесты и конкурсы."""

    def test_page_uses_the_shared_table(self):
        body = self.login('kandidat').get('/cabinet/user/articles/').content.decode()
        for marker in ('list-card', 'tests-table', 'cr-chip', 'ud-articles-body'):
            with self.subTest(marker=marker):
                self.assertIn(marker, body)
        self.assertNotIn('ud-articles-list', body)

    def test_views_and_likes_reach_the_cabinet(self):
        """Подробной статистики у статьи нет — числа берутся прямо из карточки."""
        self.make_article(author='kandidat', title='Статья', views=120, likes=7)
        card = self.login('kandidat').get('/api/v1/articles/my/').json()['articles'][0]
        self.assertEqual(card['views'], 120)
        self.assertEqual(card['likes'], 7)
        self.assertEqual(card['status'], 'published')

    def test_draft_opens_in_preview(self):
        """Публичный адрес черновика отдаёт 404 даже автору."""
        draft = self.make_article(author='kandidat', published=False, title='Черновик')
        client = self.login('kandidat')
        self.assertEqual(client.get(f'/articles/{draft.id}/').status_code, 404)
        self.assertEqual(
            client.get(f'/cabinet/user/articles/{draft.id}/preview/').status_code, 200)

        source = (Path(settings.BASE_DIR) / 'cabinet/static/cabinet/user.js').read_text(encoding='utf-8')
        self.assertIn('/preview/', source)


class UserContestsSectionTests(BaseCase):
    """Участия кандидата: список как у компании плюс страница своего решения."""

    def submission(self, candidate='kandidat', **kwargs):
        contest = kwargs.pop('contest', None) or self.make_contest(owner='firma')
        return ContestSubmission.objects.create(
            contest=contest, candidate_username=candidate,
            text='Моё решение', comment='Делал на выходных', **kwargs)

    def test_list_uses_the_shared_table(self):
        body = self.login('kandidat').get('/cabinet/user/contests/').content.decode()
        for marker in ('list-card', 'tests-table', 'cr-chip', 'ud-contests-body'):
            with self.subTest(marker=marker):
                self.assertIn(marker, body)
        self.assertNotIn('ud-contests-list', body)

    def test_history_carries_company_name_and_deadline(self):
        """В таблице стоит название компании и срок, а не один логин."""
        self.submission()
        entry = self.login('kandidat').get('/api/v1/contests/user-history/').json()['submissions'][0]
        self.assertEqual(entry['company_name'], 'Фирма')
        self.assertIsNotNone(entry['deadline'])

    def test_owner_sees_the_whole_submission(self):
        submission = self.submission(status=ContestSubmission.STATUS_ACCEPTED)
        data = self.login('kandidat').get(
            f'/api/v1/contests/my-submissions/{submission.id}/').json()
        self.assertEqual(data['submission']['text'], 'Моё решение')
        self.assertEqual(data['submission']['comment'], 'Делал на выходных')
        self.assertEqual(data['submission']['status'], 'accepted')
        self.assertEqual(data['contest']['company_name'], 'Фирма')

    def test_someone_elses_submission_is_not_reachable(self):
        """Внутри решения файл и переписка — чужое отдавать нельзя."""
        submission = self.submission(candidate='drugoy')
        client = self.login('kandidat')
        self.assertEqual(
            client.get(f'/api/v1/contests/my-submissions/{submission.id}/').status_code, 404)
        self.assertEqual(client.get(f'/cabinet/user/contests/{submission.id}/').status_code, 404)

    def test_submission_page_opens_for_its_author(self):
        submission = self.submission()
        response = self.login('kandidat').get(f'/cabinet/user/contests/{submission.id}/')
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn('us-content', body)
        # Кабинет свои четыре списочных запроса на этой странице не делает
        self.assertIn('panel: "none"', body)


class CabinetSidebarTests(BaseCase):
    """Боковая панель кабинета должна быть одна и та же на всех страницах.

    Раньше их было две: полная в /cabinet/company/* и урезанная копия
    в разделах тестов и конкурсов — без «Статистики», выхода и замков.
    """

    def _company_pages(self):
        contest = self.make_contest(owner='firma')
        test = self.make_test(owner='firma')
        return [
            '/cabinet/company/', '/cabinet/company/statistics/', '/cabinet/company/settings/',
            '/cabinet/company/tests/', '/cabinet/company/contests/',
            f'/cabinet/company/contests/{contest.id}/submissions/',
            f'/constructor/{test.id}/stats/',
        ]

    def test_every_page_has_the_same_sidebar_links(self):
        client = self.login('firma')
        expected = None
        for url in self._company_pages():
            with self.subTest(url=url):
                body = client.get(url).content.decode()
                aside = re.search(r'<aside class="cp-sidebar">(.*?)</aside>', body, re.S)
                self.assertIsNotNone(aside, 'нет общей боковой панели')
                links = set(re.findall(r'href="([^"]+)"', aside.group(1)))
                if expected is None:
                    expected = links
                    self.assertIn('/cabinet/company/statistics/', links)
                self.assertEqual(links, expected)

    def test_sidebar_carries_logout_and_mobile_burger(self):
        client = self.login('firma')
        for url in self._company_pages():
            with self.subTest(url=url):
                body = client.get(url).content.decode()
                self.assertIn('id="cp-logout-btn"', body)
                self.assertIn('data-sidebar-burger', body)
                self.assertIn('cab-scrim', body)

    def test_logout_is_not_duplicated_in_the_top_bar(self):
        """Кнопка выхода живёт только в сайдбаре."""
        pages = self._company_pages() + ['/cabinet/user/', '/cabinet/user/tests/']
        for url in pages:
            with self.subTest(url=url):
                client = self.login('firma' if url.startswith(('/cabinet/company', '/constructor')) else 'kandidat')
                self.assertNotIn('data-logout-btn', client.get(url).content.decode())

    def test_ban_hides_the_account_from_everyone_else(self):
        """Бан означал только «не войти»: профиль и материалы жили дальше."""
        self.make_article(author='kandidat', title='Статья')
        self.make_test(owner='kandidat', title='Тест')
        Account.objects.filter(username='kandidat').update(
            status='banned', ban_until=None, ban_reason='спам')

        anon = Client()
        self.assertEqual(anon.get('/kandidat/').status_code, 404)
        self.assertEqual(anon.get('/kandidat/articles/').status_code, 404)
        catalog = anon.get('/api/v1/articles/catalog/').json()['articles']
        self.assertEqual([a for a in catalog if a['author_username'] == 'kandidat'], [])
        tests = anon.get('/api/v1/tests/catalog/').json()['tests']
        self.assertEqual([t for t in tests if t.get('owner_username') == 'kandidat'], [])

    def test_ban_leaves_the_account_visible_to_itself_and_moderator(self):
        """Иначе человек не узнает ни причину, ни срок."""
        Account.objects.filter(username='kandidat').update(status='banned', ban_reason='спам')
        self.assertEqual(self.login('kandidat').get('/kandidat/').status_code, 200)
        self.assertEqual(self.login('moder').get('/kandidat/').status_code, 200)

    def test_expired_ban_stops_hiding_by_itself(self):
        """status снимается только при входе, поэтому фильтр смотрит на дату."""
        from authorization import bans

        Account.objects.filter(username='kandidat').update(
            status='banned', ban_until=timezone.now() - timedelta(days=1))
        self.assertNotIn('kandidat', bans.banned_usernames())
        self.assertEqual(Client().get('/kandidat/').status_code, 200)

    def test_banned_account_can_read_but_not_write(self):
        Account.objects.filter(username='kandidat').update(status='banned', ban_reason='спам')
        client = self.login('kandidat')

        me = client.get('/api/v1/auth/me/').json()['account']
        self.assertTrue(me['banned'])
        self.assertEqual(me['ban_reason'], 'спам')

        response = client.patch('/api/v1/candidates/kandidat/update/',
                                json.dumps({'name': 'Новое'}), 'application/json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'banned')
        self.assertEqual(Account.objects.get(username='kandidat').name, 'Кандидат')

    def test_banning_a_company_removes_its_contests(self):
        """Конкурс с дедлайном, который никто не разберёт, хуже его отсутствия."""
        self.make_contest(owner='firma')
        self.make_contest(owner='firma', title='Второй')

        response = self.login('moder').post(
            '/api/v1/admin/users/firma/ban/',
            json.dumps({'reason': 'нарушение', 'duration': 'perm'}), 'application/json')
        self.assertEqual(response.json()['contests_removed'], 2)
        self.assertEqual(Contest.objects.filter(company_username='firma').count(), 0)

    def test_submissions_show_a_label_instead_of_a_banned_candidate(self):
        """Работу компания видеть должна, личность заблокированного — нет."""
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(
            contest=contest, candidate_username='kandidat', candidate_name='Кандидат', text='Решение')
        Account.objects.filter(username='kandidat').update(status='banned')

        row = self.login('firma').get(
            f'/api/v1/contests/{contest.id}/submissions/').json()['submissions'][0]
        self.assertEqual(row['candidate_name'], 'Заблокирован')
        self.assertEqual(row['candidate_username'], '')
        self.assertTrue(row['candidate_banned'])
        self.assertEqual(row['candidate_email'], '')
        self.assertEqual(row['text'], 'Решение')

    def test_warnings_are_gone_everywhere(self):
        """Предупреждение сохранялось в аккаунт и жило только в админке —
        до пользователя не доходило ничего. Механики больше нет."""
        from authorization.models import Account as AccountModel

        fields = {f.name for f in AccountModel._meta.get_fields()}
        self.assertNotIn('warning_reason', fields)
        self.assertNotIn('warned_at', fields)
        self.assertNotIn('warned', dict(AccountModel._meta.get_field('status').choices))

        self.assertEqual(
            self.login('moder').post('/api/v1/admin/users/kandidat/warn/').status_code, 404)

        root = Path(settings.BASE_DIR)
        for path in list(root.glob('*/static/**/*.js')) + list(root.glob('*/*/static/**/*.js')) \
                + [root / 'static/js/moderation-bar.js']:
            with self.subTest(file=path.name):
                self.assertNotIn('/warn/', path.read_text(encoding='utf-8'))

    def test_moderation_bar_is_on_every_moderatable_page(self):
        """Панель стояла на четырёх страницах из восьми: на странице теста
        и на публичных списках профиля её не было, и она пропадала на
        первом же переходе с профиля."""
        root = Path(settings.BASE_DIR)
        pages = (
            'articles/articles_app/templates/articles_app/read.html',
            'contests/contests_app/templates/contests/contests_app/contest_view.html',
            'tests/tests_app/templates/tests_app/test_view.html',
            'profiles/templates/profiles/user.html',
            'profiles/templates/profiles/company.html',
            'profiles/templates/profiles/user_articles.html',
            'profiles/templates/profiles/company_tests.html',
            'profiles/templates/profiles/company_contests.html',
        )
        for page in pages:
            with self.subTest(page=page):
                markup = (root / page).read_text(encoding='utf-8')
                self.assertIn('ALFA_MOD_TARGET', markup)
                self.assertIn('moderation-bar.js', markup)

    def test_moderator_can_delete_a_test(self):
        """Тест сносился только скопом, зачисткой всего контента автора."""
        test = self.make_test(owner='kandidat', title='Плохой тест')
        response = self.login('moder').post(f'/api/v1/admin/content/test/{test.id}/delete/')
        self.assertEqual(response.json()['deleted'], 'test')
        self.assertFalse(Test.objects.filter(id=test.id).exists())

        # Обычному пользователю этот адрес недоступен
        other = self.make_test(owner='kandidat')
        self.assertEqual(
            self.login('kandidat').post(f'/api/v1/admin/content/test/{other.id}/delete/').status_code, 403)

    def test_moderation_bar_says_actions_not_author_actions(self):
        source = (Path(settings.BASE_DIR) / 'static/js/moderation-bar.js').read_text(encoding='utf-8')
        self.assertNotIn('Действия с автором', source)
        self.assertNotIn('Действия модератора', source)
        self.assertIn('>Действия<', source)

    def test_only_one_place_renders_the_user_chip(self):
        """На главной лежала копия чипа, знавшая две роли из трёх, —
        модератору там писалось «Кандидат». Копия ещё и затирала собой
        то, что уже нарисовал career.js."""
        root = Path(settings.BASE_DIR)
        renderers = []
        for path in list(root.glob('*/templates/**/*.html')) + list(root.glob('*/*/templates/**/*.html')) \
                + list(root.glob('*/static/**/*.js')) + list(root.glob('*/*/static/**/*.js')):
            if 'cr-user-role' in path.read_text(encoding='utf-8'):
                renderers.append(str(path.relative_to(root)))
        self.assertEqual(renderers, [], 'чип пользователя рисует только static/js/career.js')

    def test_admin_panel_uses_the_shared_chip(self):
        """У админки была своя плашка: серый аватар, логин вместо имени
        и собственные размеры, которые совпадали с общими только вручную."""
        body = self.login('moder').get('/administration/').content.decode()
        self.assertIn('data-user-chip', body)
        self.assertIn('js/career.js', body)
        self.assertNotIn('ap-user-chip', body)

        css = (Path(settings.BASE_DIR)
               / 'administration/dashboard/static/administration/dashboard.css').read_text(encoding='utf-8')
        for rule in ('.ap-user-chip', '.ap-avatar', '.ap-user-name', '.ap-user-role'):
            with self.subTest(rule=rule):
                self.assertNotIn(rule, css)

    def test_chip_mounts_without_an_id(self):
        """Автомонтирование передавало `el.id`, и у контейнера без id
        получался getElementById('') — чип молча не появлялся. В админке
        контейнер именно такой."""
        source = (Path(settings.BASE_DIR) / 'static/js/career.js').read_text(encoding='utf-8')
        self.assertNotIn('mountUserChip(el.id)', source)
        self.assertIn('forEach(mountUserChip)', source)

    def test_every_page_with_the_navbar_can_draw_the_chip(self):
        """Шапка без career.js осталась бы с пустым местом вместо чипа."""
        root = Path(settings.BASE_DIR)
        checked = 0
        for path in root.glob('**/templates/**/*.html'):
            # Партиалы — вставки, скрипт подключает страница, которая их включает
            if 'partials' in path.parts:
                continue
            markup = path.read_text(encoding='utf-8')
            if 'data-user-chip' not in markup and 'partials/navbar.html' not in markup:
                continue
            checked += 1
            with self.subTest(page=str(path.relative_to(root))):
                self.assertIn('js/career.js', markup)
        self.assertGreater(checked, 10, 'страницы с шапкой не нашлись — проверка ничего не проверила')

    def test_user_chip_knows_every_role(self):
        """Подписи те же, что в панели модерации и в шапке админки."""
        source = (Path(settings.BASE_DIR) / 'static/js/career.js').read_text(encoding='utf-8')
        for label in ('Компания', 'Модератор', 'Кандидат'):
            with self.subTest(label=label):
                self.assertIn(label, source)

    def test_logout_button_is_actually_wired(self):
        """Кнопка «Выйти» в кабинете кандидата полгода ничего не делала:
        обработчик сняли вместе с выходом из верхней шапки, а кнопку в
        сайдбаре оставили. Разметка без обработчика выглядит исправной."""
        root = Path(settings.BASE_DIR)
        pairs = (
            ('cabinet/templates/cabinet/_user_sidebar.html', 'cabinet/static/cabinet/user.js', 'ud-logout-btn'),
            ('cabinet/templates/cabinet/_company_sidebar.html', 'cabinet/static/cabinet/company.js', 'cp-logout-btn'),
        )
        for template, script, button_id in pairs:
            with self.subTest(button=button_id):
                markup = (root / template).read_text(encoding='utf-8')
                source = (root / script).read_text(encoding='utf-8')
                self.assertIn(f'id="{button_id}"', markup)
                self.assertIn(button_id, source)
                self.assertIn('auth/signout/', source)

    def test_sidebar_can_be_closed_and_has_no_home_link(self):
        """Панель выезжает поверх страницы — нужен способ её задвинуть."""
        body = self.login('firma').get('/cabinet/company/').content.decode()
        self.assertIn('data-sidebar-close', body)
        # «На главную» убрана: логотип в верхней шапке ведёт туда же
        self.assertNotIn('На главную', body)

    def test_assets_carry_a_single_version(self):
        """Раньше версии проставлялись руками и разъезжались, а career.css
        подключался вообще без версии — правки не доезжали до браузера."""
        body = self.login('firma').get('/cabinet/company/').content.decode()
        versions = set(re.findall(r'\?v=([^"\']+)', body))
        self.assertEqual(versions, {settings.ASSET_VERSION})
        for match in re.findall(r'(?:href|src)="(/static/[^"]+\.(?:css|js))"', body):
            self.fail(f'ссылка на статику без версии: {match}')

    def test_nothing_in_the_cabinet_forces_a_wide_page(self):
        """На телефоне ни один блок не должен требовать ширины больше экрана.

        В career.css стоит body { overflow-x: clip }: то, что не влезло,
        не прокручивается, а молча обрезается — поэтому жёсткие min-width
        должны либо лежать в контейнере с прокруткой, либо сниматься
        в мобильном медиазапросе.
        """
        css = (Path(settings.BASE_DIR)
               / 'contests/contests_cabinet/static/contests/contests_cabinet/contests_cabinet.css'
               ).read_text(encoding='utf-8')

        wide = re.findall(r'min-width: (\d{3,})px', css)
        self.assertTrue(wide, 'правило с min-width пропало — проверьте тест')
        # Таблица конкурсов разворачивается в карточки на узком экране
        mobile = re.search(r'@media \(max-width: 680px\) \{(.*?)\n\}', css, re.S)
        self.assertIsNotNone(mobile, 'нет мобильного медиазапроса для таблицы')
        self.assertIn('min-width: 0', mobile.group(1))
        self.assertIn('.cc-thead { display: none; }', mobile.group(1))

    def test_tests_page_has_status_filters(self):
        """Список тестов фильтруется так же, как список конкурсов."""
        body = self.login('firma').get('/cabinet/company/tests/').content.decode()
        for value in ('all', 'published', 'draft'):
            self.assertIn(f'data-f="{value}"', body)
        self.assertIn('id="tests-filter-count"', body)
        # Пустое состояние различает «нет вовсе» и «не подходит под фильтр»
        self.assertIn('id="tests-empty-title"', body)

    def test_lists_use_the_same_card(self):
        """Списки тестов и конкурсов должны выглядеть одинаково.

        Раньше у каждого была своя карточка со своими фоном и отступами,
        и на телефоне они расходились.
        """
        body = self.login('firma').get('/cabinet/company/tests/').content.decode()
        self.assertIn('class="list-card"', body)
        self.assertIn('class="list-card-header"', body)

        script = (Path(settings.BASE_DIR)
                  / 'contests/contests_cabinet/static/contests/contests_cabinet/company_contests.js'
                  ).read_text(encoding='utf-8')
        self.assertIn('class="list-card"', script)
        self.assertIn('class="list-card-header"', script)
        # Прокрутка живёт внутри карточки, иначе строки распирают страницу
        self.assertIn('class="cc-scroll"', script)

    def test_old_duplicate_sidebar_is_gone(self):
        client = self.login('firma')
        for url in self._company_pages():
            with self.subTest(url=url):
                self.assertNotIn('cc-sidebar', client.get(url).content.decode())

    def test_test_statistics_picks_sidebar_by_role(self):
        """Тесты заводят обе роли — кандидат не должен видеть меню компании."""
        company_test = self.make_test(owner='firma')
        own_test = self.make_test(owner='kandidat')

        company_page = self.login('firma').get(f'/constructor/{company_test.id}/stats/').content.decode()
        self.assertIn('cp-sidebar', company_page)

        candidate_page = self.login('kandidat').get(f'/constructor/{own_test.id}/stats/').content.decode()
        self.assertIn('ud-sidebar', candidate_page)
        self.assertNotIn('cp-sidebar', candidate_page)


class TemplateCommentTests(SimpleTestCase):
    """Комментарии в шаблонах не должны попадать на страницу.

    Django понимает {# … #} только в одну строку: многострочный такой
    комментарий не распознаётся и выводится читателю как обычный текст.
    Для нескольких строк нужен {% comment %}.
    """

    def test_no_multiline_hash_comments(self):
        broken = []
        for path in Path(settings.BASE_DIR).rglob('*.html'):
            if 'venv' in path.parts:
                continue
            text = path.read_text(encoding='utf-8')
            for match in re.finditer(r'\{#', text):
                end = text.find('#}', match.start())
                if end == -1 or '\n' in text[match.start():end]:
                    broken.append(f'{path.relative_to(settings.BASE_DIR)}:{text[:match.start()].count(chr(10)) + 1}')

        self.assertEqual(broken, [], 'многострочный {# #} выводится на страницу, нужен {% comment %}: '
                                     + ', '.join(broken))


class PublicProfileContentTests(BaseCase):
    """Публичный профиль кандидата: чем он подтверждает навыки и кому виден."""

    URL = '/api/v1/candidates/kandidat/'

    def take(self, test, score, max_score=10, days_ago=0):
        TestAttempt.objects.create(
            test=test, candidate_username='kandidat', score=score, max_score=max_score,
            finished_at=timezone.now() - timedelta(days=days_ago))

    def test_strengths_come_from_test_topics(self):
        """Навыки человек вписывает сам, а темы подтверждены чужими тестами."""
        backend = self.make_test(owner='firma', title='Б', stats={'category': 'backend'})
        analytics = self.make_test(owner='firma', title='А', stats={'category': 'analytics'})
        no_topic = self.make_test(owner='firma', title='Без темы')
        self.take(backend, 9)
        self.take(backend, 7)
        self.take(analytics, 5)
        self.take(analytics, 5)
        self.take(no_topic, 10)
        self.take(no_topic, 10)

        strengths = Client().get(self.URL).json()['candidate']['strengths']
        self.assertEqual([s['label'] for s in strengths], ['Backend', 'Аналитика'])
        self.assertEqual(strengths[0]['avg_percent'], 80)
        self.assertEqual(strengths[0]['attempts'], 2)

    def test_single_attempt_is_not_a_strength(self):
        """По одному результату судить не о чем."""
        test = self.make_test(owner='firma', stats={'category': 'backend'})
        self.take(test, 10)
        self.assertEqual(Client().get(self.URL).json()['candidate']['strengths'], [])

    def test_streak_counts_every_kind_of_event(self):
        """Серия про активность на площадке, а не только про тесты."""
        test = self.make_test(owner='firma')
        self.take(test, 5, days_ago=1)
        self.make_article(author='kandidat')  # сегодняшняя статья

        streak = Client().get(self.URL).json()['candidate']['streak']
        self.assertEqual(streak['current'], 2)

    def test_contacts_are_hidden_from_everyone_but_verified_companies(self):
        UserProfile.objects.create(username='kandidat', phone='+7 900 000-00-00')
        Account.objects.filter(username='kandidat').update(email='me@example.com')

        with self.subTest('аноним'):
            data = Client().get(self.URL).json()['candidate']
            self.assertFalse(data['contacts_visible'])
            self.assertNotIn('email', data)

        with self.subTest('другой кандидат'):
            data = self.login('drugoy').get(self.URL).json()['candidate']
            self.assertNotIn('email', data)

        with self.subTest('подтверждённая компания'):
            data = self.login('firma').get(self.URL).json()['candidate']
            self.assertTrue(data['contacts_visible'])
            self.assertEqual(data['email'], 'me@example.com')
            self.assertEqual(data['phone'], '+7 900 000-00-00')

        with self.subTest('неподтверждённая компания'):
            Company.objects.filter(username='konkurent').update(
                verification_status=Company.VERIF_NONE)
            data = self.login('konkurent').get(self.URL).json()['candidate']
            self.assertNotIn('email', data)

        with self.subTest('сам кандидат'):
            data = self.login('kandidat').get(self.URL).json()['candidate']
            self.assertEqual(data['email'], 'me@example.com')

    def test_links_are_normalized_and_filtered(self):
        from users import links

        cleaned = links.clean({
            'github': 'egomalt',
            'telegram': '@egomalt',
            'site': 'example.com',
            'vk': 'кто-то лишний',
        })
        self.assertEqual(cleaned, {
            'github': 'https://github.com/egomalt',
            'telegram': 'https://t.me/egomalt',
            'site': 'https://example.com',
        })

    def test_links_reject_other_schemes(self):
        """«javascript:» с подставленным https:// стал бы ссылкой-мусором."""
        from users import links

        for hostile in ('javascript:alert(1)', 'data:text/html,<script>', 'mailto:a@b.ru'):
            with self.subTest(value=hostile):
                self.assertEqual(links.clean({'site': hostile}), {})

    def test_empty_links_produce_no_chips(self):
        """Кнопка появляется только у заполненной ссылки, а не заглушкой."""
        from users import links

        UserProfile.objects.create(username='kandidat', links=links.clean({'github': 'nick'}))
        shown = Client().get(self.URL).json()['candidate']['links']
        self.assertEqual([item['kind'] for item in shown], ['github'])

        UserProfile.objects.filter(username='kandidat').update(links={})
        self.assertEqual(Client().get(self.URL).json()['candidate']['links'], [])

    def test_settings_page_has_the_link_fields(self):
        page = self.login('kandidat').get('/cabinet/user/settings/').content.decode()
        for field in ('ud-s-github', 'ud-s-telegram', 'ud-s-site'):
            with self.subTest(field=field):
                self.assertIn(field, page)

    def test_profile_no_longer_lists_contests(self):
        """Победы остались плашками и достижениями, ленты участий нет."""
        source = (Path(settings.BASE_DIR) / 'profiles/static/profiles/user.js').read_text(encoding='utf-8')
        self.assertNotIn('pu-tl-row', source)
        self.assertIn('pu-topic-name', source)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CandidateSettingsTests(BaseCase):
    """Настройки кандидата: те же блоки, что у компании."""

    URL = '/api/v1/candidates/kandidat/update/'

    def patch(self, client, payload):
        return client.patch(self.URL, json.dumps(payload), 'application/json')

    def profile(self):
        return UserProfile.objects.get(username='kandidat')

    def test_untouched_fields_survive_a_partial_save(self):
        """Удаление фото не должно заодно стирать «О себе»."""
        UserProfile.objects.create(username='kandidat', bio='Про меня', skills=['Python'])
        client = self.login('kandidat')

        response = self.patch(client, {'name': 'Новое имя'})
        self.assertEqual(response.status_code, 200)

        profile = self.profile()
        self.assertEqual(profile.bio, 'Про меня')
        self.assertEqual(profile.skills, ['Python'])
        self.assertEqual(Account.objects.get(username='kandidat').name, 'Новое имя')

    def test_skills_are_capped(self):
        from users.views import MAX_SKILLS

        self.patch(self.login('kandidat'), {'skills': [f'Навык {i}' for i in range(40)]})
        self.assertEqual(len(self.profile().skills), MAX_SKILLS)

    def test_photo_can_be_uploaded_and_removed(self):
        client = self.login('kandidat')
        photo = SimpleUploadedFile('me.png', b'x' * 100, content_type='image/png')
        response = client.post('/api/v1/candidates/kandidat/avatar/', {'avatar': photo})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(self.profile().avatar)

        response = self.patch(client, {'remove_avatar': True})
        # У кандидата пустое фото сериализуется как null, у компании — как ''
        self.assertFalse(response.json()['candidate']['avatar'])
        self.assertFalse(self.profile().avatar)

    def test_another_candidate_cannot_edit(self):
        self.assertEqual(self.patch(self.login('drugoy'), {'name': 'Чужое'}).status_code, 403)

    def test_page_has_the_skills_editor(self):
        """Вместо строки через запятую — метки, и фото меняется здесь же."""
        page = self.login('kandidat').get('/cabinet/user/settings/').content.decode()
        self.assertIn('ud-skill-chips', page)
        self.assertIn('ud-avatar-preview', page)
        # Общие компоненты, а не копии стилей кабинета компании
        self.assertIn('class="chips"', page)
        self.assertIn('class="pic-row"', page)


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class CompanySettingsTests(BaseCase):
    """Настройки компании: частичное сохранение, направления и логотип."""

    URL = '/api/v1/companies/firma/profile/'

    def firma(self):
        return Company.objects.get(username='firma')

    def test_untouched_fields_survive_a_partial_save(self):
        """Форма связывалась целиком, и смена логотипа стирала адрес."""
        Company.objects.filter(username='firma').update(address='Ленина, 1', city='Москва')

        response = self.login('firma').post(self.URL, {'name': 'Фирма и Ко'})
        self.assertEqual(response.status_code, 200)

        company = self.firma()
        self.assertEqual(company.name, 'Фирма и Ко')
        self.assertEqual(company.address, 'Ленина, 1')
        self.assertEqual(company.city, 'Москва')

    def test_directions_are_saved_as_a_list(self):
        response = self.login('firma').post(self.URL, {'directions': ['Backend', 'Аналитика']})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['company']['directions'], ['Backend', 'Аналитика'])
        self.assertEqual(self.firma().directions, ['Backend', 'Аналитика'])

    def test_directions_drop_duplicates_and_respect_the_limit(self):
        """Потолок в четыре направления сняли, но не до бесконечности."""
        values = ['Backend', 'backend', '  Backend  '] + [f'Направление {i}' for i in range(15)]
        self.login('firma').post(self.URL, {'directions': values})

        saved = self.firma().directions
        self.assertEqual(len(saved), 10)
        self.assertEqual(saved[0], 'Backend')
        self.assertEqual(len([d for d in saved if d.lower() == 'backend']), 1)

    def test_empty_value_clears_directions(self):
        """Клиент шлёт пустое значение, чтобы отличить «очистить» от «не трогать»."""
        Company.objects.filter(username='firma').update(directions=['Backend'])
        self.login('firma').post(self.URL, {'directions': ''})
        self.assertEqual(self.firma().directions, [])

    def test_directions_are_left_alone_when_not_sent(self):
        Company.objects.filter(username='firma').update(directions=['Backend'])
        self.login('firma').post(self.URL, {'name': 'Фирма'})
        self.assertEqual(self.firma().directions, ['Backend'])

    def test_logo_can_be_uploaded_and_removed(self):
        client = self.login('firma')
        logo = SimpleUploadedFile('logo.png', b'x' * 100, content_type='image/png')
        response = client.post(self.URL, {'avatar': logo})
        self.assertTrue(response.json()['company']['avatar_url'])
        self.assertTrue(self.firma().avatar)

        response = client.post(self.URL, {'remove_avatar': '1'})
        self.assertEqual(response.json()['company']['avatar_url'], '')
        self.assertFalse(self.firma().avatar)

    def test_another_company_cannot_edit(self):
        self.assertEqual(self.login('konkurent').post(self.URL, {'name': 'Чужое'}).status_code, 403)
        self.assertEqual(self.firma().name, 'Фирма')

    def test_settings_page_has_the_directions_editor(self):
        """Вместо четырёх полей ввода — список меток с добавлением."""
        page = self.login('firma').get('/cabinet/company/settings/').content.decode()
        self.assertIn('cp-dir-chips', page)
        self.assertIn('cp-logo-preview', page)
        self.assertNotIn('cp-f-dir1', page)


class UploadValidationTests(BaseCase):
    def test_avatar_rejects_svg_and_oversized(self):
        client = self.login('kandidat')
        url = '/api/v1/candidates/kandidat/avatar/'
        svg = SimpleUploadedFile('a.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        self.assertEqual(client.post(url, {'avatar': svg}).status_code, 400)
        big = SimpleUploadedFile('big.png', b'x' * (6 * 1024 * 1024), content_type='image/png')
        self.assertEqual(client.post(url, {'avatar': big}).status_code, 400)
        ok = SimpleUploadedFile('ok.png', b'x' * 1000, content_type='image/png')
        self.assertEqual(client.post(url, {'avatar': ok}).status_code, 200)

    def test_email_is_validated(self):
        client = self.login('kandidat')
        url = '/api/v1/candidates/kandidat/update/'
        good = client.patch(url, json.dumps({'name': 'К', 'email': 'a@b.ru'}), 'application/json')
        self.assertEqual(good.status_code, 200)
        self.assertEqual(Account.objects.get(username='kandidat').email, 'a@b.ru')

        bad = client.patch(url, json.dumps({'name': 'К', 'email': 'не-email'}), 'application/json')
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(Account.objects.get(username='kandidat').email, 'a@b.ru')


class SmokeTests(BaseCase):
    """Ни один адрес не должен отвечать ошибкой 500 ни для одной роли."""

    PAGES = [
        '/', '/companies/', '/articles/', '/tests/', '/contests/', '/constructor/',
        '/cabinet/', '/cabinet/user/', '/cabinet/user/articles/', '/cabinet/user/tests/',
        '/cabinet/user/contests/', '/cabinet/user/settings/', '/cabinet/user/statistics/',
        '/cabinet/user/articles/new/', '/cabinet/company/', '/cabinet/company/settings/',
        '/cabinet/company/statistics/', '/cabinet/company/tests/', '/cabinet/company/contests/',
        '/cabinet/company/contests/new/', '/administration/', '/kandidat/', '/firma/',
        '/firma/tests/',
        '/kandidat/articles/', '/firma/contests/', '/tests/?q=тест', '/tests/?cat=backend',
        '/export/user/statistics.pdf', '/export/company/statistics.pdf', '/export/admin/statistics.pdf',
    ]

    API = [
        '/api/v1/auth/me/', '/api/v1/companies/', '/api/v1/companies/my-ratings/',
        '/api/v1/companies/firma/', '/api/v1/companies/firma/tests/', '/api/v1/companies/firma/contests/',
        '/api/v1/candidates/kandidat/', '/api/v1/candidates/kandidat/articles/',
        '/api/v1/candidates/kandidat/contests/', '/api/v1/articles/catalog/', '/api/v1/articles/my/',
        '/api/v1/tests/', '/api/v1/tests/catalog/', '/api/v1/contests/catalog/',
        '/api/v1/contests/company/', '/api/v1/contests/user-history/',
        '/api/v1/admin/overview/', '/api/v1/admin/verifications/', '/api/v1/admin/users/',
        '/api/v1/admin/reports/', '/api/v1/admin/users/kandidat/content/',
    ]

    def test_no_server_errors_for_any_role(self):
        article = self.make_article(author='kandidat')
        contest = self.make_contest()
        test = self.make_test()
        urls = self.PAGES + self.API + [
            f'/articles/{article.id}/', f'/contests/{contest.id}/', f'/tests/{test.id}/',
            f'/api/v1/tests/{test.id}/', f'/api/v1/tests/{test.id}/view/',
            f'/api/v1/contests/{contest.id}/', f'/api/v1/contests/{contest.id}/submissions/',
            f'/api/v1/contests/{contest.id}/my-submissions/',
        ]
        for username in [None, 'kandidat', 'firma', 'moder']:
            client = self.login(username) if username else Client()
            for url in urls:
                with self.subTest(role=username or 'аноним', url=url):
                    self.assertLess(client.get(url).status_code, 500)

    def test_django_admin_pages_open(self):
        client = self.login('moder')
        for url in ['/django-admin/', '/django-admin/authorization/account/',
                    '/django-admin/companies/company/', '/django-admin/articles_constructor/article/',
                    '/django-admin/constructor/test/', '/django-admin/contests_cabinet/contest/',
                    '/django-admin/admin_reports/report/', '/django-admin/users/userprofile/']:
            with self.subTest(url=url):
                self.assertEqual(client.get(url).status_code, 200)


class ContactDetailsTests(BaseCase):
    """Телефон кандидата: раньше поле было в интерфейсе, но сервер его не знал."""

    def test_phone_is_saved_and_returned_to_owner(self):
        client = self.login('kandidat')
        response = client.patch('/api/v1/candidates/kandidat/update/',
                                json.dumps({'name': 'К', 'phone': '+7 900 000-00-00'}), 'application/json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['candidate']['phone'], '+7 900 000-00-00')

    def test_phone_is_private(self):
        self.login('kandidat').patch('/api/v1/candidates/kandidat/update/',
                                     json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json')
        self.assertNotIn('+79000000000', Client().get('/api/v1/candidates/kandidat/').content.decode())

    def test_company_sees_contacts_of_its_participants(self):
        self.login('kandidat').patch('/api/v1/candidates/kandidat/update/',
                                     json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json')
        contest = self.make_contest(submission_type='text')
        self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})

        data = self.login('firma').get(f'/api/v1/contests/{contest.id}/submissions/').json()
        self.assertEqual(data['submissions'][0]['candidate_phone'], '+79000000000')


class ContestCountersTests(BaseCase):
    """«Решений прислано» всегда показывалось нулём — сервер не отдавал поле."""

    def test_submissions_count_is_returned(self):
        contest = self.make_contest(submission_type='text')
        self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})

        public = Client().get(f'/api/v1/contests/{contest.id}/').json()['contest']
        self.assertEqual(public['submissions_count'], 1)

        cabinet = self.login('firma').get('/api/v1/contests/company/').json()
        target = next(c for c in cabinet['contests'] if c['id'] == contest.id)
        self.assertEqual(target['submissions_count'], 1)

    def test_company_contest_list_stats_are_correct(self):
        self.make_contest(status='draft')
        self.make_contest(status='active')
        self.make_contest(status='finished')
        stats = self.login('firma').get('/api/v1/contests/company/').json()['stats']
        self.assertEqual(stats['total'], 3)
        self.assertEqual(stats['draft'], 1)
        self.assertEqual(stats['active'], 1)
        self.assertEqual(stats['finished'], 1)


class AdminSearchTests(BaseCase):
    """Поиск в админке раньше искал только по имени, хотя показывается логин."""

    def test_search_by_username_and_name(self):
        client = self.login('moder')
        by_login = client.get('/api/v1/admin/users/?q=kandidat').json()['users']
        self.assertTrue(any(u['username'] == 'kandidat' for u in by_login))

        by_name = client.get('/api/v1/admin/users/?q=Фирма').json()['users']
        self.assertTrue(any(u['username'] == 'firma' for u in by_name))


class CompanyCatalogTests(BaseCase):
    """Каталог компаний: порядок и поля, которые читает страница."""

    def test_companies_sorted_by_published_tests(self):
        """Раньше сортировка шла по дате регистрации — пустые карточки лезли наверх."""
        self.make_test(owner='firma', published=True)
        self.make_test(owner='firma', published=True)
        self.make_test(owner='konkurent', published=True)
        self.make_test(owner='konkurent', published=False)   # черновик не в счёт

        companies = Client().get('/api/v1/companies/').json()['companies']
        order = [(c['username'], c['tests_count']) for c in companies]
        self.assertEqual(order[0], ('firma', 2))
        self.assertEqual(order[1], ('konkurent', 1))

    def test_card_fields_present(self):
        company = Client().get('/api/v1/companies/').json()['companies'][0]
        for key in ('username', 'name', 'description', 'industry', 'city',
                    'tests_count', 'avg_rating', 'profile_url', 'avatar_url'):
            self.assertIn(key, company)

    def test_catalog_page_opens(self):
        self.assertEqual(Client().get('/companies/').status_code, 200)


class TestAttemptTests(BaseCase):
    """Учёт прохождений: открытие, завершение и защита от накрутки."""

    def _open(self, client, test):
        return client.get(f'/api/v1/tests/{test.id}/view/')

    def _submit(self, client, test, answers=None):
        return client.post(f'/api/v1/tests/{test.id}/submit/',
                           json.dumps({'answers': answers or {}}), 'application/json')

    def test_opening_records_an_unfinished_attempt(self):
        test = self.make_test(owner='firma')
        self._open(self.login('kandidat'), test)

        attempt = TestAttempt.objects.get(test=test)
        self.assertEqual(attempt.candidate_username, 'kandidat')
        self.assertIsNone(attempt.finished_at)

    def test_reload_does_not_create_a_second_attempt(self):
        """Счётчик раньше накручивался повторной отправкой, попытки — перезагрузкой."""
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
            TestAttempt.objects.create(test=test, candidate_username=f'k{i}',
                                       finished_at=timezone.now(), score=1, max_score=3)

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


class TestsCatalogTests(BaseCase):
    """Каталог тестов: поля карточки и фильтры из адреса."""

    def test_card_fields_present(self):
        self.make_test(owner='firma', published=True)
        test = Client().get('/api/v1/tests/catalog/').json()['tests'][0]
        for key in ('id', 'title', 'description', 'owner_name', 'level',
                    'category', 'page_count', 'submissions', 'url'):
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
            TestAttempt.objects.create(test=test, candidate_username=f'kto{i}',
                                       finished_at=timezone.now(), score=1, max_score=1)
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
        for key in ('id', 'title', 'excerpt', 'status', 'deadline', 'prize',
                    'category', 'participants_count', 'company_name'):
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
