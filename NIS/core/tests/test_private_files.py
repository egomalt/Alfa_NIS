import importlib
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

from django.apps import apps
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.test import Client
from django.urls import reverse

from contests.contests_cabinet.models import ContestSubmission

from .base import BaseCase


class PrivateSubmissionTests(BaseCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix='nis-private-files-')))
        self.media = root / 'media'
        self.private = root / 'private'
        self.enterContext(self.settings(MEDIA_ROOT=self.media, PRIVATE_MEDIA_ROOT=self.private))
        self.contest = self.make_contest(submission_type='file')

    def upload(self):
        response = self.login('kandidat').post(
            f'/api/v1/contests/{self.contest.id}/submit/',
            {'file': SimpleUploadedFile('solution.txt', b'private solution', content_type='text/plain')},
        )
        self.assertEqual(response.status_code, 201)
        return response.json()['submission']

    def test_upload_uses_private_storage_and_protected_url(self):
        data = self.upload()
        submission = ContestSubmission.objects.get(id=data['id'])
        self.assertTrue((self.private / submission.file.name).is_file())
        self.assertFalse((self.media / submission.file.name).exists())
        self.assertEqual(data['file_url'], reverse('contest_submission_file', args=[submission.id]))
        with self.assertRaises(ValueError):
            _ = submission.file.url

    def test_author_company_and_moderator_can_download(self):
        url = self.upload()['file_url']
        for username in ('kandidat', 'firma', 'moder'):
            with self.subTest(username=username):
                response = self.login(username).get(url)
                self.addCleanup(response.close)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(b''.join(response.streaming_content), b'private solution')
                self.assertEqual(response['Cache-Control'], 'private, no-store')
                self.assertIn('attachment;', response['Content-Disposition'])
                self.assertIn('solution.txt', response['Content-Disposition'])

    def test_anonymous_and_outsiders_cannot_download(self):
        url = self.upload()['file_url']
        self.assertEqual(Client().get(url).status_code, 302)
        for username in ('drugoy', 'konkurent'):
            with self.subTest(username=username):
                self.assertEqual(self.login(username).get(url).status_code, 404)

    def test_every_submission_api_returns_the_protected_url(self):
        data = self.upload()
        candidate = self.login('kandidat')
        urls = [
            (candidate, f'/api/v1/contests/{self.contest.id}/my-submissions/', 'submissions'),
            (self.login('firma'), f'/api/v1/contests/{self.contest.id}/submissions/', 'submissions'),
            (candidate, f'/api/v1/contests/my-submissions/{data["id"]}/', 'submission'),
        ]
        for client, url, key in urls:
            with self.subTest(url=url):
                response = client.get(url)
                self.assertEqual(response.status_code, 200)
                submission = response.json()[key]
                if isinstance(submission, list):
                    submission = submission[0]
                self.assertEqual(submission['file_url'], data['file_url'])

    def test_missing_file_returns_404(self):
        submission = ContestSubmission.objects.create(contest=self.contest, candidate_username='kandidat')
        url = reverse('contest_submission_file', args=[submission.id])
        client = self.login('kandidat')
        self.assertEqual(client.get(url).status_code, 404)
        submission.file.name = 'contest_submissions/missing.txt'
        submission.save(update_fields=['file'])
        self.assertEqual(client.get(url).status_code, 404)

    def test_download_does_not_accept_post(self):
        self.assertEqual(self.login('kandidat').post(self.upload()['file_url']).status_code, 405)

    def test_old_public_urls_are_blocked_even_if_a_file_remains(self):
        file = self.media / 'contest_submissions' / 'legacy.txt'
        file.parent.mkdir(parents=True)
        file.write_bytes(b'old private solution')
        urls = (
            '/media/contest_submissions/legacy.txt',
            '/media/%63ontest_submissions/legacy.txt',
            '/media/public/../contest_submissions/legacy.txt',
        )
        for debug in (False, True):
            with self.settings(DEBUG=debug):
                for url in urls:
                    with self.subTest(debug=debug, url=url):
                        self.assertEqual(Client().get(url).status_code, 404)

    def test_public_contest_attachments_remain_available(self):
        file = self.media / 'contest_attachments' / 'task.txt'
        file.parent.mkdir(parents=True)
        file.write_bytes(b'public task')
        response = Client().get('/media/contest_attachments/task.txt')
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'public task')

    def test_django_admin_can_display_the_private_file(self):
        data = self.upload()
        url = reverse('admin:contests_cabinet_contestsubmission_change', args=[data['id']])
        response = self.login('moder').get(url)
        self.assertContains(response, data['file_url'])
        self.assertContains(response, 'name="file-clear"')
        self.assertNotContains(response, '/media/contest_submissions/')


