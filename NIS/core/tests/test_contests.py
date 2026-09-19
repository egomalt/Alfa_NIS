"""Конкурсы: сроки, лимит попыток, валидация решений и публикации."""
import json

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client

from contests.contests_cabinet.models import Contest, ContestAttachment, ContestSubmission

from .base import BaseCase


class DeadlineTests(BaseCase):
    def test_submission_after_deadline_rejected(self):
        """После дедлайна приём работ закрыт."""
        contest = self.make_contest(deadline='past', submission_type='text')
        response = self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ContestSubmission.objects.filter(contest=contest).count(), 0)

    def test_submission_in_time_accepted(self):
        contest = self.make_contest(submission_type='text')
        response = self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'решение'})
        self.assertEqual(response.status_code, 201)


class AttemptLimitTests(BaseCase):
    def test_second_attempt_rejected(self):
        """Лимит показывался на странице, но сервер принимал сколько угодно."""
        contest = self.make_contest(submission_type='text')
        client = self.login('kandidat')
        self.assertEqual(client.post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'раз'}).status_code, 201)
        self.assertEqual(client.post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'два'}).status_code, 409)
        self.assertEqual(ContestSubmission.objects.filter(contest=contest).count(), 1)


class SubmissionValidationTests(BaseCase):
    def test_link_must_be_a_url(self):
        contest = self.make_contest(submission_type='link')
        client = self.login('kandidat')
        self.assertEqual(client.post(f'/api/v1/contests/{contest.id}/submit/', {'link': 'не-ссылка'}).status_code, 400)
        self.assertEqual(
            client.post(f'/api/v1/contests/{contest.id}/submit/', {'link': 'https://github.com/x'}).status_code, 201)

    def test_empty_text_rejected(self):
        contest = self.make_contest(submission_type='text')
        response = self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'text': '   '})
        self.assertEqual(response.status_code, 400)

    def test_svg_file_rejected(self):
        """SVG с того же домена выполняет скрипты — хранимая XSS."""
        contest = self.make_contest(submission_type='file')
        bad = SimpleUploadedFile('x.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        response = self.login('kandidat').post(f'/api/v1/contests/{contest.id}/submit/', {'file': bad})
        self.assertEqual(response.status_code, 400)

    def test_role_is_enforced(self):
        contest = self.make_contest(submission_type='text')
        self.assertEqual(Client().post(f'/api/v1/contests/{contest.id}/submit/', {'text': 'x'}).status_code, 401)
        self.assertEqual(self.login('firma').post(f'/api/v1/contests/{contest.id}/submit/',
                                                  {'text': 'x'}).status_code, 403)


class PublishTests(BaseCase):
    def test_incomplete_contest_not_published(self):
        contest = Contest.objects.create(company_username='firma', title='', status='draft')
        response = self.login('firma').post(f'/api/v1/contests/{contest.id}/publish/')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(Contest.objects.get(id=contest.id).status, 'draft')

    def test_deadline_must_be_in_future(self):
        contest = self.make_contest(status='draft', deadline='past')
        self.assertEqual(self.login('firma').post(f'/api/v1/contests/{contest.id}/publish/').status_code, 400)

    def test_complete_contest_publishes(self):
        contest = self.make_contest(status='draft')
        self.assertEqual(self.login('firma').post(f'/api/v1/contests/{contest.id}/publish/').status_code, 200)
        self.assertEqual(Contest.objects.get(id=contest.id).status, 'active')

    def test_finished_contest_is_not_revived(self):
        """Иначе завершённый конкурс снова начинал принимать работы."""
        contest = self.make_contest(status='finished')
        self.assertEqual(self.login('firma').post(f'/api/v1/contests/{contest.id}/publish/').status_code, 400)
        self.assertEqual(Contest.objects.get(id=contest.id).status, 'finished')


class AttachmentTests(BaseCase):
    """Стартовые файлы конкурса: загрузка, лимиты и удаление."""

    def _upload(self, client, contest, name='usloviya.pdf', content=b'%PDF-1.4'):
        return client.post(f'/api/v1/contests/{contest.id}/attachments/',
                           {'file': SimpleUploadedFile(name, content, content_type='application/pdf')})

    def test_upload_reaches_server(self):
        contest = self.make_contest()
        response = self._upload(self.login('firma'), contest)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ContestAttachment.objects.filter(contest=contest).count(), 1)

    def test_response_fields_match_what_page_reads(self):
        contest = self.make_contest()
        attachment = self._upload(self.login('firma'), contest).json()['attachment']
        for key in ('id', 'name', 'url', 'size_display'):
            self.assertIn(key, attachment)

    def test_attachment_visible_on_contest_page(self):
        contest = self.make_contest()
        self._upload(self.login('firma'), contest)
        data = Client().get(f'/api/v1/contests/{contest.id}/').json()['contest']
        self.assertEqual(len(data['attachments']), 1)
        self.assertTrue(data['attachments'][0]['url'])

    def test_oversized_and_dangerous_files_rejected(self):
        contest = self.make_contest()
        client = self.login('firma')
        svg = SimpleUploadedFile('x.svg', b'<svg onload=alert(1)>', content_type='image/svg+xml')
        self.assertEqual(client.post(f'/api/v1/contests/{contest.id}/attachments/', {'file': svg}).status_code, 400)
        big = SimpleUploadedFile('big.zip', b'x' * (26 * 1024 * 1024), content_type='application/zip')
        self.assertEqual(client.post(f'/api/v1/contests/{contest.id}/attachments/', {'file': big}).status_code, 400)

    def test_deletion_is_owner_only(self):
        contest = self.make_contest()
        attachment_id = self._upload(self.login('firma'), contest).json()['attachment']['id']
        url = f'/api/v1/contests/{contest.id}/attachments/{attachment_id}/'
        self.assertEqual(Client().delete(url).status_code, 401)
        self.assertEqual(self.login('kandidat').delete(url).status_code, 403)
        self.assertEqual(self.login('firma').delete(url).status_code, 200)
        self.assertFalse(ContestAttachment.objects.filter(id=attachment_id).exists())


