from django.http import Http404
from django.shortcuts import get_object_or_404, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.views import get_current_account
from contests.access import can_view_contest
from contests.contests_cabinet.models import Contest


@ensure_csrf_cookie
def contests_catalog(request):
    return render(request, 'contests/contests_app/catalog.html')


@ensure_csrf_cookie
def contest_view(request, contest_id):
    contest = get_object_or_404(Contest, id=contest_id)
    if not can_view_contest(get_current_account(request), contest):
        raise Http404
    return render(
        request,
        'contests/contests_app/contest_view.html',
        {
            'contest_id': contest_id,
        },
    )
