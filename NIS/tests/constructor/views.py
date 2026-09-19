from django.db import transaction
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from authorization.models import ROLE_COMPANY, ROLE_USER
from core.auth import api_login_required, page_login_required
from core.utils import load_json_body
from tests import attempts, code_results, statistics
from users import activity

from .executor import LANGUAGES, run_in_docker
from .models import Test, TestAnswer, TestPage

# Тесты заводят и кандидаты, и компании
TEST_OWNER_ROLES = (ROLE_USER, ROLE_COMPANY)

# Потолки для запуска пользовательского кода: значения приходят из page_meta,
# которую заполняет автор теста
MAX_CODE_LENGTH = 100_000
MAX_TEST_CASES = 50
MAX_TIME_LIMIT = 10
DEFAULT_TIME_LIMIT = 5


def _safe_time_limit(raw_value):
    """Лимит времени из page_meta, приведённый к допустимым границам."""
    try:
        seconds = int(raw_value)
    except (TypeError, ValueError):
        return DEFAULT_TIME_LIMIT
    return max(1, min(seconds, MAX_TIME_LIMIT))


def public_code_meta(page):
    """Часть page_meta задачи на код, которую можно показать проходящему тест.

    Скрытые тест-кейсы наружу не отдаём: видны только помеченные is_sample.
    """
    meta = page.page_meta or {}
    samples = [
        {'input': case.get('input', ''), 'expected': case.get('expected', '')}
        for case in (meta.get('test_cases') or [])
        if case.get('is_sample')
    ]
    return {
        'language': meta.get('language') or 'python',
        'time_limit': _safe_time_limit(meta.get('time_limit')),
        'samples': samples[:MAX_TEST_CASES],
    }


@ensure_csrf_cookie
@page_login_required(*TEST_OWNER_ROLES)
def constructor_shell(request, test_id=None):
    account = request.account
    back_url = '/cabinet/company/tests/' if account.role == ROLE_COMPANY else '/cabinet/user/tests/'
    return render(request, 'constructor/constructor.html', {
        'app_path': request.path,
        'test_id': test_id or '',
        'owner_username': account.username,
        'is_authenticated': True,
        'back_url': back_url,
        # Список языков — из исполнителя, чтобы в шаблоне не оказалось лишних
        'languages': [{'key': key, 'label': cfg['label']} for key, cfg in LANGUAGES.items()],
        'max_time_limit': MAX_TIME_LIMIT,
    })


@ensure_csrf_cookie
@page_login_required(*TEST_OWNER_ROLES)
def constructor_stats_shell(request, test_id):
    """Страница «Как проходят тест». Доступна только автору теста."""
    account = request.account
    test = Test.objects.filter(id=test_id, owner_username=account.username).first()
    if test is None:
        raise Http404

    # Базовый шаблон и боковая панель — по роли автора
    is_company = account.role == ROLE_COMPANY
    return render(request, 'constructor/test_stats.html', {
        'base_template': 'cabinet/base_company.html' if is_company else 'cabinet/base_user.html',
        'username': account.username,
        'test_id': test_id,
        'test_title': test.title,
        'page': 'tests',
        'panel': 'none',
        'back_url': '/cabinet/company/tests/' if is_company else '/cabinet/user/tests/',
    })


def _serialize_answer(answer):
    return {
        'id': answer.id,
        'text': answer.text,
        'is_correct': answer.is_correct,
        'order': answer.order,
    }


def _serialize_page(page):
    data = {
        'id': page.id,
        'order': page.order,
        'type': page.type,
        'title': page.title,
        'content': page.content,
    }
    if page.type in (TestPage.TYPE_QUIZ, TestPage.TYPE_INPUT):
        data['answers'] = [_serialize_answer(a) for a in page.answers.all()]
    if page.type == TestPage.TYPE_CODE:
        data['page_meta'] = page.page_meta or {}
    return data


