from django import template
from django.utils.html import json_script
from django.utils.safestring import mark_safe

register = template.Library()


@register.simple_tag
def page_data(**values):
    """Данные для скриптов страницы в <script type="application/json" data-page-data>.

    json_script экранирует <, > и &, поэтому строка вида </script> из
    пользовательских данных не вырвется из тега. Тег можно указать
    несколько раз — ядро фронтенда объединит все блоки по порядку.
    """
    return mark_safe(json_script(values).replace('<script ', '<script data-page-data ', 1))
