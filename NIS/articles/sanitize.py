"""Очистка HTML-тела статьи.

Тело статьи хранится строкой HTML (редактор отдаёт содержимое contenteditable)
и выводится в шаблоне фильтром `safe`, то есть без экранирования. Без очистки
это хранимая XSS: любой автор мог опубликовать <script>, который выполнялся бы
у каждого читателя — в том числе у модератора, от чьего имени скрипт мог бы
дёргать любые методы API.

Разрешаем только те теги, которые умеет ставить редактор и оформляет стиль
страницы чтения. Всё остальное — включая обработчики событий, style, iframe
и ссылки на javascript: — вырезается.
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
    """Безопасный HTML статьи. На вход принимает что угодно, на выходе — строка."""
    if not isinstance(raw_html, str):
        return ''
    return nh3.clean(
        raw_html[:MAX_CONTENT_LENGTH],
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
    )
