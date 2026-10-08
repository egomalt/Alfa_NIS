from collections import Counter

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from articles.constructor.models import Article
from articles.serializers import author_names_for, serialize_article
from authorization import bans
from core.pagination import paginate, text_param, wants_extras

# Сколько отдавать без ?per_page= — каталог и профиль просят меньше сами
CATALOG_PER_PAGE = 100
TRENDING_SIZE = 5


@ensure_csrf_cookie
def articles_catalog_shell(request):
    return render(request, 'articles_catalog/catalog.html')


def _serialize(articles):
    names = author_names_for(articles)
    return [serialize_article(a, author_names=names) for a in articles]


@require_GET
def api_articles_catalog(request):
    """Каталог: ?q= ищет по заголовку и тегам, ?tag= — точный тег."""
    # Материалы заблокированных скрываем фильтром, а не удалением:
    # после разбана они возвращаются сами
    published = (
        Article.objects.filter(status=Article.STATUS_PUBLISHED)
        .exclude(author_username__in=bans.banned_usernames())
        .order_by('-published_at')
    )
    query, tag = text_param(request, 'q').casefold(), text_param(request, 'tag')
    articles_qs = published
    if query or tag:
        # Теги лежат списком в JSON: сверяем в Python — одинаково для SQLite и PostgreSQL
        # и без зависимости от регистра кириллицы, с которой не справляется LIKE в SQLite
        matching = [
            article_id
            for article_id, title, tags in published.values_list('id', 'title', 'tags')
            if (not tag or tag in (tags or []))
            and (not query or query in title.casefold() or any(query in t.casefold() for t in tags or []))
        ]
        articles_qs = published.filter(id__in=matching)

    articles, page_meta = paginate(request, articles_qs, CATALOG_PER_PAGE)
    response = {'ok': True, 'articles': _serialize(articles), **page_meta}
    if wants_extras(request):
        tag_counts = Counter(t for tags in published.values_list('tags', flat=True) for t in tags or [])
        response['extras'] = {
            'featured': _serialize(published[:1]),
            'trending': _serialize(published.order_by('-views', '-published_at')[:TRENDING_SIZE]),
            'tags': [name for name, _ in tag_counts.most_common()],
        }
    return JsonResponse(response)


@require_GET
def api_user_articles(request, username):
    articles_qs = (
        Article.objects.filter(author_username=username, status=Article.STATUS_PUBLISHED)
        .exclude(author_username__in=bans.banned_usernames())
        .order_by('-published_at')
    )
    articles, page_meta = paginate(request, articles_qs, CATALOG_PER_PAGE)
    names = author_names_for(articles)
    return JsonResponse(
        {
            'ok': True,
            'articles': [serialize_article(a, author_names=names) for a in articles],
            **page_meta,
        }
    )