def _serialize_test(test, include_pages=False):
    stats = test.stats or {}
    data = {
        'id': test.id,
        'owner_username': test.owner_username,
        'title': test.title,
        'description': test.description,
        'status': test.status,
        'level': stats.get('level', ''),
        'category': stats.get('category', ''),
        'page_count': len(test.pages.all()),
        'submissions': attempts.count_for(test),
        'created_at': test.created_at.isoformat(),
        'updated_at': test.updated_at.isoformat(),
        'url': f'/tests/{test.id}/',
        'edit_url': f'/constructor/{test.id}/',
    }
    if include_pages:
        data['pages'] = [_serialize_page(p) for p in test.pages.all()]
    return data


@require_GET
@api_login_required()
def api_tests_list(request):
    """Свои тесты, включая черновики. Публичные отдаёт каталог."""
    tests = (Test.objects
             .filter(owner_username=request.account.username)
             .prefetch_related('pages')
             .annotate(finished_attempts=attempts.finished_count()))
    return JsonResponse({'ok': True, 'tests': [_serialize_test(t) for t in tests]})


@require_GET
@api_login_required()
def api_my_attempts(request):
    """Прохождения, активность по дням и серии — для кабинета кандидата."""
    username = request.account.username
    daily = activity.daily(username)
    return JsonResponse({
        'ok': True,
        **statistics.for_candidate(username),
        'daily': daily,
        'streak': activity.streaks(daily),
    })


@require_GET
@api_login_required()
def api_test_statistics(request, test_id):
    """Как проходят тест — только автору: это непубличные данные."""
    test, error = _owned_test_or_error(request, test_id)
    if error:
        return error
    return JsonResponse({'ok': True, **statistics.collect(test)})


def _owned_test_or_error(request, test_id):
    """Тест текущего пользователя либо готовый JSON-ответ с отказом."""
    test = Test.objects.filter(id=test_id).first()
    if test is None:
        return None, JsonResponse({'ok': False, 'message': 'Тест не найден.'}, status=404)
    if test.owner_username != request.account.username:
        return None, JsonResponse({'ok': False, 'message': 'Нет доступа.'}, status=403)
    return test, None


def _save_pages(test, pages_data):
    test.pages.all().delete()
    for page_data in (pages_data or []):
        page = TestPage.objects.create(
            test=test,
            order=page_data.get('order', 0),
            type=page_data.get('type', TestPage.TYPE_TEXT),
            title=(page_data.get('title') or ''),
            content=(page_data.get('content') or ''),
            page_meta=(page_data.get('page_meta') or {}),
        )
        for ans_data in (page_data.get('answers') or []):
            TestAnswer.objects.create(
                page=page,
                text=(ans_data.get('text') or ''),
                is_correct=bool(ans_data.get('is_correct', False)),
                order=ans_data.get('order', 0),
            )


@require_http_methods(['POST'])
@api_login_required(*TEST_OWNER_ROLES)
def api_tests_create(request):
    body = load_json_body(request)

    owner_username = request.account.username
    title = (body.get('title') or '').strip()
    if not title:
        return JsonResponse({'ok': False, 'message': 'Укажите название теста.'}, status=400)

    level = (body.get('level') or '').strip()
    category = (body.get('category') or '').strip()

    with transaction.atomic():
        test = Test.objects.create(
            owner_username=owner_username,
            title=title,
            description=(body.get('description') or '').strip(),
            stats={'level': level, 'category': category},
        )
        _save_pages(test, body.get('pages'))

    return JsonResponse({'ok': True, 'test': _serialize_test(test, include_pages=True)}, status=201)


