"""Каталог конкурсов от демо-компаний со сроками, разложенными до конца года.

seed_contests наполняет кабинет одной компании, а каталогу нужен поток:
в любой день до даты --until должны быть и конкурсы, которые вот-вот
закроются, и те, до которых ещё далеко. Поэтому дедлайны открытых конкурсов
идут равномерно от ближайших дней до --until, а не задаются числом дней.

Повторный запуск раскладывает сроки открытых конкурсов заново от текущего дня.

    manage.py seed_contest_catalog                    # до 31 декабря (в конце года — на 60 дней)
    manage.py seed_contest_catalog --until 2027-01-31
    manage.py seed_contest_catalog --clear
"""

import random
from datetime import date, datetime, time, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from companies.models import Company
from contests.contests_cabinet.models import Contest
from core.demo import MARK, make_submissions

HINTS = {
    Contest.SUB_LINK: 'Ссылка на публичный репозиторий с README',
    Contest.SUB_FILE: 'Архив или PDF до 20 МБ',
    Contest.SUB_TEXT: 'Опишите решение текстом: подход, шаги, результат',
}

RULES = [
    'Решение принимается только до истечения дедлайна',
    'Один участник может отправить решение только один раз',
    'Работа должна быть выполнена самостоятельно',
]

# (компания, название, категория, уровень, приз, формат, описание, условие)
OPEN = [
    (
        'yandex-demo',
        'Поисковые подсказки за 50 мс',
        'Backend',
        'Senior',
        '200 000 ₽',
        Contest.SUB_LINK,
        'Сервис автодополнения запросов, который отвечает быстрее, чем пользователь допечатает слово.',
        'Сделайте HTTP-сервис подсказок по префиксу запроса на словаре из миллиона строк. '
        'Ответ — не дольше 50 мс на 95-м перцентиле. Опишите структуру данных и как вы её обновляете.',
    ),
    (
        'yandex-demo',
        'Карта загруженности для курьеров',
        'Frontend',
        'Middle',
        'Оффер на стажировку',
        Contest.SUB_LINK,
        'Интерфейс, по которому курьер за секунду понимает, где сейчас пробки.',
        'Соберите страницу с картой и слоем загруженности улиц по готовому JSON. '
        'Важно: плавная перерисовка при обновлении данных и понятная легенда на телефоне.',
    ),
    (
        'sbertech-demo',
        'Антифрод для переводов по СБП',
        'Аналитика',
        'Middle',
        '150 000 ₽',
        Contest.SUB_FILE,
        'Найдите мошеннические переводы в обезличенной выгрузке операций.',
        'По выгрузке операций за месяц постройте модель, которая отмечает подозрительные переводы. '
        'Пришлите ноутбук и короткий отчёт: признаки, метрики, где модель ошибается.',
    ),
    (
        'sbertech-demo',
        'Онбординг клиента в мобильном банке',
        'Дизайн',
        'Junior',
        'Мерч и стажировка',
        Contest.SUB_FILE,
        'Первые три экрана после установки приложения — без потери половины пользователей.',
        'Спроектируйте онбординг нового клиента: от установки до первого перевода. '
        'Пришлите макеты и объясните, какие шаги вы убрали и почему.',
    ),
    (
        'vk-demo',
        'Лента клипов без лагов',
        'Frontend',
        'Middle',
        '100 000 ₽',
        Contest.SUB_LINK,
        'Бесконечная лента коротких видео, которая не тормозит на слабом телефоне.',
        'Сделайте ленту с виртуализацией и предзагрузкой следующего ролика. '
        'Покажите замеры: память и частоту кадров на длинной прокрутке.',
    ),
    (
        'vk-demo',
        'Модерация комментариев',
        'Аналитика',
        'Middle',
        '',
        Contest.SUB_TEXT,
        'Как отличить токсичный комментарий от резкого, но допустимого.',
        'По размеченной выборке предложите правила или модель для автомодерации. '
        'Опишите, сколько живых модераторов освободится и сколько ошибок станет больше.',
    ),
    (
        'ozon-demo',
        'Прогноз спроса на складе',
        'Аналитика',
        'Senior',
        '250 000 ₽',
        Contest.SUB_FILE,
        'Сколько товара привезти на склад к распродаже, чтобы не было ни дефицита, ни залежей.',
        'По истории продаж за два года спрогнозируйте спрос на четыре недели вперёд. '
        'Оцениваем точность и то, как вы учли сезонность и акции.',
    ),
    (
        'ozon-demo',
        'API статусов заказа',
        'Backend',
        'Junior',
        'Оффер на стажировку',
        Contest.SUB_LINK,
        'Простой и надёжный сервис, который знает, где сейчас заказ.',
        'Реализуйте REST API со статусами заказа и историей переходов. '
        'Запрещённые переходы должны отклоняться, а история — не теряться при повторных запросах.',
    ),
    (
        'avito-demo',
        'Поиск дубликатов объявлений',
        'Backend',
        'Middle',
        '120 000 ₽',
        Contest.SUB_LINK,
        'Одно и то же объявление, выложенное десять раз с разными фото.',
        'Найдите дубликаты среди объявлений по тексту и картинкам. '
        'Опишите, как решение масштабируется на миллионы объявлений в день.',
    ),
    (
        'avito-demo',
        'Форма подачи объявления',
        'Дизайн',
        'Junior',
        '',
        Contest.SUB_FILE,
        'Форма, которую можно заполнить одной рукой в метро.',
        'Перепроектируйте форму подачи объявления для телефона. Пришлите макеты и путь пользователя с числом шагов до и после.',
    ),
    (
        'tbank-demo',
        'Выкатка без простоя',
        'DevOps',
        'Senior',
        '200 000 ₽',
        Contest.SUB_TEXT,
        'Обновить сервис платежей так, чтобы ни один платёж не потерялся.',
        'Опишите процесс выкатки новой версии сервиса с миграцией базы данных без остановки. '
        'Что делать, если на середине что-то пошло не так?',
    ),
    (
        'tbank-demo',
        'Калькулятор кешбэка',
        'Frontend',
        'Junior',
        'Оффер на стажировку',
        Contest.SUB_LINK,
        'Покажите клиенту, сколько он вернёт за месяц, ещё до покупки.',
        'Сделайте виджет, который по категориям трат считает кешбэк и подсказывает, '
        'какую категорию выгоднее выбрать. Важна понятность цифр, а не анимации.',
    ),
    (
        'kaspersky-demo',
        'Разбор фишинговой рассылки',
        'Аналитика',
        'Middle',
        '80 000 ₽',
        Contest.SUB_TEXT,
        'Письмо от «службы безопасности банка» — разберите, как оно устроено.',
        'По заголовкам и телу письма восстановите цепочку атаки и предложите правила фильтрации. '
        'Объясните, почему письмо прошло существующие фильтры.',
    ),
    (
        'kaspersky-demo',
        'Песочница для вложений',
        'Backend',
        'Senior',
        'Оффер в команду',
        Contest.SUB_LINK,
        'Открыть подозрительный файл так, чтобы он ничего не сломал.',
        'Спроектируйте и реализуйте сервис, который запускает вложение в изолированном окружении '
        'и собирает отчёт о его действиях. Опишите границы изоляции.',
    ),
    (
        '2gis-demo',
        'Маршруты для маломобильных',
        'Backend',
        'Middle',
        '100 000 ₽',
        Contest.SUB_LINK,
        'Пешеходный маршрут без лестниц и высоких бордюров.',
        'На графе пешеходных дорожек с атрибутами доступности постройте маршрут, '
        'который избегает препятствий. Покажите, насколько он длиннее обычного.',
    ),
    (
        '2gis-demo',
        'Карточка организации',
        'Дизайн',
        'Junior',
        '',
        Contest.SUB_FILE,
        'Часы работы, телефон и вход — то, что ищут в первую очередь.',
        'Перепроектируйте карточку организации так, чтобы главное было видно без прокрутки. '
        'Пришлите макеты для телефона и обоснование приоритетов.',
    ),
    (
        'wildberries-demo',
        'Очередь возвратов',
        'Backend',
        'Middle',
        '90 000 ₽',
        Contest.SUB_LINK,
        'Тысячи возвратов в час — и ни один не обработан дважды.',
        'Реализуйте обработчик очереди возвратов с идемпотентностью и повторными попытками. '
        'Покажите, что происходит при падении обработчика посреди операции.',
    ),
    (
        'wildberries-demo',
        'Мониторинг склада в Grafana',
        'DevOps',
        'Middle',
        'Оффер на стажировку',
        Contest.SUB_TEXT,
        'Дашборд, по которому дежурный за минуту видит, что склад встал.',
        'Предложите набор метрик и алертов для складской системы и соберите дашборд. '
        'Опишите, какие алерты будят ночью, а какие ждут утра.',
    ),
    (
        'positive-demo',
        'Сканер секретов в репозиториях',
        'DevOps',
        'Middle',
        '150 000 ₽',
        Contest.SUB_LINK,
        'Пароли и токены в коммитах — найти до того, как найдут другие.',
        'Сделайте проверку для CI, которая находит секреты в изменениях и не шумит на тестовых данных. '
        'Покажите долю ложных срабатываний на открытых репозиториях.',
    ),
    (
        'positive-demo',
        'Отчёт о пентесте',
        'Аналитика',
        'Senior',
        '',
        Contest.SUB_FILE,
        'Отчёт, который поймёт и инженер, и директор.',
        'По сырым находкам пентеста составьте отчёт: риски, приоритеты, план исправлений. '
        'Оцениваем ясность и то, насколько легко по отчёту действовать.',
    ),
    (
        'gazprom-demo',
        'Предиктивное обслуживание насосов',
        'Аналитика',
        'Senior',
        '300 000 ₽',
        Contest.SUB_FILE,
        'Предсказать поломку насоса за неделю до того, как он остановится.',
        'По телеметрии датчиков постройте модель, которая заранее предупреждает об отказе. '
        'Пришлите ноутбук и оценку: сколько простоев удалось бы избежать.',
    ),
    (
        'gazprom-demo',
        'Пульт оператора установки',
        'Frontend',
        'Middle',
        'Оффер на стажировку',
        Contest.SUB_LINK,
        'Экран, на котором оператор сразу видит отклонение от нормы.',
        'Соберите интерфейс мониторинга установки по потоку данных датчиков. '
        'Отклонения должны бросаться в глаза, а не тонуть в цифрах.',
    ),
]

