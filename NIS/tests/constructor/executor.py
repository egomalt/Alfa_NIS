"""Запуск решения задачи на код в одноразовом контейнере.

Код уезжает в контейнер аргументом команды в виде base64 и уже там
раскладывается в файл. Через примонтированную папку это делать нельзя:
если сам сайт работает в контейнере, демон Docker живёт на хосте и путь
к временной папке внутри сайта для него не существует — вместо решения
запустился бы пустой файл.

Контейнер одноразовый, без сети, с потолком по памяти, процессам и времени.
"""
import base64
import subprocess

# Как разложить код в файл и запустить его. {b64} подставляется командой.
_UNPACK = 'echo {b64} | base64 -d > {path}'

LANGUAGES = {
    'python': {
        'label': 'Python 3',
        'image': 'python:3.11-alpine',
        'filename': '/tmp/solution.py',
        'run': 'exec python3 /tmp/solution.py',
        'extensions': ['.py'],
    },
    'javascript': {
        'label': 'JavaScript (Node)',
        'image': 'node:20-alpine',
        'filename': '/tmp/solution.js',
        'run': 'exec node /tmp/solution.js',
        'extensions': ['.js'],
    },
    'cpp': {
        'label': 'C++17',
        'image': 'gcc:12',
        'filename': '/tmp/solution.cpp',
        'run': 'g++ -O2 -std=c++17 /tmp/solution.cpp -o /tmp/sol && exec /tmp/sol',
        'extensions': ['.cpp', '.cc'],
    },
}


def _shell_command(cfg, code):
    """Одна строка для sh -c: разложить код в файл и запустить."""
    encoded = base64.b64encode(code.encode('utf-8')).decode('ascii')
    unpack = _UNPACK.format(b64=encoded, path=cfg['filename'])
    return f'{unpack} && {cfg["run"]}'


def run_in_docker(language, code, stdin_data='', time_limit=5):
    cfg = LANGUAGES.get(language)
    if not cfg:
        return {'ok': False, 'error': f'Неподдерживаемый язык: {language}'}

    cmd = [
        'docker', 'run', '--rm', '-i',
        '--network=none',
        '--memory=128m',
        '--cpus=0.5',
        '--pids-limit=64',
        cfg['image'],
        'sh', '-c', _shell_command(cfg, code),
    ]

    try:
        proc = subprocess.run(
            cmd,
            input=stdin_data,
            capture_output=True,
            text=True,
            timeout=time_limit + 5,
        )
        return {
            'ok': True,
            'stdout': proc.stdout,
            'stderr': proc.stderr[:2000],
            'exit_code': proc.returncode,
            'timed_out': False,
        }
    except subprocess.TimeoutExpired:
        return {
            'ok': True,
            'stdout': '',
            'stderr': 'Превышено ограничение времени',
            'exit_code': -1,
            'timed_out': True,
        }
    except FileNotFoundError:
        return {'ok': False, 'error': 'Docker не найден на сервере'}
    except OSError:
        # Текст системной ошибки наружу не отдаём
        return {'ok': False, 'error': 'Не удалось запустить проверку'}
