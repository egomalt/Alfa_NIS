"""Сдвигает даты демонстрационных данных к сегодняшнему дню.

Сиды отсчитывают всё от момента запуска: серия активности кандидата
заканчивается «сегодня», конкурсы закрываются через N дней, баны истекают.
Через месяц картина устаревает — серия обрывается, конкурсы закрыты,
графики за последние недели пустеют. Команда переносит все даты демо-записей
на то время, что прошло с последней демо-активности, и данные снова выглядят
так, будто их создали только что. Записи, заведённые руками, не трогаются.
Сроки каталога конкурсов после сдвига раскладываются заново до конца года.

    manage.py refresh_demo
"""

from datetime import timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import DateTimeField, ExpressionWrapper, F, Max, Q, Value
from django.db.models.functions import Least
from django.utils import timezone

from administration.reports.models import Report
from articles.constructor.models import Article
from authorization.models import Account
from companies.models import Company
from contests.contests_cabinet.models import Contest, ContestSubmission
from core.demo import MARK, TAKER_PREFIX
from tests.constructor.models import Test, TestAttempt

AUTHOR_PREFIX = 'demo-author-'
MODERATION_PREFIX = 'demo-mod-'
DEMO_COMPANY_SUFFIX = '-demo'


def demo_attempts():
    return TestAttempt.objects.filter(Q(session_key=MARK) | Q(candidate_username__startswith=TAKER_PREFIX))


def shift(queryset, delta, past=(), future=()):
    """Сдвигает даты на delta. Прошедшие события не уезжают дальше «сейчас»."""
    now = Value(timezone.now(), output_field=DateTimeField())
    rows = queryset.model.objects.filter(pk__in=list(queryset.values_list('pk', flat=True)))
    for field in (*past, *future):
        moved = ExpressionWrapper(F(field) + delta, output_field=DateTimeField())
        rows.filter(**{f'{field}__isnull': False}).update(**{field: Least(moved, now) if field in past else moved})
    return rows.count()


class Command(BaseCommand):
    help = 'Переносит даты демонстрационных данных на сегодня: сроки, серии, графики, баны.'

    def handle(self, *args, **options):
        latest = (
            TestAttempt.objects.filter(session_key=MARK).aggregate(latest=Max('started_at'))['latest']
            or demo_attempts().aggregate(latest=Max('started_at'))['latest']
        )
        if latest is None:
            self.stdout.write(self.style.WARNING('Демо-данных нет — сначала manage.py seed_all'))
            return

        days = (timezone.localdate() - timezone.localdate(latest)).days
        if days < 1:
            self.stdout.write(self.style.SUCCESS('Демо-данные и так свежие, сдвигать нечего.'))
            return
        delta = timedelta(days=days)

        contests = Contest.objects.filter(case_text__contains=MARK)
        with transaction.atomic():
            counts = {
                'прохождений': shift(demo_attempts(), delta, past=('started_at', 'finished_at')),
                'конкурсов': shift(contests, delta, past=('created_at',), future=('deadline',)),
                'решений': shift(
                    ContestSubmission.objects.filter(
                        Q(contest__in=contests) | Q(text__contains=MARK) | Q(candidate_username__startswith=TAKER_PREFIX)
                    ),
                    delta,
                    past=('created_at',),
                ),
                'статей': shift(
                    Article.objects.filter(Q(author_username__startswith=AUTHOR_PREFIX) | Q(content__contains=MARK)),
                    delta,
                    past=('created_at', 'published_at'),
                ),
                'тестов': shift(
                    Test.objects.filter(Q(description__contains=MARK) | Q(owner_username__endswith=DEMO_COMPANY_SUFFIX)),
                    delta,
                    past=('created_at',),
                ),
                'заявок': shift(
                    Company.objects.filter(username__startswith=MODERATION_PREFIX, submitted_at__isnull=False),
                    delta,
                    past=('submitted_at',),
                ),
                'банов': shift(
                    Account.objects.filter(username__startswith=MODERATION_PREFIX, ban_until__isnull=False),
                    delta,
                    future=('ban_until',),
                ),
                'жалоб': shift(Report.objects.filter(evidence=MARK), delta, past=('created_at',)),
            }

        summary = ', '.join(f'{label} {count}' for label, count in counts.items())
        self.stdout.write(self.style.SUCCESS(f'Даты сдвинуты на {days} дн.: {summary}.'))

        try:
            call_command('seed_contest_catalog', stdout=self.stdout, stderr=self.stderr)
        except CommandError as error:
            self.stdout.write(self.style.WARNING(f'Каталог конкурсов не обновлён: {error}'))
