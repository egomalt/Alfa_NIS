import json
from datetime import datetime

from django.test import Client

from contests.contests_cabinet.models import Contest

from .base import BaseCase


class ContestEditorTests(BaseCase):
    def payload(self):
        return {
            'title': 'Новый конкурс',
            'excerpt': 'Краткое описание',
            'case_text': 'Первая строка кейса\nВторая строка с <тегом>',
            'rules': ['Не копируйте чужие решения', 'Назовите файл "решение.pdf"'],
            'submission_type': 'link',
            'submission_hint': 'Ссылка на репозиторий',
            'prize': 'Стажировка',
            'category': 'Backend',
            'level': 'Junior',
            'deadline': self.future.isoformat(),
        }

    def test_new_draft_preserves_content_and_rules_on_reopening(self):
        client = self.login('firma')
        payload = self.payload()
        response = client.post('/api/v1/contests/', payload, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        contest = Contest.objects.get(pk=response.json()['contest']['id'])
        self.assertEqual(contest.status, Contest.STATUS_DRAFT)
        self.assertEqual(contest.rules, payload['rules'])
        reopened = client.get(f'/api/v1/contests/{contest.pk}/').json()['contest']
        for field, value in payload.items():
            if field == 'deadline':
                self.assertEqual(datetime.fromisoformat(reopened[field]), datetime.fromisoformat(value))
            else:
                self.assertEqual(reopened[field], value, field)

    def test_date_only_deadline_does_not_shift_on_repeated_saves(self):
        client = self.login('firma')
        response = client.post('/api/v1/contests/', {'deadline': '2030-12-31'}, content_type='application/json')
        self.assertEqual(response.status_code, 201)
        url = f'/api/v1/contests/{response.json()["contest"]["id"]}/'
        for _ in range(3):
            data = client.get(url).json()['contest']
            self.assertEqual(data['deadline'], '2030-12-31T00:00:00+03:00')
            self.assertEqual(
                client.put(url, {'deadline': data['deadline'][:10]}, content_type='application/json').status_code, 200
            )

    def test_deadline_is_returned_with_the_moscow_calendar_date(self):
        deadline = datetime.fromisoformat('2030-12-30T22:30:00+00:00')
        contest = Contest.objects.create(company_username='firma', deadline=deadline)
        data = self.login('firma').get(f'/api/v1/contests/{contest.pk}/').json()['contest']
        self.assertEqual(data['deadline'], '2030-12-31T01:30:00+03:00')
        self.assertEqual(datetime.fromisoformat(data['deadline']), deadline)

    def test_repeated_edits_preserve_empty_and_nonempty_rule_lists(self):
        contest = self.make_contest(status='draft')
        client = self.login('firma')
        url = f'/api/v1/contests/{contest.pk}/'
        for rules in (self.payload()['rules'], [], [''], ['Новое правило\nс переносом']):
            with self.subTest(rules=rules):
                self.assertEqual(client.put(url, {'rules': rules}, content_type='application/json').status_code, 200)
                contest.refresh_from_db()
                self.assertEqual(contest.rules, rules)
                self.assertEqual(client.get(url).json()['contest']['rules'], rules)

    def test_legacy_string_rules_are_readable_and_repaired_on_save(self):
        expected = self.payload()['rules']
        client = self.login('firma')
        for stored in (str(expected), json.dumps(expected), list(str(expected)), str(list(str(expected)))):
            with self.subTest(stored=stored):
                contest = self.make_contest(status='draft', rules=stored)
                url = f'/api/v1/contests/{contest.pk}/'
                data = client.get(url).json()['contest']
                self.assertEqual(data['rules'], expected)
                self.assertEqual(data['case_text'], contest.case_text)
                self.assertEqual(client.put(url, data, content_type='application/json').status_code, 200)
                contest.refresh_from_db()
                self.assertEqual(contest.rules, expected)

    def test_empty_and_plain_text_legacy_rules_are_readable(self):
        for stored, expected in (('', []), ('Отправьте файл', ['Отправьте файл']), ('[]', [])):
            with self.subTest(stored=stored):
                contest = self.make_contest(rules=stored)
                self.assertEqual(Client().get(f'/api/v1/contests/{contest.pk}/').json()['contest']['rules'], expected)

    def test_invalid_rules_reject_the_entire_create_or_update(self):
        client = self.login('firma')
        contest = self.make_contest(status='draft', rules=['Исходное правило'])
        count = Contest.objects.count()
        for rules in ('Не список', None, {'rule': 'Текст'}, [1], [True], [['Вложенный список']]):
            with self.subTest(rules=rules):
                payload = {'title': 'Не сохранять', 'rules': rules}
                self.assertEqual(client.post('/api/v1/contests/', payload, content_type='application/json').status_code, 400)
                self.assertEqual(
                    client.put(f'/api/v1/contests/{contest.pk}/', payload, content_type='application/json').status_code, 400
                )
                contest.refresh_from_db()
                self.assertEqual(contest.title, 'Конкурс')
                self.assertEqual(contest.rules, ['Исходное правило'])
                self.assertEqual(Contest.objects.count(), count)

    def test_updating_other_fields_preserves_rules(self):
        contest = self.make_contest(status='draft', rules=self.payload()['rules'])
        response = self.login('firma').put(
            f'/api/v1/contests/{contest.pk}/', {'excerpt': 'Новое описание'}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        contest.refresh_from_db()
        self.assertEqual(contest.rules, self.payload()['rules'])

    def test_draft_preview_is_complete_and_owner_only(self):
        payload = self.payload()
        payload.pop('deadline')
        contest = self.make_contest(status='draft', **payload)
        owner = self.login('firma')
        page = f'/contests/{contest.pk}/'
        api = f'/api/v1/contests/{contest.pk}/'
        self.assertEqual(owner.get(page).status_code, 200)
        data = owner.get(api).json()['contest']
        self.assertEqual(data['case_text'], self.payload()['case_text'])
        self.assertEqual(data['rules'], self.payload()['rules'])
        for client in (Client(), self.login('kandidat'), self.login('konkurent')):
            self.assertEqual(client.get(page).status_code, 404)
            self.assertEqual(client.get(api).status_code, 404)
        self.assertEqual(owner.post(f'{api}publish/').status_code, 200)
        published = Client().get(api).json()['contest']
        for field in ('case_text', 'rules', 'excerpt', 'submission_hint', 'prize'):
            self.assertEqual(published[field], data[field], field)
