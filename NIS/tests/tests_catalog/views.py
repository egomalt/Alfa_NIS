from django.db.models import Count
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from tests import attempts
from tests.constructor.models import Test
from authorization.models import Account
from core.pagination import paginate

# Каталоги фильтруются на стороне браузера, поэтому страница крупная:
# ограничение защищает от выгрузки всей таблицы, но не режет текущий интерфейс.
CATALOG_PER_PAGE = 100


@ensure_csrf_cookie
def tests_catalog_shell(request):
    return render(request, 'tests_catalog/tests_catalog.html')


@require_GET
def api_tests_catalog(request):
    owner_names = {a.username: a.name for a in Account.objects.all()}
    tests_qs = (Test.objects
                .filter(status=Test.STATUS_PUBLISHED)
                .annotate(page_total=Count('pages', distinct=True),
                          finished_attempts=attempts.finished_count())
                .order_by('-created_at'))
    tests, page_meta = paginate(request, tests_qs, CATALOG_PER_PAGE)
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
            # Число прохождений — признак «этот тест стоит внимания».
            # Раньше в каталог не попадало, хотя считается при сдаче.
            'submissions': test.finished_attempts,
            'url': f'/tests/{test.id}/',
        })
    return JsonResponse({'ok': True, 'tests': result, **page_meta})
