"""Страница помощи: карта сайта должна вести туда, куда обещает."""

import subprocess
import sys
from html.parser import HTMLParser
from urllib.parse import urlsplit

from django.test import Client
from django.urls import NoReverseMatch, Resolver404, resolve, reverse

from home.help_content import HELP_GUIDES
from home.views import SITE_MAP
from profiles.views import profile_view

from .base import BaseCase


class HelpLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        if tag == 'a' and attrs.get('href'):
            self.links.append(attrs['href'])


class HelpPageTests(BaseCase):
    URL = '/help/'

    def test_open_to_everyone(self):
        body = Client().get(self.URL).content.decode()
        for anchor in ('id="map"', 'id="candidate"', 'id="company"', 'id="faq"'):
            self.assertIn(anchor, body)

    def test_every_map_link_leads_to_a_real_page(self):
        """Карта хранит имена маршрутов: опечатка в имени сломала бы всю страницу,
        а маршрут, пойманный каталогом профилей, дал бы 404."""
        for group in SITE_MAP:
            for title, _, name, _ in group['items']:
                if name is None:
                    continue
                with self.subTest(section=title, name=name):
                    try:
                        match = resolve(reverse(name))
                    except (NoReverseMatch, Resolver404):
                        self.fail(f'{name} никуда не ведёт')
                    self.assertIsNot(match.func, profile_view)

    def test_hint_depends_on_role(self):
        self.assertNotIn('hp-hint', Client().get(self.URL).content.decode())
        self.assertIn('Вы вошли как кандидат', self.login('kandidat').get(self.URL).content.decode())
        company = self.login('firma').get(self.URL).content.decode()
        self.assertIn('Вы вошли как компания', company)
        self.assertIn('href="/cabinet/company/"', company)

    def test_linked_from_the_navbar(self):
        body = Client().get('/').content.decode()
        self.assertIn('href="/help/"', body)

    def test_help_is_reserved_as_a_username(self):
        response = Client().post(
            '/api/v1/auth/signup/',
            {
                'name': 'Хелп',
                'username': 'help',
                'email': 'help@example.com',
                'password': 'Prochniy-Parol-77',
                'password_confirm': 'Prochniy-Parol-77',
            },
        )
        self.assertEqual(response.status_code, 400)

    def test_guides_and_links_work_for_every_role(self):
        for username in (None, 'kandidat', 'firma', 'moder'):
            with self.subTest(username=username):
                response = self.login(username).get(self.URL)
                self.assertEqual(response.status_code, 200)
                page = HelpLinks()
                page.feed(response.content.decode())
                self.assertEqual(len(page.ids), len(set(page.ids)), 'Повторяющиеся якоря в помощи')
                for group in HELP_GUIDES:
                    self.assertIn(group['id'], page.ids)
                    for guide in group['items']:
                        self.assertIn(guide['id'], page.ids)
                for href in page.links:
                    link = urlsplit(href)
                    if link.scheme or link.netloc:
                        continue
                    if link.fragment and link.path in ('', self.URL):
                        self.assertIn(link.fragment, page.ids, href)
                    if link.path:
                        match = resolve(link.path)
                        self.assertIsNot(match.func, profile_view, href)
                if username == 'moder':
                    self.assertContains(response, 'Вы вошли как модератор')

    def test_editors_link_to_their_instructions(self):
        cases = (
            ('kandidat', 'constructor_page', 'test-create'),
            ('firma', 'constructor_page', 'test-create'),
            ('kandidat', 'article_constructor_new', 'article-create'),
            ('firma', 'contest_constructor_new', 'contest-create'),
            ('moder', 'admin_dashboard', 'moderation-guide'),
        )
        for username, route, anchor in cases:
            with self.subTest(route=route, username=username):
                response = self.login(username).get(reverse(route))
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, f'href="{self.URL}#{anchor}"')
                if route == 'constructor_page':
                    self.assertContains(response, f'href="{self.URL}#test-cases"')

    def test_documented_code_example_matches_its_test_case(self):
        examples = [guide['example'] for group in HELP_GUIDES for guide in group['items'] if 'example' in guide]
        self.assertTrue(examples)
        for example in examples:
            result = subprocess.run(
                [sys.executable, '-c', example['code']],
                input=example['input'],
                capture_output=True,
                text=True,
                timeout=5,
                check=True,
            )
            self.assertEqual(result.stdout.rstrip('\n'), example['output'])
