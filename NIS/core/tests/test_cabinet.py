"""Кабинеты кандидата и компании: разделы, сайдбар, настройки, загрузка файлов."""

import json
import re
import tempfile
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from django.utils import timezone

from authorization.models import Account
from companies.models import Company
from contests.contests_cabinet.models import Contest, ContestSubmission
from tests.constructor.models import Test
from users.models import UserProfile

from .base import BaseCase


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
        script = Path(settings.BASE_DIR) / 'cabinet/static/cabinet/user/tests.js'
        source = script.read_text(encoding='utf-8')
        self.assertIn('stats/', source)
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

        for path in ('cabinet/static/cabinet/user/tests.js', 'companies/static/companies/app.js'):
            with self.subTest(path=path):
                source = (Path(settings.BASE_DIR) / path).read_text(encoding='utf-8')
                self.assertIn('?preview=1', source)


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
        self.assertEqual(client.get(f'/cabinet/user/articles/{draft.id}/preview/').status_code, 200)

        source = (Path(settings.BASE_DIR) / 'cabinet/static/cabinet/user/articles.js').read_text(encoding='utf-8')
        self.assertIn('/preview/', source)


class UserContestsSectionTests(BaseCase):
    """Участия кандидата: список как у компании плюс страница своего решения."""

    def submission(self, candidate='kandidat', **kwargs):
        contest = kwargs.pop('contest', None) or self.make_contest(owner='firma')
        return ContestSubmission.objects.create(
            contest=contest, candidate_username=candidate, text='Моё решение', comment='Делал на выходных', **kwargs
        )

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
        data = self.login('kandidat').get(f'/api/v1/contests/my-submissions/{submission.id}/').json()
        self.assertEqual(data['submission']['text'], 'Моё решение')
        self.assertEqual(data['submission']['comment'], 'Делал на выходных')
        self.assertEqual(data['submission']['status'], 'accepted')
        self.assertEqual(data['contest']['company_name'], 'Фирма')

    def test_someone_elses_submission_is_not_reachable(self):
        """Внутри решения файл и переписка — чужое отдавать нельзя."""
        submission = self.submission(candidate='drugoy')
        client = self.login('kandidat')
        self.assertEqual(client.get(f'/api/v1/contests/my-submissions/{submission.id}/').status_code, 404)
        self.assertEqual(client.get(f'/cabinet/user/contests/{submission.id}/').status_code, 404)

    def test_submission_page_opens_for_its_author(self):
        submission = self.submission()
        response = self.login('kandidat').get(f'/cabinet/user/contests/{submission.id}/')
        self.assertEqual(response.status_code, 200)
        body = response.content.decode()
        self.assertIn('us-content', body)
        # Кабинет свои четыре списочных запроса на этой странице не делает
        self.assertIn('"panel": "none"', body)


