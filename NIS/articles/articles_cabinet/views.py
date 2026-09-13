from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from authorization.models import ROLE_USER
from core.auth import api_login_required, page_login_required

from articles.constructor.models import Article


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_articles(request):
    """Раздел «Мои статьи» кабинета кандидата (единый сайдбарный вид)."""
    return render(request, 'articles_cabinet/my_articles.html',
                  {'username': request.account.username, 'page': 'articles'})


def _serialize_article(a):
    return {
        'id': a.id,
        'title': a.title,
        'excerpt': a.excerpt,
        'tags': a.tags or [],
        'status': a.status,
        'cover_index': a.cover_index,
        'read_time': a.read_time,
        'views': a.views,
        'likes': a.likes,
        'created_at': a.created_at.isoformat(),
        'updated_at': a.updated_at.isoformat(),
        'published_at': a.published_at.isoformat() if a.published_at else None,
    }


@require_GET
@api_login_required()
def api_my_articles(request):
    articles = Article.objects.filter(author_username=request.account.username)
    return JsonResponse({'ok': True, 'articles': [_serialize_article(a) for a in articles]})
