"""Учёт прохождений тестов.

Попытка заводится при открытии теста и закрывается при отправке ответов.
Отсюда берутся все показатели: число прохождений, средний балл, доля
справившихся и брошенные попытки.

Порог прохождения (PASS_PERCENT) общий для всей платформы — тот же, по
которому страница прохождения показывает «Тест пройден».
"""
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from tests.constructor.models import TestAttempt

# Незавершённая попытка старше этого срока — брошенная, а не «человек ещё думает»
ABANDON_AFTER = timedelta(hours=6)

PASS_PERCENT = 60


def _identity(request):
    """Кто проходит тест: (логин, ключ сессии). Одно из двух всегда пустое."""
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        return user.username, ''
    # Тест открыт анонимам, поэтому заводим ключ сессии — иначе две попытки
    # разных людей сольются в одну
    if not request.session.session_key:
        request.session.create()
    return '', request.session.session_key or ''


def start(request, test):
    """Открытие теста.

    Перезагрузка страницы не должна плодить попытки, поэтому недавняя
    незакрытая попытка того же человека переиспользуется.
    """
    username, session_key = _identity(request)
    recent = TestAttempt.objects.filter(
        test=test,
        candidate_username=username,
        session_key=session_key,
        finished_at__isnull=True,
        started_at__gte=timezone.now() - ABANDON_AFTER,
    ).first()
    if recent is not None:
        return recent
    return TestAttempt.objects.create(
        test=test, candidate_username=username, session_key=session_key)


def finish(request, test, score, max_score):
    """Отправка ответов: закрываем открытую попытку либо заводим сразу закрытую."""
    username, session_key = _identity(request)
    attempt = TestAttempt.objects.filter(
        test=test,
        candidate_username=username,
        session_key=session_key,
        finished_at__isnull=True,
    ).order_by('-started_at').first()
    if attempt is None:
        # Страницу могли открыть до появления учёта или в другой сессии
        attempt = TestAttempt(test=test, candidate_username=username, session_key=session_key)

    attempt.finished_at = timezone.now()
    attempt.score = score
    attempt.max_score = max_score
    attempt.save()
    return attempt


def finished_count():
    """Аннотация «сколько раз тест прошли до конца».

    Возвращает новое выражение на каждый вызов: одно и то же нельзя
    переиспользовать между запросами.

        Test.objects.annotate(finished_attempts=attempts.finished_count())
    """
    return Count('attempts', filter=Q(attempts__finished_at__isnull=False), distinct=True)


def count_for(test):
    """Число прохождений одного теста.

    Берёт значение из аннотации finished_attempts, если запрос её поставил,
    иначе считает отдельным запросом — чтобы сериализатор работал и для
    одиночного объекта, и внутри списка без N+1.
    """
    annotated = getattr(test, 'finished_attempts', None)
    if annotated is not None:
        return annotated
    return test.attempts.filter(finished_at__isnull=False).count()


def abandoned_filter():
    """Условие «попытку бросили»: не закрыта и давно начата."""
    return Q(finished_at__isnull=True, started_at__lt=timezone.now() - ABANDON_AFTER)
