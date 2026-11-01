from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.test import SimpleTestCase

from companies.models import Company
from contests.contests_cabinet.models import ContestSubmission
from exports.pdf import ReportBuilder
from users.models import UserProfile

from .base import BaseCase, image_upload


class ParagraphSafetyTests(SimpleTestCase):
    def test_markup_is_literal_text_in_every_report_block(self):
        text = '<b>unclosed & <img src="file:///private.png"/>'
        report = ReportBuilder(text, text)
        with patch('reportlab.platypus.paraparser.ImageReader') as image_reader:
            report.section(text)
            report.note(text)
            report.kpi([(text, text)])
            report.table([text], [[text]])
            report.bars([('plain label', '1', 1)], title=text, note=text)
            self.assertEqual(report.story[0].getPlainText(), text)
            self.assertTrue(report.build().startswith(b'%PDF'))
            image_reader.assert_not_called()

    def test_quotes_entities_and_line_breaks_are_preserved_as_text(self):
        report = ReportBuilder('Report')
        report.note('A & B < C > D "quoted" &lt;b&gt;\r\nSecond line')
        paragraph = report.story[0]
        self.assertIn('A & B < C > D "quoted" &lt;b&gt;', paragraph.getPlainText())
        self.assertTrue(any(getattr(fragment, 'lineBreak', False) for fragment in paragraph.frags))
        self.assertTrue(report.build().startswith(b'%PDF'))


class PdfExportSafetyTests(BaseCase):
    def test_user_export_accepts_unclosed_markup_in_profile_and_titles(self):
        self.candidate.name = '<b>Candidate & Co'
        self.candidate.save(update_fields=['name'])
        UserProfile.objects.create(username='kandidat', bio='<font color="red">unclosed', skills=['A < B & C'])
        self.make_article(title='<b>Article & title')
        contest = self.make_contest(title='<i>Contest & title')
        ContestSubmission.objects.create(contest=contest, candidate_username='kandidat')
        response = self.login('kandidat').get('/export/user/statistics.pdf')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF'))

    def test_local_images_in_bio_are_not_embedded(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix='nis-pdf-security-')))
        image = root / 'private.png'
        image.write_bytes(image_upload().read())
        UserProfile.objects.create(username='kandidat', bio=f'<img src="{image}" width="4" height="4"/>')
        response = self.login('kandidat').get('/export/user/statistics.pdf')
        self.assertEqual(response.status_code, 200)
        self.assertNotRegex(response.content, rb'/Subtype\s*/Image\b')

    def test_remote_images_in_bio_are_not_loaded(self):
        UserProfile.objects.create(username='kandidat', bio='<img src="https://example.com/private.png"/>')
        with patch('reportlab.platypus.paraparser.ImageReader') as image_reader:
            response = self.login('kandidat').get('/export/user/statistics.pdf')
        self.assertEqual(response.status_code, 200)
        image_reader.assert_not_called()

    def test_company_export_accepts_markup_in_name_and_contest_title(self):
        company = Company.objects.get(username='firma')
        company.name = '<b>Company & Co'
        company.save(update_fields=['name'])
        self.make_contest(title='<font>Contest & title')
        self.make_test(title='<i>Test & title')
        response = self.login('firma').get('/export/company/statistics.pdf')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.content.startswith(b'%PDF'))
