from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from tests.constructor.models import Test


@ensure_csrf_cookie
def tests_catalog_shell(request):
    return render(request, 'tests_catalog/tests_catalog.html')


@require_GET
def api_tests_catalog(request):
    from authorization.models import Account
    owner_names = {a.username: a.name for a in Account.objects.all()}
    tests = Test.objects.filter(status=Test.STATUS_PUBLISHED).prefetch_related('pages')
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
            'page_count': test.pages.count(),
            'url': f'/tests/{test.id}/',
        })
    return JsonResponse({'ok': True, 'tests': result})
