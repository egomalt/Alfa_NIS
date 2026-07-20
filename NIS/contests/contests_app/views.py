from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def contests_catalog(request):
    return render(request, 'contests/contests_app/catalog.html')


@ensure_csrf_cookie
def contest_view(request, contest_id):
    return render(request, 'contests/contests_app/contest_view.html', {
        'contest_id': contest_id,
    })
