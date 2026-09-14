from django.db.models import Avg, Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from authorization.models import ROLE_COMPANY, ROLE_USER
from authorization.views import get_current_account
from core.auth import api_login_required, page_login_required
from core.pagination import paginate
from core.utils import load_json_body, serialize_form_errors
from tests.constructor.models import Test

from .forms import CompanyProfileForm, CompanyVerificationForm
from .models import Company, CompanyRating, ensure_company

# Каталоги фильтруются на стороне браузера, поэтому страница крупная:
# ограничение защищает от выгрузки всей таблицы, но не режет текущий интерфейс.
CATALOG_PER_PAGE = 100


@ensure_csrf_cookie
@page_login_required(ROLE_COMPANY)
def company_tests_page(request):
    """Раздел «Тесты» кабинета компании (страница в доменном приложении)."""
    account = request.account
    company = ensure_company(account)
    if not company.is_verified:
        return redirect('/cabinet/company/')
    return render(request, 'companies/tests.html', {
        'app_path': request.path,
        'owner_username': account.username,
        'page': 'tests',
    })


def _company_rating(company):
    agg = company.ratings.aggregate(avg=Avg('rating'), cnt=Count('id'))
    avg = agg['avg']
    total = agg['cnt'] or 0
    dist = {}
    if total:
        for row in company.ratings.values('rating').annotate(c=Count('id')):
            dist[row['rating']] = round(row['c'] / total * 100)
    return round(avg, 1) if avg is not None else None, total, dist


def _serialize_company(company, include_private=False):
    """Карточка компании. Приватные поля (регистрационный документ) — только владельцу
    и модератору: раньше ссылка на юрдокумент уходила в публичный ответ."""
    avg_rating, rating_count, rating_dist = _company_rating(company)
    data = {
        'id': company.id,
        'username': company.username,
        'name': company.name,
        'description': company.description,
        'contact_email': company.contact_email,
        'phone': company.phone,
        'website': company.website,
        'address': company.address,
        'city': company.city,
        'company_size': company.company_size,
        'industry': company.industry,
        'avatar_url': company.avatar.url if company.avatar else '',
        'direction_1': company.direction_1,
        'direction_2': company.direction_2,
        'direction_3': company.direction_3,
        'direction_4': company.direction_4,
        'directions': [d for d in [company.direction_1, company.direction_2, company.direction_3, company.direction_4] if d],
        'created_at': company.created_at.isoformat(),
        'updated_at': company.updated_at.isoformat(),
        'is_verified': company.is_verified,
        'verification_status': company.verification_status,
        'verification_reason': company.verification_reason,
        'submitted_at': company.submitted_at.isoformat() if company.submitted_at else None,
        'avg_rating': avg_rating,
        'rating_count': rating_count,
        'rating_dist': rating_dist,
    }
    if include_private:
        doc = company.registration_document
        data['registration_document_url'] = doc.url if doc else ''
    return data



@require_GET
def api_companies_list(request):

    # Сортируем по числу опубликованных тестов: каталог нужен кандидату, чтобы
    # найти, где что порешать, — компании без единого теста внизу.
    # Тесты связаны с компанией строкой owner_username, поэтому считаем подзапросом.
    published_tests = (
        Test.objects
        .filter(status=Test.STATUS_PUBLISHED, owner_username=OuterRef('username'))
        .values('owner_username')
        .annotate(n=Count('id'))
        .values('n')
    )
    companies_qs = (
        Company.objects
        .filter(verification_status=Company.VERIF_APPROVED)
        .annotate(tests_total=Coalesce(Subquery(published_tests, output_field=IntegerField()), 0))
        .order_by('-tests_total', '-created_at')
    )
    companies, page_meta = paginate(request, companies_qs, CATALOG_PER_PAGE)

    ratings_qs = (
        CompanyRating.objects
        .values('company__username')
        .annotate(avg=Avg('rating'), cnt=Count('id'))
    )
    ratings_map = {r['company__username']: (round(r['avg'], 1), r['cnt']) for r in ratings_qs}

    result = [
        {
            'username': c.username,
            'name': c.name,
            'description': c.description,
            'avatar_url': c.avatar.url if c.avatar else '',
            'is_verified': c.is_verified,
            'industry': c.industry,
            'city': c.city,
            'tests_count': c.tests_total,
            'profile_url': f'/{c.username}/',
            'avg_rating': ratings_map.get(c.username, (None, 0))[0],
            'rating_count': ratings_map.get(c.username, (None, 0))[1],
        }
        for c in companies
    ]

    return JsonResponse({'ok': True, 'companies': result, **page_meta})


