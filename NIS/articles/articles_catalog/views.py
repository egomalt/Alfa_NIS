from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from articles.constructor.models import Article


@ensure_csrf_cookie
def articles_catalog_shell(request):
    return render(request, 'articles_catalog/catalog.html')


def api_articles_catalog(request):
    articles = Article.objects.filter(status=Article.STATUS_PUBLISHED).order_by('-published_at')
    data = []
    for a in articles:
        data.append({
            'id': a.id,
            'title': a.title,
            'excerpt': a.excerpt,
            'tags': a.tags or [],
            'read_time': a.read_time,
            'views': a.views,
            'likes': a.likes,
            'cover_index': a.cover_index,
            'author_username': a.author_username,
            'published_at': a.published_at.isoformat() if a.published_at else None,
        })
    return JsonResponse({'ok': True, 'articles': data})


def _serialize_article(a):
    return {
        'id': a.id,
        'title': a.title,
        'excerpt': a.excerpt,
        'tags': a.tags or [],
        'read_time': a.read_time,
        'views': a.views,
        'likes': a.likes,
        'cover_index': a.cover_index,
        'author_username': a.author_username,
        'published_at': a.published_at.isoformat() if a.published_at else None,
    }


def api_user_articles(request, username):
    articles = Article.objects.filter(
        author_username=username,
        status=Article.STATUS_PUBLISHED,
    ).order_by('-published_at')
    return JsonResponse({'ok': True, 'articles': [_serialize_article(a) for a in articles]})
