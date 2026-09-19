"""Запуск решений задач на код в одноразовом контейнере."""
import shutil
import subprocess

from django.test import SimpleTestCase

from tests.constructor.executor import LANGUAGES, run_in_docker

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
