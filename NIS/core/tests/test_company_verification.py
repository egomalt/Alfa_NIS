from datetime import timedelta
from pathlib import Path
from unittest import mock

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import DatabaseError
from django.test import Client
from django.utils import timezone

from authorization.models import Account
from companies.models import Company
from core.uploads import MAX_DOCUMENT_SIZE
from tests.constructor.models import Test

from .base import BaseCase, image_upload


class CompanyVerificationTests(BaseCase):
    PROFILE = '/api/v1/companies/firma/profile/'
    VERIFY = '/api/v1/companies/firma/verification/'

    def setUp(self):
        self.company = Company.objects.get(username='firma')
        self.company.registration_document.save('registration.pdf', ContentFile(b'%PDF-1.4 original'), save=False)
        self.company.verification_reason = 'Прежнее решение модератора'
        self.company.submitted_at = timezone.now() - timedelta(days=2)
        self.company.verified_at = timezone.now() - timedelta(days=1)
        self.company.save()
        self.previous = self.company.registration_document.name
        self.storage = self.company.registration_document.storage
        self.original_state = self.state()

    def state(self):
        return Company.objects.filter(pk=self.company.pk).values().get()

    def files(self):
        return {
            path
            for root in (settings.MEDIA_ROOT, settings.PRIVATE_MEDIA_ROOT)
            for path in Path(root).rglob('*')
            if path.is_file()
        }

    def pdf(self, name='replacement.pdf', content=b'%PDF-1.4 replacement'):
        return SimpleUploadedFile(name, content, content_type='application/pdf')

    def upload(self, client=None, **extra):
        return (client or self.login('firma')).post(self.VERIFY, {'registration_document': self.pdf(), **extra})

    def assert_unchanged(self, files):
        self.assertEqual(self.state(), self.original_state)
        self.assertEqual(self.files(), files)
        self.assertTrue(self.storage.exists(self.previous))
        with self.storage.open(self.previous, 'rb') as document:
            self.assertEqual(document.read(), b'%PDF-1.4 original')

    def test_profile_cannot_rename_the_company(self):
        files = self.files()
        account_id = Account.objects.get(username='firma').pk
        response = self.login('firma').post(self.PROFILE, {'username': 'renamed-company', 'name': 'Другое название'})
        self.assertEqual(response.status_code, 400)
        self.assert_unchanged(files)
        self.assertEqual(Account.objects.get(pk=account_id).username, 'firma')
        self.assertFalse(Company.objects.filter(username='renamed-company').exists())
        self.assertEqual(Client().get('/firma/').status_code, 200)

    def test_profile_cannot_replace_the_document_or_save_other_changes(self):
        files = self.files()
        response = self.login('firma').post(
            self.PROFILE,
            {'registration_document': self.pdf(), 'avatar': image_upload(), 'name': 'Другое название'},
        )
        self.assertEqual(response.status_code, 400)
        self.assert_unchanged(files)

    def test_profile_rejects_service_fields_and_document_clear(self):
        files = self.files()
        client = self.login('firma')
        for field, value in (
            ('registration_document', 'company_documents/another.pdf'),
            ('registration_document-clear', 'on'),
            ('verification_status', Company.VERIF_APPROVED),
            ('verification_reason', ''),
            ('verified_at', timezone.now().isoformat()),
            ('submitted_at', timezone.now().isoformat()),
        ):
            with self.subTest(field=field):
                response = client.post(self.PROFILE, {field: value, 'name': 'Другое название'})
                self.assertEqual(response.status_code, 400)
                self.assert_unchanged(files)

    def test_normal_profile_changes_preserve_identity_and_verification(self):
        response = self.login('firma').post(
            self.PROFILE,
            {'name': 'Новое название', 'city': 'Казань', 'directions': ['Python'], 'avatar': image_upload()},
        )
        self.assertEqual(response.status_code, 200)
        state = self.state()
        self.assertEqual(state['name'], 'Новое название')
        self.assertEqual(state['city'], 'Казань')
        self.assertEqual(state['directions'], ['Python'])
        for field in (
            'username',
            'registration_document',
            'verification_status',
            'verification_reason',
            'verified_at',
            'submitted_at',
        ):
            self.assertEqual(state[field], self.original_state[field], field)

    def test_profile_save_does_not_restore_stale_verification(self):
        original_save = Company.save

        def concurrent_verification(company, *args, **kwargs):
            Company.objects.filter(pk=company.pk).update(
                verification_status=Company.VERIF_PENDING,
                registration_document='company_documents/concurrent.pdf',
                verified_at=None,
            )
            return original_save(company, *args, **kwargs)

        client = self.login('firma')
        with mock.patch.object(Company, 'save', concurrent_verification):
            response = client.post(self.PROFILE, {'name': 'Новое название'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.state()['verification_status'], Company.VERIF_PENDING)
        self.assertEqual(self.state()['registration_document'], 'company_documents/concurrent.pdf')
        self.assertEqual(response.json()['company']['verification_status'], Company.VERIF_PENDING)

    def test_missing_or_invalid_document_preserves_previous_state(self):
        files = self.files()
        client = self.login('firma')
        for data in (
            {},
            {'registration_document-clear': 'on'},
            {'registration_document': self.pdf(content=b'not a PDF')},
            {'registration_document': self.pdf(name='replacement.txt')},
        ):
            with self.subTest(fields=list(data)):
                response = client.post(self.VERIFY, data)
                self.assertEqual(response.status_code, 400)
                self.assert_unchanged(files)

    def test_document_size_limit_is_enforced(self):
        files = self.files()
        response = self.login('firma').post(
            self.VERIFY, {'registration_document': self.pdf(content=b'%PDF-' + b'x' * MAX_DOCUMENT_SIZE)}
        )
        self.assertEqual(response.status_code, 400)
        self.assert_unchanged(files)

    def test_verification_rejects_forged_identity_and_status(self):
        files = self.files()
        client = self.login('firma')
        for field, value in (('username', 'renamed-company'), ('verification_status', Company.VERIF_APPROVED)):
            with self.subTest(field=field):
                self.assertEqual(self.upload(client, **{field: value}).status_code, 400)
                self.assert_unchanged(files)

    def test_replacement_goes_back_to_moderation_and_deletes_old_file_after_commit(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.upload()
            self.assertEqual(response.status_code, 200)
            state = self.state()
            self.assertEqual(state['verification_status'], Company.VERIF_PENDING)
            self.assertEqual(state['verification_reason'], '')
            self.assertIsNone(state['verified_at'])
            self.assertGreater(state['submitted_at'], self.original_state['submitted_at'])
            self.assertTrue(self.storage.exists(self.previous))
            self.assertTrue(self.storage.exists(state['registration_document']))
            self.assertTrue((Path(settings.PRIVATE_MEDIA_ROOT) / state['registration_document']).is_file())
            self.assertFalse((Path(settings.MEDIA_ROOT) / state['registration_document']).exists())
        self.assertFalse(self.storage.exists(self.previous))

    def test_same_filename_does_not_overwrite_the_old_document(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.login('firma').post(self.VERIFY, {'registration_document': self.pdf(name='registration.pdf')})
            self.assertEqual(response.status_code, 200)
            self.assertNotEqual(self.state()['registration_document'], self.previous)
            with self.storage.open(self.previous, 'rb') as previous:
                self.assertEqual(previous.read(), b'%PDF-1.4 original')
        self.assertFalse(self.storage.exists(self.previous))

    def test_first_document_requires_a_file_and_enters_moderation(self):
        self.storage.delete(self.previous)
        Company.objects.filter(pk=self.company.pk).update(
            registration_document='', verification_status=Company.VERIF_NONE, submitted_at=None, verified_at=None
        )
        client = self.login('firma')
        self.assertEqual(client.post(self.VERIFY).status_code, 400)
        self.assertEqual(self.state()['verification_status'], Company.VERIF_NONE)
        self.assertEqual(self.upload(client).status_code, 200)
        state = self.state()
        self.assertEqual(state['verification_status'], Company.VERIF_PENDING)
        self.assertTrue(self.storage.exists(state['registration_document']))
        self.assertIsNotNone(state['submitted_at'])
        self.assertIsNone(state['verified_at'])

    def test_rejected_document_can_be_replaced_and_reviewed_again(self):
        client = self.login('firma')
        moderator = self.login('moder')
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.upload(client).status_code, 200)
        previous = self.state()['registration_document']
        rejected = moderator.post(
            '/api/v1/admin/verifications/firma/reject/', {'reason': 'Нужна свежая выписка'}, content_type='application/json'
        )
        self.assertEqual(rejected.status_code, 200)
        self.assertEqual(self.state()['verification_status'], Company.VERIF_REJECTED)
        self.assertEqual(self.state()['verification_reason'], 'Нужна свежая выписка')
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.upload(client).status_code, 200)
        state = self.state()
        self.assertEqual(state['verification_status'], Company.VERIF_PENDING)
        self.assertEqual(state['verification_reason'], '')
        self.assertFalse(self.storage.exists(previous))
        self.assertTrue(self.storage.exists(state['registration_document']))
        self.assertEqual(moderator.post('/api/v1/admin/verifications/firma/approve/').status_code, 200)
        self.assertTrue(Company.objects.get(pk=self.company.pk).is_verified)

    def test_storage_failure_preserves_the_old_document(self):
        files = self.files()
        client = self.login('firma')
        with (
            self.assertLogs('companies.views', level='ERROR'),
            mock.patch.object(self.storage, 'save', side_effect=OSError('storage unavailable')),
        ):
            response = self.upload(client)
        self.assertEqual(response.status_code, 503)
        self.assert_unchanged(files)

    def test_database_failure_rolls_back_metadata_and_removes_new_file(self):
        files = self.files()
        client = self.login('firma')
        original_save = Company.save

        def fail_after_save(company, *args, **kwargs):
            original_save(company, *args, **kwargs)
            raise DatabaseError('database unavailable')

        with self.assertLogs('companies.views', level='ERROR'), mock.patch.object(Company, 'save', fail_after_save):
            response = self.upload(client)
        self.assertEqual(response.status_code, 503)
        self.assert_unchanged(files)

    def test_old_file_cleanup_failure_keeps_the_new_document_valid(self):
        with (
            self.assertLogs('companies.views', level='ERROR'),
            mock.patch.object(self.storage, 'delete', side_effect=OSError('delete unavailable')),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.upload()
        self.assertEqual(response.status_code, 200)
        state = self.state()
        self.assertEqual(state['verification_status'], Company.VERIF_PENDING)
        self.assertTrue(self.storage.exists(state['registration_document']))
        self.assertTrue(self.storage.exists(self.previous))

    def test_only_owner_can_replace_the_document(self):
        files = self.files()
        for username, status in ((None, 401), ('kandidat', 403), ('konkurent', 403), ('moder', 403)):
            with self.subTest(username=username):
                self.assertEqual(self.upload(self.login(username)).status_code, status)
                self.assert_unchanged(files)

    def test_publication_is_locked_until_moderator_approves_the_replacement(self):
        test = self.make_test(owner='firma', published=False)
        contest = self.make_contest(owner='firma', status='draft')
        client = self.login('firma')
        self.assertEqual(self.upload(client).status_code, 200)
        urls = (f'/api/v1/tests/{test.id}/publish/', f'/api/v1/contests/{contest.id}/publish/')
        for url in urls:
            self.assertEqual(client.post(url).status_code, 403)
        self.assertEqual(self.login('moder').post('/api/v1/admin/verifications/firma/approve/').status_code, 200)
        for url in urls:
            self.assertEqual(client.post(url).status_code, 200)

    def test_unverified_companies_cannot_publish_tests(self):
        test = self.make_test(owner='firma', published=False)
        client = self.login('firma')
        for status in (Company.VERIF_NONE, Company.VERIF_PENDING, Company.VERIF_REJECTED):
            with self.subTest(status=status):
                Company.objects.filter(pk=self.company.pk).update(verification_status=status)
                self.assertEqual(client.post(f'/api/v1/tests/{test.id}/publish/').status_code, 403)
                self.assertEqual(Test.objects.get(pk=test.pk).status, Test.STATUS_DRAFT)

    def test_candidate_publication_does_not_require_company_verification(self):
        test = self.make_test(owner='kandidat', published=False)
        self.assertEqual(self.login('kandidat').post(f'/api/v1/tests/{test.id}/publish/').status_code, 200)
