from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from tests import attempts
from tests.constructor.models import Test
from authorization import bans
from authorization.models import Account
from core.pagination import paginate

# Каталог фильтруется в браузере, поэтому страница крупная
CATALOG_PER_PAGE = 100


@ensure_csrf_cookie
def tests_catalog_shell(request):
    return render(request, 'tests_catalog/tests_catalog.html')


@require_GET
def api_tests_catalog(request):
    tests_qs = (Test.objects
                .filter(status=Test.STATUS_PUBLISHED)
                .exclude(owner_username__in=bans.banned_usernames())
                .annotate(page_total=Count('pages', distinct=True),
                          finished_attempts=attempts.finished_count())
                .order_by('-created_at'))
    tests, page_meta = paginate(request, tests_qs, CATALOG_PER_PAGE)
    # Имена авторов — одним запросом по владельцам этой страницы,
    # а не выгрузкой всей таблицы аккаунтов
    owner_names = dict(
        Account.objects
        .filter(username__in={t.owner_username for t in tests})
        .values_list('username', 'name')
    )
    result = []
    for test in tests:
        stats = test.stats or {}
        result.append({
            'id': test.id,
            'title': test.title,
            'description': test.description,
            'owner_username': test.owner_username,
            'owner_name': owner_names.get(test.owner_username, test.owner_username),
            'level': stats.get('level', ''),
            'category': stats.get('category', ''),
            'page_count': test.page_total,
            'submissions': test.finished_attempts,
            'url': f'/tests/{test.id}/',
        })
    return JsonResponse({'ok': True, 'tests': result, **page_meta})
