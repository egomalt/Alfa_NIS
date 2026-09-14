"""Авторизация: пароли, блокировка, доступ в админку Django."""
from django.test import Client
from django.utils import timezone

from authorization.models import Account, ROLE_USER, STATUS_BANNED
from companies.models import Company
from users.models import UserProfile

from .base import PASSWORD, BaseCase


class RegistrationTests(BaseCase):
    def _signup(self, username, password, confirm=None, role='candidate'):
        return Client().post('/api/v1/auth/signup/', {
            'name': 'Новый', 'username': username, 'email': f'{username}@example.ru',
            'password': password, 'password_confirm': confirm if confirm is not None else password,
            'role': role,
        })

    def test_weak_password_rejected(self):
        response = self._signup('slabiy', '123')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Account.objects.filter(username='slabiy').exists())

    def test_password_mismatch_rejected(self):
        self.assertEqual(self._signup('raznie', PASSWORD, 'Drugoy-Parol-77').status_code, 400)

    def test_error_messages_are_russian(self):
        errors = self._signup('slabiy', '123').json()['errors']['password']
        self.assertTrue(all(any(c.isalpha() and c.lower() in 'абвгдежзийклмнопрстуфхцчшщъыьэюя'
                                for c in e['message']) for e in errors))

    def test_candidate_signup_creates_profile_and_logs_in(self):
        response = self._signup('ivan-test', PASSWORD)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(UserProfile.objects.filter(username='ivan-test').exists())
        client = Client()
        client.post('/api/v1/auth/signin/', {'username': 'ivan-test', 'password': PASSWORD})
        self.assertEqual(client.get('/api/v1/auth/me/').json()['account']['username'], 'ivan-test')

    def test_company_signup_creates_company_card(self):
        self.assertEqual(self._signup('romashka', PASSWORD, role='company').status_code, 201)
        self.assertTrue(Company.objects.filter(username='romashka').exists())


class PasswordStorageTests(BaseCase):
    def test_password_is_hashed_not_stored(self):
        account = Account.objects.get(username='kandidat')
        self.assertNotIn(PASSWORD, account.password)
        self.assertTrue(account.password.startswith('pbkdf2_sha256$'))

    def test_check_password(self):
        account = Account.objects.get(username='kandidat')
        self.assertTrue(account.check_password(PASSWORD))
        self.assertFalse(account.check_password('nepravilniy'))

    def test_account_without_password_cannot_log_in(self):
        legacy = Account.objects.create(username='legacy', name='Старый', role=ROLE_USER)
        self.assertFalse(legacy.check_password(''))
        response = Client().post('/api/v1/auth/signin/', {'username': 'legacy', 'password': ''})
        self.assertIn(response.status_code, (400, 401))


class LoginTests(BaseCase):
    def test_login_without_password_rejected(self):
        """Главная дыра: раньше хватало одного имени пользователя."""
        response = Client().post('/api/v1/auth/signin/', {'username': 'kandidat'})
        self.assertEqual(response.status_code, 400)

    def test_wrong_password_rejected(self):
        response = Client().post('/api/v1/auth/signin/', {'username': 'kandidat', 'password': 'x'})
        self.assertEqual(response.status_code, 401)

    def test_unknown_account_indistinguishable_from_wrong_password(self):
        """Иначе перебором можно узнать, какие логины существуют."""
        wrong = Client().post('/api/v1/auth/signin/', {'username': 'kandidat', 'password': 'x'})
        ghost = Client().post('/api/v1/auth/signin/', {'username': 'takogo-net', 'password': 'x'})
        self.assertEqual(wrong.status_code, ghost.status_code)
        self.assertEqual(wrong.json(), ghost.json())

    def test_successful_login_and_logout(self):
        client = self.login('kandidat')
        self.assertIsNotNone(client.get('/api/v1/auth/me/').json()['account'])
        client.post('/api/v1/auth/signout/')
        self.assertIsNone(client.get('/api/v1/auth/me/').json()['account'])

    def test_session_id_changes_on_login(self):
        """Защита от session fixation."""
        client = Client()
        client.get('/authorization/signin/')
        before = client.cookies.get('sessionid')
        before = before.value if before else None
        client.post('/api/v1/auth/signin/', {'username': 'kandidat', 'password': PASSWORD})
        after = client.cookies.get('sessionid')
        self.assertNotEqual(before, after.value if after else None)


class BanTests(BaseCase):
    def test_ban_applies_to_existing_session(self):
        """Раньше забаненный доживал на старой сессии до 30 дней."""
        client = self.login('kandidat')
        self.assertIsNotNone(client.get('/api/v1/auth/me/').json()['account'])

        Account.objects.filter(username='kandidat').update(status=STATUS_BANNED, ban_until=None)
        self.assertIsNone(client.get('/api/v1/auth/me/').json()['account'])

    def test_banned_cannot_log_in_and_sees_reason(self):
        Account.objects.filter(username='kandidat').update(
            status=STATUS_BANNED, ban_until=None, ban_reason='спам')
        response = Client().post('/api/v1/auth/signin/', {'username': 'kandidat', 'password': PASSWORD})
        self.assertEqual(response.status_code, 403)
        message = response.json()['errors']['username'][0]['message']
        self.assertIn('заблокирован', message.lower())
        self.assertIn('спам', message)

    def test_expired_ban_lifts_itself(self):
        Account.objects.filter(username='kandidat').update(
            status=STATUS_BANNED, ban_until=timezone.now() - timezone.timedelta(days=1))
        response = Client().post('/api/v1/auth/signin/', {'username': 'kandidat', 'password': PASSWORD})
        self.assertEqual(response.status_code, 200)


class DjangoAdminAccessTests(BaseCase):
    def test_only_moderator_is_staff(self):
        self.assertTrue(self.moderator.is_staff)
        self.assertFalse(self.candidate.is_staff)
        self.assertFalse(self.company.is_staff)

    def test_moderator_can_open_admin(self):
        self.assertEqual(self.login('moder').get('/django-admin/').status_code, 200)

    def test_others_cannot_open_admin(self):
        self.assertIn(self.login('firma').get('/django-admin/').status_code, (302, 403))
        self.assertIn(Client().get('/django-admin/').status_code, (302, 403))
