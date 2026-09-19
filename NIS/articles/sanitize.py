"""Очистка HTML-тела статьи.

Тело выводится фильтром `safe`, поэтому без очистки это хранимая XSS.
Разрешены только теги, которые ставит редактор; остальное вырезается.
"""
import nh3

ALLOWED_TAGS = {
    'p', 'br', 'hr', 'span', 'div',
    'strong', 'b', 'em', 'i', 'u', 's',
    'h2', 'h3', 'h4',
    'ul', 'ol', 'li',
    'a', 'code', 'pre', 'blockquote',
}

ALLOWED_ATTRIBUTES = {'a': {'href', 'title'}}

MAX_CONTENT_LENGTH = 200_000


def clean_article_html(raw_html):
    """Безопасный HTML статьи. Принимает что угодно, возвращает строку."""
    if not isinstance(raw_html, str):
        return ''
    return nh3.clean(
        raw_html[:MAX_CONTENT_LENGTH],
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
    )
