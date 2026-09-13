from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from core.auth import page_login_required


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
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_constructor(request, contest_id=None):
    return render(request, 'contests/contests_cabinet/contest_constructor.html', {
        'username': request.account.username,
        'contest_id': contest_id,
    })


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def contest_submissions(request, contest_id):
    return render(request, 'contests/contests_cabinet/contest_submissions.html', {
        'username': request.account.username,
        'contest_id': contest_id,
    })
