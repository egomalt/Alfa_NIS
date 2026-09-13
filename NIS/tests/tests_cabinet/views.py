from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_USER
from core.auth import page_login_required


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_tests(request):
    """Раздел «Мои тесты» кабинета кандидата (единый сайдбарный вид)."""
    return render(request, 'tests_cabinet/my_tests.html', {'username': request.account.username, 'page': 'tests'})