@require_http_methods(['GET', 'PUT', 'DELETE'])
@api_login_required()
def api_test_detail(request, test_id):
    # Редактор отдаёт признак правильного ответа, поэтому только владельцу
    test, error = _owned_test_or_error(request, test_id)
    if error:
        return error

    if request.method == 'GET':
        return JsonResponse({'ok': True, 'test': _serialize_test(test, include_pages=True)})

    if request.method == 'DELETE':
        test.delete()
        return JsonResponse({'ok': True})

    # PUT — full replace
    body = load_json_body(request)

    title = (body.get('title') or '').strip()
    if not title:
        return JsonResponse({'ok': False, 'message': 'Укажите название теста.'}, status=400)

    stats = dict(test.stats or {})
    stats['level'] = (body.get('level') or '').strip()
    stats['category'] = (body.get('category') or '').strip()

    with transaction.atomic():
        test.title = title
        test.description = (body.get('description') or '').strip()
        test.status = Test.STATUS_DRAFT
        test.stats = stats
        test.save(update_fields=['title', 'description', 'status', 'stats', 'updated_at'])
        _save_pages(test, body.get('pages'))

    return JsonResponse({'ok': True, 'test': _serialize_test(test, include_pages=True)})


@require_http_methods(['POST'])
@api_login_required()
def api_test_publish(request, test_id):
    test, error = _owned_test_or_error(request, test_id)
    if error:
        return error

    if not test.pages.exists():
        return JsonResponse({'ok': False, 'message': 'Нельзя опубликовать тест без страниц.'}, status=400)

    test.status = Test.STATUS_PUBLISHED
    test.save(update_fields=['status', 'updated_at'])
    return JsonResponse({'ok': True, 'test': _serialize_test(test)})


@require_http_methods(['POST'])
@api_login_required()
def api_code_run(request, page_id):
    page = (TestPage.objects
            .filter(id=page_id, type=TestPage.TYPE_CODE)
            .select_related('test')
            .first())
    # Чужой черновик запускать нельзя: иначе по id страницы можно
    # прощупать задачу из ещё не опубликованного теста
    if page is None or (page.test.status != Test.STATUS_PUBLISHED
                        and page.test.owner_username != request.account.username):
        return JsonResponse({'ok': False, 'message': 'Страница не найдена.'}, status=404)

    body = load_json_body(request)

    code = (body.get('code') or '').strip()
    sample_only = body.get('sample_only', True)

    if not code:
        return JsonResponse({'ok': False, 'message': 'Код не может быть пустым.'}, status=400)
    if len(code) > MAX_CODE_LENGTH:
        return JsonResponse({'ok': False, 'message': 'Код слишком длинный.'}, status=400)

    meta = page.page_meta or {}
    # Язык задаёт автор задачи, а не тот, кто её решает
    language = (meta.get('language') or '').strip()
    if language not in LANGUAGES:
        return JsonResponse({'ok': False, 'message': f'Неподдерживаемый язык задачи: {language}'}, status=400)

    test_cases = (meta.get('test_cases') or [])[:MAX_TEST_CASES]
    time_limit = _safe_time_limit(meta.get('time_limit'))

    if sample_only:
        test_cases = [tc for tc in test_cases if tc.get('is_sample')]

    if not test_cases:
        return JsonResponse({'ok': False, 'message': 'Нет тест-кейсов для проверки'}, status=400)

    results = []
    passed = 0
    for i, tc in enumerate(test_cases):
        run_result = run_in_docker(language, code, stdin_data=tc.get('input', ''), time_limit=time_limit)
        if not run_result['ok']:
            return JsonResponse({'ok': False, 'message': run_result['error']})

        actual = run_result['stdout'].rstrip('\n')
        expected = (tc.get('expected') or '').rstrip('\n')
        is_correct = (actual == expected) and run_result['exit_code'] == 0 and not run_result['timed_out']
        if is_correct:
            passed += 1

        tc_result = {
            'index': i + 1,
            'passed': is_correct,
            'timed_out': run_result['timed_out'],
            'exit_code': run_result['exit_code'],
        }
        if tc.get('is_sample'):
            tc_result['input'] = tc.get('input', '')
            tc_result['expected'] = expected
            tc_result['actual'] = actual
            tc_result['stderr'] = run_result['stderr']

        results.append(tc_result)

    # Полный прогон — отправка решения: вердикт запоминаем на сервере,
    # чтобы при подведении итогов не верить числам от клиента
    if not sample_only:
        code_results.remember(request, page.id, passed, len(test_cases))

    return JsonResponse({'ok': True, 'passed': passed, 'total': len(test_cases), 'results': results})
