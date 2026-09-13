"""Вердикты по задачам на код, вынесенные из-под контроля клиента.

Раньше страница сама присылала в /submit/ числа «пройдено / всего», поэтому полный балл
за задачу на код можно было получить, не написав ни строки: достаточно было отправить
{"answers": {"12": {"passed": 5, "total": 5}}}.

Теперь итог полной проверки (/tests/pages/<id>/run/ без sample_only) сервер запоминает
в сессии и при подведении итогов берёт оттуда, а присланное клиентом игнорирует.
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