class SubmissionFileMigrationTests(BaseCase):
    def setUp(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix='nis-file-migration-')))
        self.media = root / 'media'
        self.private = root / 'private'
        self.enterContext(self.settings(MEDIA_ROOT=self.media, PRIVATE_MEDIA_ROOT=self.private))
        self.migration = importlib.import_module('contests.contests_cabinet.migrations.0003_private_submission_files')
        self.editor = SimpleNamespace(connection=connection)
        self.contest = self.make_contest()
        self.name = 'contest_submissions/legacy.txt'
        self.source = self.media / self.name
        self.source.parent.mkdir(parents=True)
        self.source.write_bytes(b'existing solution')
        self.submission = ContestSubmission.objects.create(contest=self.contest, candidate_username='kandidat', file=self.name)

    def test_existing_file_moves_and_stays_downloadable(self):
        self.migration.to_private(apps, self.editor)
        self.submission.refresh_from_db()
        self.assertFalse(self.source.exists())
        self.assertEqual((self.private / self.submission.file.name).read_bytes(), b'existing solution')
        response = self.login('kandidat').get(reverse('contest_submission_file', args=[self.submission.id]))
        self.addCleanup(response.close)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(b''.join(response.streaming_content), b'existing solution')

    def test_collision_does_not_overwrite_another_private_file(self):
        existing = self.private / self.name
        existing.parent.mkdir(parents=True)
        existing.write_bytes(b'another private solution')
        shared = ContestSubmission.objects.create(contest=self.contest, candidate_username='drugoy', file=self.name)
        self.migration.to_private(apps, self.editor)
        self.submission.refresh_from_db()
        shared.refresh_from_db()
        self.assertNotEqual(self.submission.file.name, self.name)
        self.assertEqual(shared.file.name, self.submission.file.name)
        self.assertEqual(existing.read_bytes(), b'another private solution')
        self.assertEqual((self.private / self.submission.file.name).read_bytes(), b'existing solution')

    def test_repeated_migration_keeps_the_same_file_reference(self):
        self.migration.to_private(apps, self.editor)
        self.migration.to_private(apps, self.editor)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.file.name, self.name)
        self.assertEqual((self.private / self.name).read_bytes(), b'existing solution')

    def test_missing_source_does_not_remove_the_record(self):
        self.source.unlink()
        self.migration.to_private(apps, self.editor)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.file.name, self.name)

    def test_database_failure_keeps_the_public_source_for_retry(self):
        with patch('django.db.models.query.QuerySet.update', side_effect=RuntimeError('database unavailable')):
            with self.assertRaises(RuntimeError):
                self.migration.to_private(apps, self.editor)
        self.assertEqual(self.source.read_bytes(), b'existing solution')
        self.migration.to_private(apps, self.editor)
        self.submission.refresh_from_db()
        self.assertFalse(self.source.exists())
        self.assertEqual((self.private / self.submission.file.name).read_bytes(), b'existing solution')

    def test_reverse_migration_preserves_file_contents(self):
        self.migration.to_private(apps, self.editor)
        self.migration.to_public(apps, self.editor)
        self.assertEqual(self.source.read_bytes(), b'existing solution')
        self.assertFalse((self.private / self.name).exists())
