import json

from django.db import transaction
from django.db.models import F, Sum
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods

from articles.constructor.models import Article, ArticleVote
from authorization.views import get_current_account
from users.models import UserProfile

COVERS = [
    'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%)',
    'linear-gradient(135deg,#D62839 0%,#7a1020 100%)',
    'linear-gradient(135deg,#134e5e 0%,#1a7a6e 100%)',
    'linear-gradient(135deg,#3d1f6e 0%,#6b3fa0 100%)',
    'linear-gradient(135deg,#2d3a1a 0%,#4a7a2d 100%)',
    'linear-gradient(135deg,#5c3d00 0%,#b07000 100%)',
]

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
    related = []
    if article.tags:
        all_published = Article.objects.filter(
            status=Article.STATUS_PUBLISHED
        ).exclude(id=article_id).order_by('-views')
        for a in all_published:
            if set(a.tags or []) & set(article.tags):
                cover_gradient = COVERS[a.cover_index % len(COVERS)]
                related.append({'article': a, 'cover_gradient': cover_gradient})
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

    av_bg, av_fg = _av(article.author_username or '?')

    context = {
        'article': article,
        'cover_gradient': COVERS[article.cover_index % len(COVERS)],
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
def api_article_vote(request, article_id):
    account = get_current_account(request)
    if not account:
        return JsonResponse({'ok': False, 'message': 'Нет доступа'}, status=401)

    article = Article.objects.filter(id=article_id, status=Article.STATUS_PUBLISHED).first()
    if not article:
        return JsonResponse({'ok': False, 'message': 'Статья не найдена'}, status=404)

    try:
        body = json.loads(request.body)
        direction = int(body.get('direction', 0))
        if direction not in (1, -1):
            raise ValueError
    except (ValueError, TypeError):
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
