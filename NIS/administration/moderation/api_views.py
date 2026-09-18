from datetime import timedelta

from django.http import JsonResponse
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from contests.contests_cabinet.models import Contest
from core.auth import moderator_required
from core.pagination import paginate
from core.utils import load_json_body
from authorization import bans
from authorization.models import (
    Account, ROLE_LABELS, ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER,
    STATUS_ACTIVE, STATUS_BANNED,
)

# Списки модерации могут вырасти, поэтому выдача постраничная.
CATALOG_PER_PAGE = 100

# Потолок срока бана в днях (10 лет). Без него int() из формы принимает любое
# число, и timedelta с ним выбрасывает OverflowError — запрос падает с 500.
MAX_BAN_DAYS = 3650


def serialize_account(account):
    return {
        'username': account.username,
        'name': account.name,
        'letter': (account.name or account.username or '?').strip()[:1].upper(),
        'role': account.role,
        'role_label': ROLE_LABELS.get(account.role, account.role),
        'joined_at': account.created_at.isoformat(),
        # Статус отдаём действующий: у истёкшего бана в базе так и остаётся
        # status='banned', а в списке он уже обычный пользователь
        'status': STATUS_BANNED if account.is_banned else STATUS_ACTIVE,
        'ban_until': account.ban_until.isoformat() if account.is_banned and account.ban_until else None,
        'ban_reason': account.ban_reason if account.is_banned else '',
    }


@require_GET
@moderator_required
def api_users(request):
    flt = request.GET.get('filter', 'all')
    q = (request.GET.get('q') or '').strip()

    qs = Account.objects.all()
    if flt == 'banned':
        qs = qs.filter(bans.active_ban_q())
    elif flt in (ROLE_USER, ROLE_COMPANY, ROLE_MODERATOR):
        qs = qs.filter(role=flt)
    if q:
        # Ищем и по имени, и по логину: в списке показывается именно логин
        qs = qs.filter(Q(name__icontains=q) | Q(username__icontains=q))

    qs = qs.order_by('-created_at')
    users, page_meta = paginate(request, qs, CATALOG_PER_PAGE)
    return JsonResponse({'ok': True, 'users': [serialize_account(a) for a in users], **page_meta})


@require_POST
@moderator_required
def api_user_ban(request, username):
    account = get_object_or_404(Account, username=username)
    if account.role == ROLE_MODERATOR:
        return JsonResponse({'ok': False, 'message': 'Нельзя заблокировать модератора.'}, status=400)

    data = load_json_body(request)
    reason = (data.get('reason') or '').strip()
    duration = data.get('duration')  # 'perm' или число дней (int/строка)

    if duration == 'perm' or duration is None:
        ban_until = None
    else:
        try:
            days = int(duration)
        except (ValueError, TypeError):
            days = 7
        days = min(max(days, 1), MAX_BAN_DAYS)
        ban_until = timezone.now() + timedelta(days=days)

    account.status = STATUS_BANNED
    account.ban_until = ban_until
    account.ban_reason = reason
    account.save(update_fields=['status', 'ban_until', 'ban_reason'])

    # Конкурсы заблокированной компании удаляем, а не прячем: у конкурса
    # есть дедлайн и присланные решения, и повисший приём работ, который
    # никто не разберёт, хуже, чем его отсутствие. Остальной контент
    # (статьи, тесты, профиль) только скрывается и вернётся после разбана.
    removed = 0
    if account.role == ROLE_COMPANY:
        contests = Contest.objects.filter(company_username=username)
        # Считаем до удаления: delete() возвращает число всех задетых записей,
        # включая решения и вложения, — в ответе это выглядело бы завышенным
        removed = contests.count()
        contests.delete()

    return JsonResponse({
        'ok': True,
        'user': serialize_account(account),
        'contests_removed': removed,
    })


@require_POST
@moderator_required
def api_user_unban(request, username):
    account = get_object_or_404(Account, username=username)
    account.status = STATUS_ACTIVE
    account.ban_until = None
    account.ban_reason = ''
    account.save(update_fields=['status', 'ban_until', 'ban_reason'])
    return JsonResponse({'ok': True, 'user': serialize_account(account)})
