"""Сериализация статьи для каталогов и кабинета."""
# Список продублирован в JS — порядок задаёт cover_index
COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
    'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
    'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    'linear-gradient(135deg,#5c3d00 0%,#b07000 100%)',
]


def cover_gradient(cover_index):
    """Градиент обложки по индексу. Отрицательный индекс — обложки нет."""
    if cover_index is None or cover_index < 0:
        return None
    return COVERS[cover_index % len(COVERS)]


def author_names_for(articles):
    """Имена авторов {username: имя} одним запросом на всю страницу."""
    from authorization.models import Account

    usernames = {a.author_username for a in articles if a.author_username}
    if not usernames:
        return {}
    return {
        username: name or username
        for username, name in Account.objects.filter(username__in=usernames).values_list('username', 'name')
    }


def serialize_article(article, with_author=True, with_status=False, author_names=None):
    """Карточка статьи.

    with_author — добавляет автора (публичные каталоги);
    with_status — добавляет статус и даты правки (кабинет автора);
    author_names — карта из author_names_for(), чтобы показать имя вместо логина.
    """
    data = {
        'id': article.id,
        'title': article.title,
        'excerpt': article.excerpt,
        'tags': article.tags or [],
        'cover_index': article.cover_index,
        'read_time': article.read_time,
        'views': article.views,
        'likes': article.likes,
        'published_at': article.published_at.isoformat() if article.published_at else None,
    }
    if with_author:
        data['author_username'] = article.author_username
        data['author_name'] = (author_names or {}).get(article.author_username) or article.author_username
    if with_status:
        data['status'] = article.status
        data['created_at'] = article.created_at.isoformat()
        data['updated_at'] = article.updated_at.isoformat()
    return data
