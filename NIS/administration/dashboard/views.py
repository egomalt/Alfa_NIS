from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_MODERATOR
from core.auth import page_login_required


@ensure_csrf_cookie
@page_login_required(ROLE_MODERATOR)
def dashboard_shell(request):
    # Контекст пустой: чип аккаунта в шапке рисует общий career.js
    # по данным /api/v1/auth/me/, как на остальных страницах сайта
    return render(request, 'administration/dashboard.html')
