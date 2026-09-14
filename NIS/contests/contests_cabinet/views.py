from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from core.auth import page_login_required
from core.uploads import MAX_DOCUMENT_SIZE


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_contests_user(request):
    """Раздел «Конкурсы» кабинета кандидата — история участия (единый сайдбарный вид)."""
    return render(request, 'contests/contests_cabinet/my_contests_user.html',
                  {'username': request.account.username, 'page': 'contests'})


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_contests(request):
    return render(request, 'contests/contests_cabinet/company_contests.html', {
        'username': request.account.username,
        # page подсвечивает пункт сайдбара, panel='none' — у страницы свой скрипт,
        # профильную панель кабинета рисовать не нужно
        'page': 'contests',
        'panel': 'none',
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_constructor(request, contest_id=None):
    return render(request, 'contests/contests_cabinet/contest_constructor.html', {
        'username': request.account.username,
        'contest_id': contest_id,
        # Лимит берём из того же места, где его проверяет сервер, — иначе
        # подсказка в интерфейсе снова разойдётся с реальным ограничением
        'max_attachment_mb': MAX_DOCUMENT_SIZE // (1024 * 1024),
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_submissions(request, contest_id):
    return render(request, 'contests/contests_cabinet/contest_submissions.html', {
        'username': request.account.username,
        'contest_id': contest_id,
        'page': 'contests',
        'panel': 'none',
    })
