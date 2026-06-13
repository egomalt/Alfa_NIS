from django.http import JsonResponse
from django.shortcuts import redirect, render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from authorization.models import ROLE_USER
from authorization.views import get_current_account

from articles.constructor.models import Article


@ensure_csrf_cookie
def articles_cabinet(request):
    account = get_current_account(request)
    if account is None:
        return redirect('/authorization/signup/')
    if account.role != ROLE_USER:
        return redirect('/cabinet/company/')
    return render(request, 'articles_cabinet/articles_page.html', {'username': account.username})


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
def api_my_articles(request):
    current = get_current_account(request)
    if not current:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)
    articles = Article.objects.filter(author_username=current.username)
    return JsonResponse({'ok': True, 'articles': [_serialize_article(a) for a in articles]})
