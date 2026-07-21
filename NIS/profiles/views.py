from django.http import Http404
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import Account, ROLE_COMPANY, ROLE_USER


@ensure_csrf_cookie
def profile_view(request, username):
    try:
        account = Account.objects.get(username=username)
    except Account.DoesNotExist:
        raise Http404

    if account.role == ROLE_COMPANY:
        from companies.models import Company
        try:
            company = Company.objects.get(username=username)
        except Company.DoesNotExist:
            raise Http404
        if not company.is_verified:
            raise Http404
        return render(request, 'profiles/company.html', {'username': username})

    if account.role == ROLE_USER:
        return render(request, 'profiles/user.html', {'username': username})

    raise Http404


@ensure_csrf_cookie
def user_articles_view(request, username):
    try:
        account = Account.objects.get(username=username, role=ROLE_USER)
    except Account.DoesNotExist:
        raise Http404
    return render(request, 'profiles/user_articles.html', {'username': username})
