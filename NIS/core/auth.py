"""Проверка доступа для вьюх.

JSON-эндпоинты отдают 401/403, HTML-страницы уводят на форму входа.
Прошедшая проверку вьюха берёт аккаунт из `request.account`.
"""
from functools import wraps

from django.http import JsonResponse
from django.shortcuts import redirect

from authorization.models import ROLE_MODERATOR
from authorization.views import get_current_account

SIGNIN_URL = '/authorization/signin/'


def ban_block(account, method):
    """Ответ вместо действия, если аккаунт заблокирован. Иначе None.

    Чтение заблокированному оставлено: он должен увидеть причину бана.
    """
    if method in ('GET', 'HEAD', 'OPTIONS') or not account.is_banned:
        return None
    message = 'Аккаунт заблокирован'
    if account.ban_reason:
        message += ': ' + account.ban_reason
    return JsonResponse({'ok': False, 'message': message + '.', 'code': 'banned'}, status=403)


def api_login_required(*roles):
    """401 без входа, 403 при неподходящей роли. Без ролей — любой вошедший."""
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            account = get_current_account(request)
            if account is None:
                return JsonResponse({'ok': False, 'message': 'Требуется вход.'}, status=401)
            if roles and account.role not in roles:
                return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
            blocked = ban_block(account, request.method)
            if blocked is not None:
                return blocked
            request.account = account
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


def page_login_required(*roles, redirect_to=SIGNIN_URL):
    """Guard для HTML-страниц: уводит на форму входа, если доступа нет."""
    def decorator(view):
        @wraps(view)
        def wrapper(request, *args, **kwargs):
            account = get_current_account(request)
            if account is None or (roles and account.role not in roles):
                return redirect(redirect_to)
            request.account = account
            return view(request, *args, **kwargs)
        return wrapper
    return decorator


def moderator_required(view):
    """Доступ только модератору."""
    return api_login_required(ROLE_MODERATOR)(view)
