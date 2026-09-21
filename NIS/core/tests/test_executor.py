"""Запуск решений задач на код в одноразовом контейнере."""
import json
import shutil
import subprocess
from unittest import mock

from django.test import SimpleTestCase

from tests.constructor import views
from tests.constructor.executor import LANGUAGES, run_in_docker
from tests.constructor.models import TestPage

from .base import BaseCase

class CodeExecutorTests(SimpleTestCase):
    """Запуск решения в контейнере. Без Docker тесты пропускаются."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.has_docker = shutil.which('docker') is not None and subprocess.run(
            ['docker', 'info'], capture_output=True).returncode == 0

    def setUp(self):
        if not self.has_docker:
            self.skipTest('Docker недоступен')

    def test_every_language_runs_and_reads_stdin(self):
        cases = {
            'python': 'a,b=map(int,input().split()); print(a+b)',
            'javascript': 'const s=require("fs").readFileSync(0,"utf8").trim();'
                          'const [a,b]=s.split(" ").map(Number); console.log(a+b);',
            'cpp': '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b;}',
        }
        for language, code in cases.items():
            with self.subTest(language=language):
                result = run_in_docker(language, code, stdin_data='40 2', time_limit=10)
                self.assertTrue(result['ok'], result.get('error'))
                self.assertEqual(result['stdout'].strip(), '42')
                self.assertEqual(result['exit_code'], 0)

    def test_code_with_quotes_and_newlines_survives(self):
        """Код уезжает в контейнер аргументом команды — кавычки не должны его ломать."""
        code = 'print("a\'b\\"c")\nprint(\'; rm -rf /\')'
        result = run_in_docker('python', code, time_limit=10)
        self.assertTrue(result['ok'])
        self.assertEqual(result['stdout'].splitlines(), ['a\'b"c', '; rm -rf /'])

    def test_endless_loop_is_stopped(self):
        result = run_in_docker('python', 'while True: pass', time_limit=1)
        self.assertTrue(result['ok'])
        self.assertTrue(result['timed_out'])

    def test_network_is_closed(self):
        code = ('import socket\n'
                'try:\n'
                '    socket.create_connection(("1.1.1.1", 53), timeout=3)\n'
                '    print("ЕСТЬ СЕТЬ")\n'
                'except OSError:\n'
                '    print("сети нет")\n')
        result = run_in_docker('python', code, time_limit=10)
        self.assertEqual(result['stdout'].strip(), 'сети нет')

    def test_unknown_language_is_refused(self):
        result = run_in_docker('brainfuck', '+++')
        self.assertFalse(result['ok'])

    def test_supported_languages_are_declared_once(self):
        """Список языков для конструктора берётся отсюда, а не пишется в шаблоне."""
        self.assertEqual(set(LANGUAGES), {'python', 'javascript', 'cpp'})
        for key, cfg in LANGUAGES.items():
            with self.subTest(language=key):
                self.assertTrue(cfg['label'] and cfg['image'] and cfg['run'])


class CodeRunBudgetTests(BaseCase):
    """Общий потолок времени на прогон: полсотни медленных кейсов не должны
    держать соединение до таймаута веб-сервера."""

    def _code_page(self, cases):
        test = self.make_test(owner='firma', with_quiz=False)
        return TestPage.objects.create(
            test=test, order=0, type=TestPage.TYPE_CODE, title='Задача',
            page_meta={'language': 'python', 'time_limit': 10, 'test_cases': cases},
        )

    def _run(self, page, sample_only=False):
        return self.login('kandidat').post(
            f'/api/v1/tests/pages/{page.id}/run/',
            json.dumps({'code': 'print(1)', 'sample_only': sample_only}),
            'application/json',
        ).json()

    def test_run_stops_when_the_budget_is_spent(self):
        page = self._code_page([{'input': '', 'expected': '1', 'is_sample': False}] * 5)

        # Каждый запуск «съедает» весь бюджет: до второго кейса дело не дойдёт
        def slow_run(*args, **kwargs):
            slow_run.clock[0] += views.MAX_TOTAL_RUN_SECONDS + 1
            return {'ok': True, 'stdout': '1', 'stderr': '', 'exit_code': 0, 'timed_out': False}
        slow_run.clock = [0.0]

        with mock.patch.object(views, 'run_in_docker', slow_run), \
             mock.patch.object(views.time, 'monotonic', lambda: slow_run.clock[0]):
            data = self._run(page)

        self.assertTrue(data['ok'])
        self.assertTrue(data['interrupted'])
        self.assertEqual(data['checked'], 1)
        self.assertEqual(data['total'], 5)
        self.assertIn('остановлена', data['message'])

    def test_full_run_is_not_marked_interrupted(self):
        page = self._code_page([{'input': '', 'expected': '1', 'is_sample': True}] * 3)

        with mock.patch.object(views, 'run_in_docker', return_value={
                'ok': True, 'stdout': '1', 'stderr': '', 'exit_code': 0, 'timed_out': False}):
            data = self._run(page, sample_only=True)

        self.assertFalse(data['interrupted'])
        self.assertEqual((data['passed'], data['total'], data['checked']), (3, 3, 3))

    def test_interrupted_run_does_not_count_as_solved(self):
        """Непроверенные кейсы не должны давать полный балл при сдаче теста."""
        page = self._code_page([{'input': '', 'expected': '1', 'is_sample': False}] * 4)

        def slow_run(*args, **kwargs):
            slow_run.clock[0] += views.MAX_TOTAL_RUN_SECONDS + 1
            return {'ok': True, 'stdout': '1', 'stderr': '', 'exit_code': 0, 'timed_out': False}
        slow_run.clock = [0.0]

        client = self.login('kandidat')
        with mock.patch.object(views, 'run_in_docker', slow_run), \
             mock.patch.object(views.time, 'monotonic', lambda: slow_run.clock[0]):
            client.post(f'/api/v1/tests/pages/{page.id}/run/',
                        json.dumps({'code': 'print(1)', 'sample_only': False}), 'application/json')

        result = client.post(f'/api/v1/tests/{page.test.id}/submit/',
                             json.dumps({'answers': {}}), 'application/json').json()
        self.assertEqual(result['score'], 0)