class MalformedInputTests(BaseCase):
    """Некорректный ввод должен давать 400, а не падение."""

    def test_non_object_json_body(self):
        contest = self.make_contest()
        client = self.login('firma')
        for payload in ('5', '[]', '"строка"'):
            with self.subTest(payload=payload):
                response = client.put(f'/api/v1/contests/{contest.id}/', payload, 'application/json')
                self.assertLess(response.status_code, 500)

    def test_broken_deadline(self):
        response = self.login('firma').post(
            '/api/v1/contests/', json.dumps({'title': 'x', 'deadline': '2024-13-45T00:00:00'}), 'application/json')
        self.assertLess(response.status_code, 500)

    def test_broken_article_fields(self):
        article = self.make_article(author='kandidat')
        client = self.login('kandidat')
        for payload in (json.dumps({'cover_index': 'abc'}), json.dumps({'tags': 'не список'}), '5'):
            with self.subTest(payload=payload):
                response = client.patch(f'/api/v1/articles/{article.id}/', payload, 'application/json')
                self.assertLess(response.status_code, 500)

    def test_broken_test_answers(self):
        test = self.make_test()
        for payload in (json.dumps({'answers': []}), json.dumps({'answers': {'3': 7}})):
            with self.subTest(payload=payload):
                response = Client().post(f'/api/v1/tests/{test.id}/submit/', payload, 'application/json')
                self.assertLess(response.status_code, 500)


class ArticleContentTests(BaseCase):
    """Тело статьи: сохранение из редактора и защита от вставки скриптов."""

    def test_editor_can_save_html_body(self):
        """Редактор шлёт тело строкой HTML. Проверка «должно быть списком» ломала сохранение."""
        article = self.make_article(author='kandidat', published=False)
        payload = json.dumps({
            'title': 'Моя статья', 'excerpt': 'Описание',
            'content': '<p>Текст <strong>жирный</strong></p>', 'tags': ['Python'],
        })
        response = self.login('kandidat').patch(f'/api/v1/articles/{article.id}/', payload, 'application/json')
        self.assertEqual(response.status_code, 200)

        article.refresh_from_db()
        self.assertIn('<strong>жирный</strong>', article.content)

    def test_script_is_stripped_from_body(self):
        """Шаблон выводит тело без экранирования — без очистки это хранимая XSS."""
        article = self.make_article(author='kandidat', published=False)
        payload = json.dumps({'content':
            '<p>ок</p><script>alert(1)</script><img src=x onerror="alert(1)">'
            '<a href="javascript:alert(1)">клик</a><iframe src="//evil.ru"></iframe>'})
        self.login('kandidat').patch(f'/api/v1/articles/{article.id}/', payload, 'application/json')

        article.refresh_from_db()
        for dangerous in ('<script', 'onerror', 'javascript:', '<iframe'):
            self.assertNotIn(dangerous, article.content)
        self.assertIn('<p>ок</p>', article.content)

    def test_clean_body_reaches_reader_page(self):
        article = self.make_article(author='kandidat', published=True)
        self.login('kandidat').patch(
            f'/api/v1/articles/{article.id}/',
            json.dumps({'content': '<p>Полезно</p><script>alert(1)</script>'}), 'application/json')

        body = Client().get(f'/articles/{article.id}/').content.decode()
        self.assertIn('Полезно', body)
        self.assertNotIn('<script>alert(1)</script>', body)

    def test_tags_must_still_be_a_list(self):
        article = self.make_article(author='kandidat', published=False)
        response = self.login('kandidat').patch(
            f'/api/v1/articles/{article.id}/', json.dumps({'tags': 'не список'}), 'application/json')
        self.assertEqual(response.status_code, 400)

    def test_content_is_stored_as_plain_text(self):
        """Поле было JSONField: значения лежали в кавычках и с \\uXXXX-экранированием."""
        article = self.make_article(author='kandidat', published=False)
        self.login('kandidat').patch(
            f'/api/v1/articles/{article.id}/',
            json.dumps({'content': '<p>Кириллица и «кавычки»</p>'}), 'application/json')

        article.refresh_from_db()
        self.assertIsInstance(article.content, str)
        self.assertEqual(article.content, '<p>Кириллица и «кавычки»</p>')
        self.assertFalse(article.content.startswith('"'))
        self.assertNotIn('\\u04', article.content)

    def test_new_article_has_empty_body_not_list(self):
        response = self.login('kandidat').post('/api/v1/articles/create/')
        from articles.constructor.models import Article
        article = Article.objects.get(id=response.json()['article_id'])
        self.assertEqual(article.content, '')
