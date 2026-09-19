"""Вердикты по задачам на код, вынесенные из-под контроля клиента.

Итог полной проверки сервер запоминает в сессии и при подведении итогов
берёт оттуда, а присланные клиентом числа игнорирует — иначе полный балл
можно получить, не написав ни строки.
"""
SESSION_KEY = 'code_run_results'


def remember(request, page_id, passed, total):
    """Сохраняет результат полного прогона тест-кейсов."""
    results = request.session.get(SESSION_KEY) or {}
    results[str(page_id)] = {'passed': int(passed), 'total': int(total)}
    request.session[SESSION_KEY] = results


def recall(request, page_id):
    """Возвращает (passed, total) последнего полного прогона. (0, 0) — если его не было."""
    entry = (request.session.get(SESSION_KEY) or {}).get(str(page_id))
    if not isinstance(entry, dict):
        return 0, 0
    try:
        return int(entry.get('passed', 0)), int(entry.get('total', 0))
    except (TypeError, ValueError):
        return 0, 0