# (компания, название, категория, уровень, приз, формат, статус, дней с дедлайна, описание, условие)
CLOSED = [
    (
        'yandex-demo',
        'Классификатор отзывов',
        'Аналитика',
        'Middle',
        '100 000 ₽',
        Contest.SUB_FILE,
        Contest.STATUS_FINISHED,
        20,
        'Конкурс завершён. Участники учили модель отличать жалобу от пожелания.',
        'Разметить отзывы о сервисе по типам обращений и обучить классификатор.',
    ),
    (
        'tbank-demo',
        'Чат-бот поддержки',
        'Backend',
        'Junior',
        'Оффер на стажировку',
        Contest.SUB_LINK,
        Contest.STATUS_FINISHED,
        12,
        'Конкурс завершён. Участники собирали бота, который отвечает на частые вопросы.',
        'Сделать бота, который отвечает на десять самых частых вопросов клиентов.',
    ),
    (
        'ozon-demo',
        'Уведомления о доставке',
        'Дизайн',
        'Junior',
        '',
        Contest.SUB_FILE,
        Contest.STATUS_FINISHED,
        6,
        'Конкурс завершён. Участники переделывали push-уведомления о заказе.',
        'Перепроектировать уведомления о статусе доставки так, чтобы их не отключали.',
    ),
    (
        'vk-demo',
        'Бот расписания для студентов',
        'Backend',
        'Junior',
        '50 000 ₽',
        Contest.SUB_LINK,
        Contest.STATUS_REVIEW,
        3,
        'Приём решений закрыт, компания проверяет работы.',
        'Сделать бота, который присылает расписание пар и предупреждает о переносах.',
    ),
]


