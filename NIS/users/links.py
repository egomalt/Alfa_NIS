"""Ссылки кандидата на себя: github, telegram, личный сайт.

Живут отдельным модулем, потому что чистить их надо в двух местах — при
сохранении настроек и при показе в профиле, — а формат ввода у людей разный:
кто-то пишет «@nick», кто-то «github.com/nick», кто-то полный адрес.
"""
import re
from urllib.parse import urlparse

# «javascript:», «data:», «mailto:» — всё, что начинается со своей схемы
SCHEME = re.compile(r'^[a-z][a-z0-9+.\-]*:', re.I)
# Хост вида example.com или t.me, при желании с портом
HOST = re.compile(r'^[\w.\-]+(:\d+)?$')

# Порядок здесь задаёт порядок иконок в профиле
KINDS = ('github', 'telegram', 'site')

LABELS = {'github': 'GitHub', 'telegram': 'Telegram', 'site': 'Сайт'}

MAX_LENGTH = 200

# Хосты, к которым приводим короткую запись вида «nick» или «@nick»
BASES = {
    'github': 'https://github.com/',
    'telegram': 'https://t.me/',
}


def _normalize(kind, value):
    """Одна ссылка к виду https://… или пустая строка, если разобрать нельзя."""
    value = str(value or '').strip().strip('@').rstrip('/')
    if not value:
        return ''

    if not value.lower().startswith(('http://', 'https://')):
        # Чужая схема: javascript:, data:, mailto:. Подставлять к ней https://
        # нельзя — получится ссылка-мусор вроде https://javascript:alert(1)
        if SCHEME.match(value):
            return ''
        base = BASES.get(kind)
        if base is None:
            # Личный сайт: пишут «example.com», подставляем схему
            value = 'https://' + value
        elif '/' in value or '.' in value:
            # Похоже на адрес, а не на логин: «github.com/nick»
            value = 'https://' + value
        else:
            value = base + value

    parsed = urlparse(value)
    # Без правдоподобного хоста ссылка никуда не ведёт
    if parsed.scheme not in ('http', 'https') or not HOST.match(parsed.netloc):
        return ''
    return value[:MAX_LENGTH]


def clean(raw):
    """Словарь ссылок из запроса: только известные ключи, только разобранные."""
    if not isinstance(raw, dict):
        return {}
    result = {}
    for kind in KINDS:
        value = _normalize(kind, raw.get(kind))
        if value:
            result[kind] = value
    return result


def as_list(links):
    """Ссылки для показа: [(ключ, подпись, адрес)] в постоянном порядке."""
    links = links or {}
    return [
        {'kind': kind, 'label': LABELS[kind], 'url': links[kind]}
        for kind in KINDS if links.get(kind)
    ]
