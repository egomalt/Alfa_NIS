"""Постраничная выдача для списочных эндпоинтов.

Раньше каталоги и очереди модерации отдавали таблицу целиком. Пока записей два
десятка, это незаметно, но на нескольких тысячах любой такой запрос кладёт сервер.

Формат ответа единый для всех списков:

    {"ok": true, "items": [...], "page": 1, "per_page": 20, "total": 137, "pages": 7}

Имя ключа со списком задаётся вызывающей стороной (`articles`, `contests`, …),
чтобы не ломать уже написанный фронтенд.
"""
from django.core.paginator import EmptyPage, Paginator

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


def _int_param(request, name, default, minimum, maximum):
    try:
        value = int(request.GET.get(name, default))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(value, maximum))


def paginate(request, queryset, per_page=DEFAULT_PER_PAGE):
    """Возвращает (страница_объектов, метаданные).

    Номер страницы и размер берутся из ?page= и ?per_page=; мусор и выход
    за границы не роняют запрос, а приводятся к допустимым значениям.
    """
    per_page = _int_param(request, 'per_page', per_page, 1, MAX_PER_PAGE)
    page_number = _int_param(request, 'page', 1, 1, 10_000_000)

    paginator = Paginator(queryset, per_page)
    try:
        page = paginator.page(page_number)
    except EmptyPage:
        page = paginator.page(paginator.num_pages)

    meta = {
        'page': page.number,
        'per_page': per_page,
        'total': paginator.count,
        'pages': paginator.num_pages,
    }
    return list(page.object_list), meta