class CabinetSidebarTests(BaseCase):
    """Боковая панель кабинета должна быть одна и та же на всех страницах."""

    def _company_pages(self):
        contest = self.make_contest(owner='firma')
        test = self.make_test(owner='firma')
        return [
            '/cabinet/company/',
            '/cabinet/company/statistics/',
            '/cabinet/company/settings/',
            '/cabinet/company/tests/',
            '/cabinet/company/contests/',
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
        Account.objects.filter(username='kandidat').update(status='banned', ban_until=None, ban_reason='спам')

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

        Account.objects.filter(username='kandidat').update(status='banned', ban_until=timezone.now() - timedelta(days=1))
        self.assertNotIn('kandidat', bans.banned_usernames())
        self.assertEqual(Client().get('/kandidat/').status_code, 200)

    def test_banned_account_can_read_but_not_write(self):
        Account.objects.filter(username='kandidat').update(status='banned', ban_reason='спам')
        client = self.login('kandidat')

        me = client.get('/api/v1/auth/me/').json()['account']
        self.assertTrue(me['banned'])
        self.assertEqual(me['ban_reason'], 'спам')

        response = client.patch('/api/v1/candidates/kandidat/update/', json.dumps({'name': 'Новое'}), 'application/json')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()['code'], 'banned')
        self.assertEqual(Account.objects.get(username='kandidat').name, 'Кандидат')

    def test_banning_a_company_removes_its_contests(self):
        """Конкурс с дедлайном, который никто не разберёт, хуже его отсутствия."""
        self.make_contest(owner='firma')
        self.make_contest(owner='firma', title='Второй')

        response = self.login('moder').post(
            '/api/v1/admin/users/firma/ban/', json.dumps({'reason': 'нарушение', 'duration': 'perm'}), 'application/json'
        )
        self.assertEqual(response.json()['contests_removed'], 2)
        self.assertEqual(Contest.objects.filter(company_username='firma').count(), 0)

    def test_submissions_show_a_label_instead_of_a_banned_candidate(self):
        """Работу компания видеть должна, личность заблокированного — нет."""
        contest = self.make_contest(owner='firma')
        ContestSubmission.objects.create(
            contest=contest, candidate_username='kandidat', candidate_name='Кандидат', text='Решение'
        )
        Account.objects.filter(username='kandidat').update(status='banned')

        row = self.login('firma').get(f'/api/v1/contests/{contest.id}/submissions/').json()['submissions'][0]
        self.assertEqual(row['candidate_name'], 'Заблокирован')
        self.assertEqual(row['candidate_username'], '')
        self.assertTrue(row['candidate_banned'])
        self.assertEqual(row['candidate_email'], '')
        self.assertEqual(row['text'], 'Решение')

    def test_warnings_are_gone_everywhere(self):
        """Предупреждений в проекте нет — от аккаунта не должно остаться следов."""
        from authorization.models import Account as AccountModel

        fields = {f.name for f in AccountModel._meta.get_fields()}
        self.assertNotIn('warning_reason', fields)
        self.assertNotIn('warned_at', fields)
        self.assertNotIn('warned', dict(AccountModel._meta.get_field('status').choices))

        self.assertEqual(self.login('moder').post('/api/v1/admin/users/kandidat/warn/').status_code, 404)

        root = Path(settings.BASE_DIR)
        for path in (
            list(root.glob('*/static/**/*.js')) + list(root.glob('*/*/static/**/*.js')) + [root / 'static/js/moderation-bar.js']
        ):
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
                # Цель модерации страница объявляет в своих данных
                self.assertIn('modType=', markup)
                self.assertIn('moderation-bar.js', markup)

    def test_moderator_can_delete_a_test(self):
        """Тест сносился только скопом, зачисткой всего контента автора."""
        test = self.make_test(owner='kandidat', title='Плохой тест')
        response = self.login('moder').post(f'/api/v1/admin/content/test/{test.id}/delete/')
        self.assertEqual(response.json()['deleted'], 'test')
        self.assertFalse(Test.objects.filter(id=test.id).exists())

        # Обычному пользователю этот адрес недоступен
        other = self.make_test(owner='kandidat')
        self.assertEqual(self.login('kandidat').post(f'/api/v1/admin/content/test/{other.id}/delete/').status_code, 403)

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
        for path in (
            list(root.glob('*/templates/**/*.html'))
            + list(root.glob('*/*/templates/**/*.html'))
            + list(root.glob('*/static/**/*.js'))
            + list(root.glob('*/*/static/**/*.js'))
        ):
            if 'cr-user-role' in path.read_text(encoding='utf-8'):
                renderers.append(str(path.relative_to(root)))
        self.assertEqual(renderers, [], 'чип пользователя рисует только static/js/career.js')

    def test_admin_panel_uses_the_shared_navbar(self):
        """Своя шапка не имела ни одной ссылки: из панели нельзя было уйти
        никуда, кроме главной по логотипу."""
        body = self.login('moder').get('/administration/').content.decode()
        self.assertIn('cr-navbar', body)
        self.assertNotIn('ap-navbar', body)
        self.assertNotIn('ap-admin-tag', body)
        for section in ('/companies/', '/articles/', '/tests/', '/contests/'):
            with self.subTest(section=section):
                self.assertIn(f'href="{section}"', body)

    def test_admin_panel_uses_the_shared_chip(self):
        """У админки была своя плашка: серый аватар, логин вместо имени
        и собственные размеры, которые совпадали с общими только вручную."""
        body = self.login('moder').get('/administration/').content.decode()
        self.assertIn('data-user-chip', body)
        self.assertIn('js/career.js', body)
        self.assertNotIn('ap-user-chip', body)

        css = (Path(settings.BASE_DIR) / 'administration/dashboard/static/administration/dashboard.css').read_text(
            encoding='utf-8'
        )
        for rule in ('.ap-user-chip', '.ap-avatar', '.ap-user-name', '.ap-user-role'):
            with self.subTest(rule=rule):
                self.assertNotIn(rule, css)

    def test_admin_sidebar_stays_on_screen(self):
        """Панель тянулась вместе со страницей: на длинном списке до кнопки
        «Выйти» приходилось листать весь список до конца."""
        css = (Path(settings.BASE_DIR) / 'administration/dashboard/static/administration/dashboard.css').read_text(
            encoding='utf-8'
        )
        rule = re.search(r'\.ap-sidebar \{([^}]*)\}', css)
        self.assertIsNotNone(rule, 'нет правила .ap-sidebar')
        self.assertIn('position: sticky', rule.group(1))
        self.assertIn('overflow-y: auto', rule.group(1))

    def test_admin_cards_wrap_on_a_phone(self):
        """Карточка заявки была одной нерезиновой строкой: аватар, название,
        чип документа и две кнопки. Названию оставалось меньше ширины буквы,
        и оно переносилось по одному символу."""
        css = (Path(settings.BASE_DIR) / 'administration/dashboard/static/administration/dashboard.css').read_text(
            encoding='utf-8'
        )
        phone = re.search(r'@media \(max-width: 560px\) \{(.*?)\n\}', css, re.S)
        self.assertIsNotNone(phone, 'у админки нет телефонного медиазапроса')
        for rule in ('.ap-verify-card', '.ap-verify-main', '.ap-search-input'):
            with self.subTest(rule=rule):
                self.assertIn(rule, phone.group(1))
        # Чип документа обрезается, а не растягивает карточку
        doc = re.search(r'\.ap-verify-doc \{([^}]*)\}', css)
        self.assertIn('text-overflow: ellipsis', doc.group(1))

    def test_admin_table_cells_cannot_overflow(self):
        """Плашка «Забанен до 2 октября 2026 г.» вылезала на соседнюю
        колонку: ячейка грида не сжимается ниже содержимого без minmax(0)."""
        css = (Path(settings.BASE_DIR) / 'administration/dashboard/static/administration/dashboard.css').read_text(
            encoding='utf-8'
        )
        rule = re.search(r'\.ap-trow \{([^}]*)\}', css)
        self.assertIsNotNone(rule, 'нет правила .ap-trow')
        self.assertIn('minmax(0', rule.group(1))
        self.assertIn('.ap-trow > * { min-width: 0; }', ' '.join(css.split()))

    def test_chip_mounts_without_an_id(self):
        """Автомонтирование передавало `el.id`, и у контейнера без id
        получался getElementById('') — чип молча не появлялся. В админке
        контейнер именно такой."""
        source = (Path(settings.BASE_DIR) / 'static/js/career.js').read_text(encoding='utf-8')
        self.assertNotIn('el.id', source)
        self.assertIn("querySelectorAll('[data-user-chip]')", source)
        self.assertIn('chips.forEach((chip) => renderChip(chip, account))', source)

    def test_every_page_with_the_navbar_can_draw_the_chip(self):
        """Шапка без career.js осталась бы с пустым местом вместо чипа.
        Скрипт подключает templates/base.html — страница должна от него
        наследоваться (напрямую или через базу кабинета)."""
        from django.template.loader import get_template

        root = Path(settings.BASE_DIR)
        self.assertIn('js/career.js', (root / 'templates/base.html').read_text(encoding='utf-8'))

        def extends_base(template_name, depth=0):
            source = get_template(template_name).template.source
            match = re.search(r"{%\s*extends\s+['\"]([^'\"]+)['\"]", source)
            if 'js/career.js' in source:
                return True
            return bool(match) and depth < 5 and extends_base(match.group(1), depth + 1)

        checked = 0
        for path in root.glob('**/templates/**/*.html'):
            # Партиалы — вставки, скрипт подключает страница, которая их включает
            if 'partials' in path.parts or 'venv' in path.parts:
                continue
            markup = path.read_text(encoding='utf-8')
            if 'data-user-chip' not in markup and 'partials/navbar.html' not in markup:
                continue
            checked += 1
            relative = path.relative_to(root).as_posix()
            with self.subTest(page=relative):
                self.assertTrue(
                    extends_base(relative.split('templates/', 1)[1]), 'страница не наследует base.html и не подключает career.js'
                )
        self.assertGreaterEqual(checked, 10, 'страницы с шапкой не нашлись — проверка ничего не проверила')

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
            ('cabinet/templates/cabinet/_user_sidebar.html', 'cabinet/static/cabinet/user/cabinet.js', 'ud-logout-btn'),
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
        """Вся статика подключается с одной версией и ни одна — без неё."""
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
        css = (
            Path(settings.BASE_DIR) / 'contests/contests_cabinet/static/contests/contests_cabinet/contests_cabinet.css'
        ).read_text(encoding='utf-8')

        wide = re.findall(r'min-width: (\d{3,})px', css)
        self.assertTrue(wide, 'правило с min-width пропало — проверьте тест')
        # Таблица конкурсов разворачивается в карточки на узком экране
        mobile = re.search(r'@media \(max-width: 680px\) \{(.*?)\n\}', css, re.S)
        self.assertIsNotNone(mobile, 'нет мобильного медиазапроса для таблицы')
        self.assertIn('min-width: 0', mobile.group(1))
        self.assertIn('.cc-thead { display: none; }', ' '.join(mobile.group(1).split()))

    def test_tests_page_has_status_filters(self):
        """Список тестов фильтруется так же, как список конкурсов."""
        body = self.login('firma').get('/cabinet/company/tests/').content.decode()
        for value in ('all', 'published', 'draft'):
            self.assertIn(f'data-f="{value}"', body)
        self.assertIn('id="tests-filter-count"', body)
        # Пустое состояние различает «нет вовсе» и «не подходит под фильтр»
        self.assertIn('id="tests-empty-title"', body)

    def test_lists_use_the_same_card(self):
        """Списки тестов и конкурсов собраны из одной и той же карточки."""
        body = self.login('firma').get('/cabinet/company/tests/').content.decode()
        self.assertIn('class="list-card"', body)
        self.assertIn('class="list-card-header"', body)

        script = (
            Path(settings.BASE_DIR) / 'contests/contests_cabinet/static/contests/contests_cabinet/company_contests.js'
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
