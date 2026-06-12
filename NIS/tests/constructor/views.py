import json

from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_http_methods

from .models import Test, TestAnswer, TestPage


@ensure_csrf_cookie
def constructor_shell(request, test_id=None):
    from authorization.views import get_current_account
    from authorization.models import ROLE_COMPANY
    company_username = request.GET.get('company', '')
    account = get_current_account(request)
    is_company = account is not None and account.role == ROLE_COMPANY
    return render(request, 'constructor/constructor.html', {
        'app_path': request.path,
        'test_id': test_id or '',
        'company_username': company_username,
        'is_company': is_company,
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
        'company_username': test.company_username,
        'title': test.title,
        'description': test.description,
        'status': test.status,
        'level': stats.get('level', ''),
        'category': stats.get('category', ''),
        'page_count': test.pages.count(),
        'submissions': stats.get('submissions', 0),
        'created_at': test.created_at.isoformat(),
        'updated_at': test.updated_at.isoformat(),
        'url': f'/tests/{test.id}/',
        'edit_url': f'/constructor/{test.id}/',
    }
    if include_pages:
        data['pages'] = [_serialize_page(p) for p in test.pages.all()]
    return data


@require_GET
def api_tests_list(request):
    company_username = request.GET.get('company', '')
    if not company_username:
        return JsonResponse({'ok': False, 'message': 'company param required'}, status=400)
    tests = Test.objects.filter(company_username=company_username)
    return JsonResponse({'ok': True, 'tests': [_serialize_test(t) for t in tests]})


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
def api_tests_create(request):
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Invalid JSON'}, status=400)

    company_username = (body.get('company_username') or '').strip()
    title = (body.get('title') or '').strip()
    if not company_username:
        return JsonResponse({'ok': False, 'message': 'company_username required'}, status=400)
    if not title:
        return JsonResponse({'ok': False, 'message': 'title required'}, status=400)

    level = (body.get('level') or '').strip()
    category = (body.get('category') or '').strip()

    with transaction.atomic():
        test = Test.objects.create(
            company_username=company_username,
            title=title,
            description=(body.get('description') or '').strip(),
            stats={'level': level, 'category': category},
        )
        _save_pages(test, body.get('pages'))

    return JsonResponse({'ok': True, 'test': _serialize_test(test, include_pages=True)}, status=201)


@require_http_methods(['GET', 'PUT', 'DELETE'])
def api_test_detail(request, test_id):
    try:
        test = Test.objects.get(id=test_id)
    except Test.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Not found'}, status=404)

    if request.method == 'GET':
        return JsonResponse({'ok': True, 'test': _serialize_test(test, include_pages=True)})

    if request.method == 'DELETE':
        test.delete()
        return JsonResponse({'ok': True})

    # PUT — full replace
    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Invalid JSON'}, status=400)

    title = (body.get('title') or '').strip()
    if not title:
        return JsonResponse({'ok': False, 'message': 'title required'}, status=400)

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
def api_test_publish(request, test_id):
    try:
        test = Test.objects.get(id=test_id)
    except Test.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Not found'}, status=404)

    if test.pages.count() == 0:
        return JsonResponse({'ok': False, 'message': 'Нельзя опубликовать тест без страниц.'}, status=400)

    test.status = Test.STATUS_PUBLISHED
    test.save(update_fields=['status', 'updated_at'])
    return JsonResponse({'ok': True, 'test': _serialize_test(test)})


@require_http_methods(['POST'])
def api_code_run(request, page_id):
    try:
        page = TestPage.objects.get(id=page_id, type=TestPage.TYPE_CODE)
    except TestPage.DoesNotExist:
        return JsonResponse({'ok': False, 'message': 'Not found'}, status=404)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({'ok': False, 'message': 'Invalid JSON'}, status=400)

    code = (body.get('code') or '').strip()
    language = (body.get('language') or '').strip()
    sample_only = body.get('sample_only', True)

    if not code:
        return JsonResponse({'ok': False, 'message': 'Код не может быть пустым'}, status=400)

    from .executor import LANGUAGES, run_in_docker

    if language not in LANGUAGES:
        return JsonResponse({'ok': False, 'message': f'Неподдерживаемый язык: {language}'}, status=400)

    meta = page.page_meta or {}
    test_cases = meta.get('test_cases', [])
    time_limit = int(meta.get('time_limit', 5))

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

    return JsonResponse({'ok': True, 'passed': passed, 'total': len(test_cases), 'results': results})
