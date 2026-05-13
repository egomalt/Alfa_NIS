from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET


@ensure_csrf_cookie
def constructor_shell(request):
    return render(request, 'constructor/constructor.html', {'app_path': request.path})


@require_GET
def api_tests_list(request):
    return JsonResponse({'ok': True, 'tests': []})
