"""Страница помощи: карта сайта должна вести туда, куда обещает."""
from django.test import Client
from django.urls import Resolver404, resolve

from home.views import SITE_MAP
from profiles.views import profile_view

from .base import BaseCase


class HelpPageTests(BaseCase):
    URL = '/help/'

    def test_open_to_everyone(self):
        body = Client().get(self.URL).content.decode()
        for anchor in ('id="map"', 'id="candidate"', 'id="company"', 'id="faq"'):
            self.assertIn(anchor, body)

    def test_every_map_link_leads_to_a_real_page(self):
        """Ссылка на несуществующий раздел упала бы в каталог профилей и дала 404."""
        for group in SITE_MAP:
            for title, _, url, _ in group['items']:
                if url is None:
                    continue
                with self.subTest(section=title, url=url):
                    try:
                        match = resolve(url)
                    except Resolver404:
                        self.fail(f'{url} никуда не ведёт')
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
        response = Client().post('/api/v1/auth/signup/', {
            'name': 'Хелп', 'username': 'help', 'email': 'help@example.com',
            'password': 'Prochniy-Parol-77', 'password_confirm': 'Prochniy-Parol-77',
        })
        self.assertEqual(response.status_code, 400)
