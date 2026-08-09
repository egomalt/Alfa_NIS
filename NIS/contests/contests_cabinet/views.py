from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account


@ensure_csrf_cookie
def my_contests_user(request):
    """Раздел «Конкурсы» кабинета кандидата — история участия (единый сайдбарный вид)."""
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        return redirect('/authorization/signup/')
    return render(request, 'contests/contests_cabinet/my_contests_user.html',
                  {'username': account.username, 'page': 'contests'})


def _company_context(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        return None, redirect('/authorization/signup/')
    return account, None


@ensure_csrf_cookie
def company_contests(request):
    account, redir = _company_context(request)
    if redir:
        return redir
    return render(request, 'contests/contests_cabinet/company_contests.html', {
        'username': account.username,
    })


@ensure_csrf_cookie
def contest_constructor(request, contest_id=None):
    account, redir = _company_context(request)
    if redir:
        return redir
    return render(request, 'contests/contests_cabinet/contest_constructor.html', {
        'username': account.username,
        'contest_id': contest_id,
    })


@ensure_csrf_cookie
def contest_submissions(request, contest_id):
    account, redir = _company_context(request)
    if redir:
        return redir
    return render(request, 'contests/contests_cabinet/contest_submissions.html', {
        'username': account.username,
        'contest_id': contest_id,
    })
