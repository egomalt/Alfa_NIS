"""Публичные профили кандидатов и компаний, ссылки на авторов, контакты."""

import json
import re
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.test import Client
from django.utils import timezone

from authorization.models import Account
from companies.models import Company
from tests.constructor.models import TestAttempt
from users.models import UserProfile

from .base import BaseCase


class ArticleAuthorLinkTests(BaseCase):
    """Блок автора под статьёй ведёт в профиль — и только туда, где он открывается."""

    def _page(self, author):
        article = self.make_article(author=author, title='Статья')
        return Client().get(f'/articles/{article.id}/').content.decode()

    def test_candidate_author_is_linked_by_name(self):
        body = self._page('kandidat')
        self.assertIn('href="/kandidat/"', body)
        self.assertIn('Кандидат', body)  # имя, а не логин
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

    def _profile_css(self, url):
        """Стили, которые подключает страница: тестовый клиент статику
        не отдаёт, поэтому читаем файлы по ссылкам из разметки."""
        body = Client().get(url).content.decode()
        root = Path(settings.BASE_DIR)
        css = []
        for href in re.findall(r'href="/static/(profiles/[\w.]+\.css)', body):
            css.append((root / 'profiles/static' / href).read_text(encoding='utf-8'))
        self.assertTrue(css, f'{url} не подключает стили профиля')
        return '\n'.join(css)

    def test_profile_pages_use_shared_plural_helper(self):
        """Счётчики на профилях склоняются общим countOf из js/core.js,
        а не собственной копией правил в каждом файле."""
        root = Path(settings.BASE_DIR)
        for url, script in ((f'/{self.candidate.username}/', 'user.js'), ('/firma/', 'company.js')):
            with self.subTest(url=url):
                body = Client().get(url).content.decode()
                self.assertIn('js/core.js', body)
                self.assertRegex(body, rf'<script type="module"\s+src="/static/profiles/{script}')
                source = (root / 'profiles/static/profiles' / script).read_text(encoding='utf-8')
                self.assertIn('countOf', source)
                self.assertNotIn('% 10', source)

    def test_avatar_is_drawn_over_the_cover(self):
        """Баннер позиционирован, аватарка — нет: без position он её перекрывал."""
        for url, prefix in ((f'/{self.candidate.username}/', 'pu'), ('/firma/', 'pc')):
            with self.subTest(url=url):
                css = self._profile_css(url)
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
                css = self._profile_css(url)
                rule = re.search(rf'{re.escape(selector)} \{{[^}}]*flex-basis:\s*100%', css)
                self.assertIsNotNone(rule, f'{selector} не занимает всю строку на узком экране')

    def test_company_tests_page_is_reachable_from_profile(self):
        """Раздел «Тесты компании» показывает три штуки — нужна ссылка на полный список."""
        self.make_test(owner='firma', published=True)
        # Статика тестовым клиентом не отдаётся — читаем исходник скрипта
        script = Path(settings.BASE_DIR) / 'profiles/static/profiles/company.js'
        self.assertIn('/tests/">Все тесты компании', script.read_text(encoding='utf-8'))
        self.assertEqual(Client().get('/firma/tests/').status_code, 200)

    def test_company_tests_page_requires_verified_company(self):
        """Страницы кандидата и непроверенной компании не должны открываться."""
        self.assertEqual(Client().get(f'/{self.candidate.username}/tests/').status_code, 404)
        self.assertEqual(Client().get('/net-takoy-logina/tests/').status_code, 404)

    def test_stat_values_are_bottom_aligned(self):
        """Метка в две строки сдвигала число вниз относительно соседних плашек."""
        for url, prefix in ((f'/{self.candidate.username}/', 'pu'), ('/firma/', 'pc')):
            with self.subTest(url=url):
                css = self._profile_css(url)
                rule = re.search(rf'\.{prefix}-stat-value \{{([^}}]*)\}}', css)
                self.assertIsNotNone(rule, f'нет правила .{prefix}-stat-value')
                self.assertIn('margin-top: auto', rule.group(1))


class PublicProfileContentTests(BaseCase):
    """Публичный профиль кандидата: чем он подтверждает навыки и кому виден."""

    URL = '/api/v1/candidates/kandidat/'

    def take(self, test, score, max_score=10, days_ago=0):
        TestAttempt.objects.create(
            test=test,
            candidate_username='kandidat',
            score=score,
            max_score=max_score,
            finished_at=timezone.now() - timedelta(days=days_ago),
        )

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
            Company.objects.filter(username='konkurent').update(verification_status=Company.VERIF_NONE)
            data = self.login('konkurent').get(self.URL).json()['candidate']
            self.assertNotIn('email', data)

        with self.subTest('сам кандидат'):
            data = self.login('kandidat').get(self.URL).json()['candidate']
            self.assertEqual(data['email'], 'me@example.com')

    def test_links_are_normalized_and_filtered(self):
        from users import links

        cleaned = links.clean(
            {
                'github': 'egomalt',
                'telegram': '@egomalt',
                'site': 'example.com',
                'vk': 'кто-то лишний',
            }
        )
        self.assertEqual(
            cleaned,
            {
                'github': 'https://github.com/egomalt',
                'telegram': 'https://t.me/egomalt',
                'site': 'https://example.com',
            },
        )

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


class ContactDetailsTests(BaseCase):
    """Телефон кандидата сохраняется и показывается по тем же правилам, что почта."""

    def test_phone_is_saved_and_returned_to_owner(self):
        client = self.login('kandidat')
        response = client.patch(
            '/api/v1/candidates/kandidat/update/', json.dumps({'name': 'К', 'phone': '+7 900 000-00-00'}), 'application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['candidate']['phone'], '+7 900 000-00-00')

    def test_phone_is_private(self):
        self.login('kandidat').patch(
            '/api/v1/candidates/kandidat/update/', json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json'
        )
        self.assertNotIn('+79000000000', Client().get('/api/v1/candidates/kandidat/').content.decode())

    def test_company_sees_contacts_of_its_participants(self):
        self.login('kandidat').patch(
            '/api/v1/candidates/kandidat/update/', json.dumps({'name': 'К', 'phone': '+79000000000'}), 'application/json'
        )
        contest = self.make_contest(submission_type='text')
        self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})

        data = self.login('firma').get(f'/api/v1/contests/{contest.id}/submissions/').json()
        self.assertEqual(data['submissions'][0]['candidate_phone'], '+79000000000')
