import os
import subprocess
import tempfile

LANGUAGES = {
    'python': {
        'label': 'Python 3',
        'image': 'python:3.11-alpine',
        'filename': 'solution.py',
        'cmd': ['python3', '/code/solution.py'],
        'extensions': ['.py'],
    },
    'javascript': {
        'label': 'JavaScript (Node)',
        'image': 'node:20-alpine',
        'filename': 'solution.js',
        'cmd': ['node', '/code/solution.js'],
        'extensions': ['.js'],
    },
    'cpp': {
        'label': 'C++17',
        'image': 'gcc:12',
        'filename': 'solution.cpp',
        'cmd': ['sh', '-c', 'g++ -O2 -std=c++17 /code/solution.cpp -o /tmp/sol && /tmp/sol'],
        'extensions': ['.cpp', '.cc'],
    },
}


def run_in_docker(language, code, stdin_data='', time_limit=5):
    cfg = LANGUAGES.get(language)
    if not cfg:
        return {'ok': False, 'error': f'Неподдерживаемый язык: {language}'}

    with tempfile.TemporaryDirectory() as tmpdir:
        code_path = os.path.join(tmpdir, cfg['filename'])
        with open(code_path, 'w', encoding='utf-8') as f:
            f.write(code)

        cmd = [
            'docker', 'run', '--rm',
            '-i',
            '--network=none',
            '--memory=128m',
            '--cpus=0.5',
            '--pids-limit=64',
            '-v', f'{tmpdir}:/code:ro',
            '--workdir', '/code',
            cfg['image'],
        ] + cfg['cmd']

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
        except Exception as e:
            return {'ok': False, 'error': str(e)}
