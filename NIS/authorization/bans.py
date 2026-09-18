"""Что видно и что можно делать заблокированному аккаунту.

Правило такое: бан скрывает, но не удаляет. Данные остаются в базе,
из выдачи и с публичных страниц пропадают, а после разбана возвращаются сами —
списки фильтруются на лету, никаких флагов по материалам не проставляется.
Исключение одно: конкурсы заблокированной компании удаляются, потому что
висящий конкурс с дедлайном, который никто не разберёт, хуже его отсутствия.
"""
from django.db.models import Q
from django.utils import timezone

from .models import Account, STATUS_BANNED

# Подпись вместо логина там, где запись скрыть нельзя: решение на конкурс
# компания должна видеть, даже если его прислал заблокированный человек
BANNED_LABEL = 'Заблокирован'


def active_ban_q():
    """Условие «бан действует прямо сейчас» — для фильтров и счётчиков.

    Срок проверяется по дате, а не по полю status: оно снимается только при
    следующей попытке входа, поэтому истёкший бан так и лежит в базе со
    status='banned'. Совпадает с Account.is_banned, чтобы списки и карточка
    аккаунта не расходились.
    """
    now = timezone.now()
    return Q(status=STATUS_BANNED) & (Q(ban_until__isnull=True) | Q(ban_until__gt=now))


def banned_usernames():
    """Логины, чей контент нужно спрятать."""
    return set(
        Account.objects
        .filter(active_ban_q())
        .values_list('username', flat=True)
    )


def is_hidden(username):
    """Прячем ли контент этого автора от публики."""
    if not username:
        return False
    account = Account.objects.filter(username=username).only(
        'status', 'ban_until').first()
    return account is not None and account.is_banned


def label_for(username, hidden_usernames=None):
    """Как подписать автора в списке: логин или «Заблокирован».

    hidden_usernames — готовый набор из banned_usernames(), чтобы не ходить
    в базу на каждую строку списка.
    """
    if hidden_usernames is None:
        hidden_usernames = banned_usernames()
    return BANNED_LABEL if username in hidden_usernames else username


def visible_to(viewer, username):
    """Может ли зритель видеть страницу этого автора.

    Себя заблокированный видит — иначе он не узнает, что заблокирован,
    и за что. Модератор видит всех: ему с этим и работать.
    """
    if not is_hidden(username):
        return True
    if viewer is None:
        return False
    return viewer.username == username or viewer.role == 'moderator'
