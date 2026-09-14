"""Пагинация, число запросов к базе и дымовой обход всех адресов."""
import json
import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client, SimpleTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from articles.constructor.models import Article
from authorization.models import Account, ROLE_USER
from contests.contests_cabinet.models import ContestSubmission
from tests.constructor.models import TestAttempt, TestPage
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
