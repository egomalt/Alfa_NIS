import json
from datetime import timedelta

from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from administration.dashboard.views import moderator_required
from authorization.models import (
    Account, ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER,
    STATUS_ACTIVE, STATUS_BANNED, STATUS_WARNED,
)

ROLE_LABELS = {ROLE_USER: 'Кандидат', ROLE_COMPANY: 'Компания', ROLE_MODERATOR: 'Модератор'}


def serialize_account(account):
    return {
        'username': account.username,
        'name': account.name,
        'letter': (account.name or account.username or '?').strip()[:1].upper(),
        'role': account.role,
        'role_label': ROLE_LABELS.get(account.role, account.role),
        'joined_at': account.created_at.isoformat(),
        'status': account.status,
        'ban_until': account.ban_until.isoformat() if account.ban_until else None,
        'ban_reason': account.ban_reason,
        'warning_reason': account.warning_reason,
    }


@require_GET
@moderator_required
def api_users(request):
    flt = request.GET.get('filter', 'all')
    q = (request.GET.get('q') or '').strip()

    qs = Account.objects.all()
    if flt == 'banned':
        qs = qs.filter(status=STATUS_BANNED)
    elif flt in (ROLE_USER, ROLE_COMPANY, ROLE_MODERATOR):
        qs = qs.filter(role=flt)
    if q:
        qs = qs.filter(name__icontains=q)

    qs = qs.order_by('-created_at')
    return JsonResponse({'ok': True, 'users': [serialize_account(a) for a in qs]})


def _load_body(request):
    try:
        return json.loads(request.body or '{}')
    except (ValueError, TypeError):
        return {}


@require_POST
@moderator_required
def api_user_ban(request, username):
    account = get_object_or_404(Account, username=username)
    if account.role == ROLE_MODERATOR:
        return JsonResponse({'ok': False, 'message': 'Нельзя заблокировать модератора.'}, status=400)

    data = _load_body(request)
    reason = (data.get('reason') or '').strip()
    duration = data.get('duration')  # 'perm' или число дней (int/строка)

    if duration == 'perm' or duration is None:
        ban_until = None
    else:
        try:
            days = int(duration)
        except (ValueError, TypeError):
            days = 7
        ban_until = timezone.now() + timedelta(days=max(1, days))

    account.status = STATUS_BANNED
    account.ban_until = ban_until
    account.ban_reason = reason
    account.save(update_fields=['status', 'ban_until', 'ban_reason'])
    return JsonResponse({'ok': True, 'user': serialize_account(account)})


@require_POST
@moderator_required
def api_user_warn(request, username):
    account = get_object_or_404(Account, username=username)
    if account.role == ROLE_MODERATOR:
        return JsonResponse({'ok': False, 'message': 'Нельзя предупредить модератора.'}, status=400)

    data = _load_body(request)
    reason = (data.get('reason') or '').strip()
    account.status = STATUS_WARNED
    account.warning_reason = reason
    account.warned_at = timezone.now()
    account.save(update_fields=['status', 'warning_reason', 'warned_at'])
    return JsonResponse({'ok': True, 'user': serialize_account(account)})


@require_POST
@moderator_required
def api_user_unban(request, username):
    account = get_object_or_404(Account, username=username)
    account.status = STATUS_ACTIVE
    account.ban_until = None
    account.ban_reason = ''
    account.save(update_fields=['status', 'ban_until', 'ban_reason'])
    return JsonResponse({'ok': True, 'user': serialize_account(account)})
