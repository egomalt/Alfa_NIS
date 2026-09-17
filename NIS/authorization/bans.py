"""Что видно и что можно делать заблокированному аккаунту.

До этого бан означал ровно одно: «не войти». Всё опубликованное продолжало
жить — профиль открывался, статьи и тесты висели в каталогах, — и бан за
материал приходилось добивать удалением руками.

Правило теперь такое: бан скрывает, но не удаляет. Данные остаются в базе,
из выдачи и с публичных страниц пропадают, а после разбана возвращаются сами —
списки фильтруются на лету, никаких флагов по материалам не проставляется.
Исключение одно: конкурсы заблокированной компании удаляются, потому что
висящий конкурс с дедлайном, который никто не разберёт, хуже его отсутствия.
"""
from django.utils import timezone

from .models import Account, STATUS_BANNED

# Подпись вместо логина там, где запись скрыть нельзя: решение на конкурс
# компания должна видеть, даже если его прислал заблокированный человек
BANNED_LABEL = 'Заблокирован'


def banned_usernames():
    """Логины, чей контент нужно спрятать.

    Истёкший бан сюда не попадает: срок проверяется по дате, а не по полю
    status, которое снимается только при следующей попытке входа.
    """
    now = timezone.now()
    return set(
        Account.objects
        .filter(status=STATUS_BANNED)
        .exclude(ban_until__lt=now)
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
