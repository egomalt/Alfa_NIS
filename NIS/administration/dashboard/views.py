from functools import wraps

from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_MODERATOR
from authorization.views import get_current_account


def get_moderator(request):
    """Возвращает Account, если текущий пользователь — модератор, иначе None."""
    account = get_current_account(request)
    if account is None or account.role != ROLE_MODERATOR:
        return None
    return account


def moderator_required(view):
    """Guard для JSON-API админки: 403, если запрос не от модератора."""
    @wraps(view)
    def wrapper(request, *args, **kwargs):
        moderator = get_moderator(request)
        if moderator is None:
            return JsonResponse({'ok': False, 'message': 'Доступ только для модераторов.'}, status=403)
        request.moderator = moderator
        return view(request, *args, **kwargs)
    return wrapper


@ensure_csrf_cookie
def dashboard_shell(request):
    moderator = get_moderator(request)
    if moderator is None:
        return redirect('/authorization/signin/')
    return render(request, 'administration/dashboard.html', {'username': moderator.username})