@require_GET
def api_company_detail(request, username):
    company = get_object_or_404(Company, username=username)
    current = get_current_account(request)
    is_owner = current is not None and current.username == username
    return JsonResponse({
        'ok': True,
        'company': _serialize_company(company, include_private=is_owner),
        'is_owner': is_owner,
    })


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_company_profile(request, username):
    company = get_object_or_404(Company, username=username)
    if request.account.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
    form = CompanyProfileForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)
    company = form.save()
    return JsonResponse({'ok': True, 'company': _serialize_company(company, include_private=True)})


@require_http_methods(['POST'])
@api_login_required(ROLE_COMPANY)
def api_company_verification(request, username):
    company = get_object_or_404(Company, username=username)
    if request.account.username != username:
        return JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
    form = CompanyVerificationForm(request.POST, request.FILES, instance=company)
    if not form.is_valid():
        return JsonResponse({'ok': False, 'errors': serialize_form_errors(form)}, status=400)
    company = form.save(commit=False)
    # Загрузка документа отправляет компанию на ручную модерацию
    company.verification_status = Company.VERIF_PENDING
    company.verification_reason = ''
    company.submitted_at = timezone.now()
    company.verified_at = None
    company.save()
    return JsonResponse({
        'ok': True,
        'company': _serialize_company(company, include_private=True),
        'next_url': '/cabinet/company/',
    })


@require_GET
def api_company_tests(request, username):

    company = get_object_or_404(Company, username=username)
    current = get_current_account(request)
    is_owner = current is not None and current.username == username

    if not company.is_verified:
        return JsonResponse(
            {
                'ok': False,
                'message': 'Сначала подтвердите компанию, чтобы открыть раздел тестов.',
                'next_url': '/cabinet/company/',
            },
            status=403,
        )

    # Эндпоинт открыт всем: черновики с их названиями и ссылками в конструктор
    # видит только владелец, остальным отдаём опубликованные.
    tests = Test.objects.filter(owner_username=username)
    if not is_owner:
        tests = tests.filter(status=Test.STATUS_PUBLISHED)
    tests = tests.annotate(page_total=Count('pages'))

    total = tests.count()
    active = sum(1 for t in tests if t.status == Test.STATUS_PUBLISHED)
    submissions = sum(t.stats.get('submissions', 0) for t in tests)

    serialized = [
        {
            'id': t.id,
            'title': t.title,
            'status': t.status,
            # Уровень и категория нужны публичной странице тестов компании
            'level': t.stats.get('level', ''),
            'category': t.stats.get('category', ''),
            'page_count': t.page_total,
            'submissions': t.stats.get('submissions', 0),
            'created_at': t.created_at.isoformat(),
            'url': f'/tests/{t.id}/' if t.status == t.STATUS_PUBLISHED else f'/constructor/{t.id}/?owner={username}',
            'edit_url': f'/constructor/{t.id}/',
        }
        for t in tests
    ]

    return JsonResponse({
        'ok': True,
        'company': _serialize_company(company, include_private=is_owner),
        'is_owner': is_owner,
        'tests': serialized,
        'stats': {
            'total_tests': total,
            'active_tests': active,
            'submissions': submissions,
            'completion_rate': round(active / total * 100) if total else 0,
        },
    })


@require_GET
@api_login_required()
def api_my_company_ratings(request):
    ratings = (
        CompanyRating.objects
        .filter(user_username=request.account.username)
        .select_related('company')
        .order_by('-id')
    )
    result = [
        {'company_username': r.company.username, 'company_name': r.company.name, 'rating': r.rating}
        for r in ratings
    ]
    return JsonResponse({'ok': True, 'ratings': result})


@require_http_methods(['POST'])
@api_login_required(ROLE_USER)
def api_company_rate(request, username):

    account = request.account

    try:
        rating = int(load_json_body(request).get('rating', 0))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'message': 'Некорректные данные'}, status=400)

    if rating < 1 or rating > 5:
        return JsonResponse({'ok': False, 'message': 'Оценка должна быть от 1 до 5'}, status=400)

    company = get_object_or_404(Company, username=username)
    CompanyRating.objects.update_or_create(
        company=company,
        user_username=account.username,
        defaults={'rating': rating},
    )

    agg = company.ratings.aggregate(avg=Avg('rating'))
    avg = agg['avg']
    return JsonResponse({
        'ok': True,
        'avg_rating': round(avg, 1) if avg is not None else None,
        'rating_count': company.ratings.count(),
    })
