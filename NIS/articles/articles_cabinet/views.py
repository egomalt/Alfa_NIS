from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET

from authorization.models import ROLE_USER
from core.auth import api_login_required, page_login_required

from articles.constructor.models import Article
from articles.serializers import serialize_article
from core.pagination import paginate

# Каталоги фильтруются на стороне браузера, поэтому страница крупная:
# ограничение защищает от выгрузки всей таблицы, но не режет текущий интерфейс.
CATALOG_PER_PAGE = 100


@ensure_csrf_cookie
@page_login_required(ROLE_USER)
def my_articles(request):
    """Раздел «Мои статьи» кабинета кандидата (единый сайдбарный вид)."""
    return render(request, 'articles_cabinet/my_articles.html',
                  {'username': request.account.username, 'page': 'articles'})


@require_GET
@api_login_required()
def api_my_articles(request):
    articles_qs = Article.objects.filter(author_username=request.account.username).order_by('-created_at')
    articles, page_meta = paginate(request, articles_qs, CATALOG_PER_PAGE)
    return JsonResponse({'ok': True, 'articles': [serialize_article(a, with_author=False, with_status=True) for a in articles], **page_meta})
