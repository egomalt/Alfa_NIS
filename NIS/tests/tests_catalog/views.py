from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from authorization import bans
from authorization.models import Account
from core.pagination import paginate, text_param, wants_extras
from tests import attempts
from tests.constructor.models import Test

# Сколько отдавать без ?per_page= — каталог и главная просят меньше сами
CATALOG_PER_PAGE = 100
TRENDING_SIZE = 5


@ensure_csrf_cookie
def tests_catalog_shell(request):
    return render(request, 'tests_catalog/tests_catalog.html')


def _serialize(tests):
    # Имена авторов — одним запросом по владельцам этой страницы,
    # а не выгрузкой всей таблицы аккаунтов
    owner_names = dict(Account.objects.filter(username__in={t.owner_username for t in tests}).values_list('username', 'name'))
    result = []
    for test in tests:
        stats = test.stats or {}
        result.append(
            {
                'id': test.id,
                'title': test.title,
                'description': test.description,
                'owner_username': test.owner_username,
                'owner_name': owner_names.get(test.owner_username, test.owner_username),
                'level': stats.get('level', ''),
                'category': stats.get('category', ''),
                'page_count': test.page_total,
                'submissions': test.finished_attempts,
                'url': reverse('test_view_page', args=[test.id]),
            }
        )
    return result


@require_GET
def api_tests_catalog(request):
    """Каталог: ?q= ищет по названию, описанию и автору, ?level= и ?category= — точные фильтры."""
    published = (
        Test.objects.filter(status=Test.STATUS_PUBLISHED)
        .exclude(owner_username__in=bans.banned_usernames())
        .annotate(page_total=Count('pages', distinct=True), finished_attempts=attempts.finished_count())
        .order_by('-created_at')
    )
    query, level, category = text_param(request, 'q').casefold(), text_param(request, 'level'), text_param(request, 'category')
    tests_qs = published
    if query or level or category:
        # Уровень и категория лежат в JSON-поле stats, а поиск должен не зависеть
        # от регистра кириллицы — сверяем в Python, одинаково для SQLite и PostgreSQL
        rows = list(
            Test.objects.filter(id__in=published.values('id')).values_list(
                'id', 'title', 'description', 'owner_username', 'stats'
            )
        )
        names = dict(Account.objects.filter(username__in={row[3] for row in rows}).values_list('username', 'name'))
        matching = [
            test_id
            for test_id, title, description, owner, stats in rows
            if (not level or (stats or {}).get('level') == level)
            and (not category or (stats or {}).get('category') == category)
            and (not query or query in f'{title} {description} {owner} {names.get(owner, "")}'.casefold())
        ]
        tests_qs = published.filter(id__in=matching)

    tests, page_meta = paginate(request, tests_qs, CATALOG_PER_PAGE)
    response = {'ok': True, 'tests': _serialize(tests), **page_meta}
    if wants_extras(request):
        popular = published.filter(finished_attempts__gt=0).order_by('-finished_attempts', '-created_at')[:TRENDING_SIZE]
        response['extras'] = {'trending': _serialize(list(popular))}
    return JsonResponse(response)
