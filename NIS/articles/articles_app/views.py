from django.db import transaction
from django.db.models import F, Q, Sum
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from articles.constructor.models import Article, ArticleVote
from articles.serializers import cover_gradient
from authorization.models import Account, ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account
from companies.models import Company
from core.auth import api_login_required
from core.utils import load_json_body
from users.models import UserProfile


AV_COLORS = [
    ('#FCE7E8', '#C81E2D'),
    ('#E2F3EA', '#15935A'),
    ('#EDF0F6', '#3C434F'),
    ('#FBEEDA', '#B7770C'),
    ('rgba(61,31,110,.15)', '#6b3fa0'),
]


def _av(username):
    ci = ord(username[0]) % len(AV_COLORS) if username else 0
    return AV_COLORS[ci]


def _author_link(username):
    """Имя автора и ссылка на его профиль: (имя, ссылка или None).

    Адрес /<username>/ отдаёт 404 модераторам, удалённым аккаунтам и компаниям
    без верификации, поэтому ссылку ставим только там, где страница откроется.
    Имя берём из аккаунта — в статье хранится один логин.
    """
    if not username:
        return '', None

    account = Account.objects.filter(username=username).first()
    if account is None:
        return username, None

    name = account.name or username
    if account.role == ROLE_USER:
        return name, f'/{username}/'
    if account.role == ROLE_COMPANY:
        company = Company.objects.filter(username=username).first()
        if company is not None and company.is_verified:
            return name, f'/{username}/'
    return name, None


def article_read(request, article_id):
    article = Article.objects.filter(id=article_id, status=Article.STATUS_PUBLISHED).first()
    if not article:
        raise Http404

    Article.objects.filter(id=article_id).update(views=F('views') + 1)
    article.views += 1

    account = get_current_account(request)
    user_vote = None
    if account:
        vote_obj = ArticleVote.objects.filter(article=article, voter_username=account.username).first()
        user_vote = vote_obj.direction if vote_obj else None

    # Related: articles with overlapping tags, excluding current
    # Раньше здесь перебиралась вся таблица опубликованных статей: на каждый
    # просмотр в память поднимались все записи ради трёх похожих.
    # Теперь пересечение тегов отбирается запросом, а в Python приходит максимум 60 строк.
    related = []
    if article.tags:
        tag_filter = Q()
        for tag in article.tags[:10]:
            tag_filter |= Q(tags__icontains=tag)
        candidates = (
            Article.objects
            .filter(tag_filter, status=Article.STATUS_PUBLISHED)
            .exclude(id=article_id)
            .order_by('-views')[:60]
        )
        wanted = set(article.tags)
        for a in candidates:
            if set(a.tags or []) & wanted:
                related.append({'article': a, 'cover_gradient': cover_gradient(a.cover_index)})
                if len(related) >= 3:
                    break

    # Author stats
    author_articles = Article.objects.filter(
        author_username=article.author_username,
        status=Article.STATUS_PUBLISHED,
    )
    author_article_count = author_articles.count()
    author_total_views = author_articles.aggregate(t=Sum('views'))['t'] or 0

    user_profile = UserProfile.objects.filter(username=article.author_username).first()
    author_name, author_url = _author_link(article.author_username)

    av_bg, av_fg = _av(article.author_username or '?')

    context = {
        'author_name': author_name,
        'author_url': author_url,
        'article': article,
        'cover_gradient': cover_gradient(article.cover_index),
        'vote_score': article.likes,
        'user_vote': user_vote,
        'related': related,
        'author_article_count': author_article_count,
        'author_total_views': author_total_views,
        'user_profile': user_profile,
        'av_bg': av_bg,
        'av_fg': av_fg,
        'initial': (article.author_username or '?')[0].upper(),
        'is_logged_in': account is not None,
        'current_username': account.username if account else '',
    }
    return render(request, 'articles_app/read.html', context)


@require_http_methods(['POST'])
@api_login_required()
def api_article_vote(request, article_id):
    account = request.account

    article = Article.objects.filter(id=article_id, status=Article.STATUS_PUBLISHED).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)

    try:
        direction = int(load_json_body(request).get('direction', 0))
    except (ValueError, TypeError):
        direction = 0
    if direction not in (1, -1):
        return JsonResponse({'ok': False, 'message': 'Неверное направление'}, status=400)

    with transaction.atomic():
        existing = ArticleVote.objects.filter(
            article=article, voter_username=account.username
        ).first()

        if existing:
            if existing.direction == direction:
                # Undo vote
                delta = -direction
                existing.delete()
                user_vote = None
            else:
                # Switch direction
                delta = direction - existing.direction
                existing.direction = direction
                existing.save(update_fields=['direction'])
                user_vote = direction
        else:
            delta = direction
            ArticleVote.objects.create(
                article=article,
                voter_username=account.username,
                direction=direction,
            )
            user_vote = direction

        Article.objects.filter(id=article_id).update(likes=F('likes') + delta)
        article.refresh_from_db(fields=['likes'])

    return JsonResponse({'ok': True, 'score': article.likes, 'user_vote': user_vote})
