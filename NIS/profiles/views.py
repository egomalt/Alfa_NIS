from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization import bans
from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account
from companies.models import Company


def _require_visible(request, username):
    if not bans.visible_to(get_current_account(request), username):
        raise Http404


def _visible_company(request, username):
    _require_visible(request, username)
    company = get_object_or_404(Company, username=username)
    if not company.is_verified:
        raise Http404
    return company


@ensure_csrf_cookie
def profile_view(request, username):
    account = get_object_or_404(Account, username=username)
    _require_visible(request, username)

    if account.role == ROLE_COMPANY:
        _visible_company(request, username)
        return render(request, 'profiles/company.html', {'username': username})
    if account.role == ROLE_USER:
        return render(request, 'profiles/user.html', {'username': username})
    raise Http404


@ensure_csrf_cookie
def company_contests_view(request, username):
    _visible_company(request, username)
    return render(request, 'profiles/company_contests.html', {'username': username})


@ensure_csrf_cookie
def company_tests_view(request, username):
    _visible_company(request, username)
    return render(request, 'profiles/company_tests.html', {'username': username})


@ensure_csrf_cookie
def user_articles_view(request, username):
    get_object_or_404(Account, username=username, role=ROLE_USER)
    _require_visible(request, username)
    return render(request, 'profiles/user_articles.html', {'username': username})