class Command(BaseCommand):
    help = 'Создаёт каталог конкурсов от демо-компаний со сроками до заданной даты.'

    def add_arguments(self, parser):
        parser.add_argument('--until', help='Последний дедлайн, ГГГГ-ММ-ДД (по умолчанию 31 декабря текущего года)')
        parser.add_argument('--clear', action='store_true', help='Удалить конкурсы, созданные этой командой')

    def handle(self, *args, **options):
        if options['clear']:
            return self._clear()

        now = timezone.now()
        deadlines = spread_deadlines(now, self._until(now, options['until']), len(OPEN))
        known = set(Company.objects.filter(username__in={row[0] for row in OPEN + CLOSED}).values_list('username', flat=True))
        rng = random.Random('contest-catalog')
        created = refreshed = 0

        with transaction.atomic():
            for (company, title, category, level, prize, sub_type, excerpt, case), deadline in zip(OPEN, deadlines, strict=True):
                if company not in known:
                    continue
                existing = Contest.objects.filter(company_username=company, title=title, case_text__contains=MARK)
                if existing.exists():
                    refreshed += existing.filter(status=Contest.STATUS_ACTIVE).update(deadline=deadline)
                    continue
                contest = self._create(
                    company, title, category, level, prize, sub_type, excerpt, case, Contest.STATUS_ACTIVE, deadline, rng
                )
                opened = min(deadline - timedelta(days=rng.randint(30, 75)), now - timedelta(days=1))
                Contest.objects.filter(pk=contest.pk).update(created_at=opened)
                make_submissions(contest, finished=False)
                created += 1

            for company, title, category, level, prize, sub_type, status, ago, excerpt, case in CLOSED:
                if company not in known or Contest.objects.filter(company_username=company, title=title).exists():
                    continue
                deadline = now - timedelta(days=ago)
                contest = self._create(company, title, category, level, prize, sub_type, excerpt, case, status, deadline, rng)
                Contest.objects.filter(pk=contest.pk).update(created_at=deadline - timedelta(days=rng.randint(20, 35)))
                make_submissions(contest, finished=status == Contest.STATUS_FINISHED)
                created += 1

        missing = {row[0] for row in OPEN + CLOSED} - known
        if missing:
            self.stdout.write(
                self.style.WARNING(f'Нет компаний: {", ".join(sorted(missing))} — сначала manage.py seed_companies')
            )
        last = max(deadlines).astimezone(timezone.get_current_timezone()).date()
        self.stdout.write(
            self.style.SUCCESS(f'Конкурсов создано {created}, сроки обновлены у {refreshed}; последний дедлайн {last}.')
        )
        self.stdout.write('Каталог: /contests/   Удалить: manage.py seed_contest_catalog --clear')

    def _until(self, now, value):
        if value:
            try:
                until = date.fromisoformat(value)
            except ValueError as error:
                raise CommandError('Дата --until в формате ГГГГ-ММ-ДД, например 2026-12-31.') from error
        else:
            until = date(timezone.localdate(now).year, 12, 31)
            if until - timezone.localdate(now) < timedelta(days=14):
                until = timezone.localdate(now) + timedelta(days=60)
        end = timezone.make_aware(datetime.combine(until, time(23, 59)))
        if end - now < timedelta(days=14):
            raise CommandError(f'До {until} меньше двух недель — укажите дату позже через --until.')
        return end

    def _create(self, company, title, category, level, prize, sub_type, excerpt, case, status, deadline, rng):
        return Contest.objects.create(
            company_username=company,
            title=title,
            excerpt=excerpt,
            case_text=f'{case}\n\n{MARK}',
            rules=RULES,
            category=category,
            level=level,
            deadline=deadline,
            prize=prize,
            submission_type=sub_type,
            submission_hint=HINTS[sub_type],
            status=status,
            participants_count=rng.randint(3, 18),
        )

    def _clear(self):
        titles = [row[1] for row in OPEN + CLOSED]
        removed = Contest.objects.filter(title__in=titles, case_text__contains=MARK).delete()[0]
        self.stdout.write(self.style.SUCCESS(f'Удалено записей: {removed} (конкурсы вместе с решениями).'))


def spread_deadlines(now, until, count):
    """Дедлайны от ближайших дней до until, перемешанные между компаниями.

    Шаг ровный, поэтому в любой день до until в каталоге есть конкурс,
    который вот-вот закроется, и конкурсы, до которых ещё далеко.
    """
    first = now + timedelta(days=2)
    parts = max(count - 1, 1)
    deadlines = [(first + (until - first) * index / parts).replace(second=0, microsecond=0) for index in range(count)]
    random.Random('contest-deadlines').shuffle(deadlines)
    return deadlines
