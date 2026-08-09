from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_USER
from authorization.views import get_current_account


@ensure_csrf_cookie
def my_tests(request):
    """Раздел «Мои тесты» кабинета кандидата (единый сайдбарный вид)."""
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    return render(request, 'tests_cabinet/my_tests.html', {'username': account.username, 'page': 'tests'})
