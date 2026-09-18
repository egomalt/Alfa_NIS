"""Демонстрационное наполнение панели модератора.

Панель — единственный раздел, который нечем посмотреть: очередь заявок
и жалобы появляются только от живых людей, а на пустой базе все четыре
экрана показывают «ничего нет». Команда заводит очередь на проверку,
жалобы всех типов и пару заблокированных аккаунтов.

Набор нарочно неровный: заявка с документом и без, жалоба с порогом
эскалации и одиночная, бан бессрочный и до даты — чтобы каждое состояние
интерфейса было видно.

    manage.py seed_moderation
    manage.py seed_moderation --clear    # удалить созданное этой командой
"""
from datetime import timedelta
from io import BytesIO

from django.core.management.base import BaseCommand
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from administration.reports.models import ESCALATION_THRESHOLD, Report
from articles.constructor.models import Article
from authorization.models import Account, ROLE_USER, STATUS_ACTIVE, STATUS_BANNED
from companies.models import Company
from contests.contests_cabinet.models import Contest
from core.demo import DEMO_PASSWORD, MARK
from tests.constructor.models import Test
from users.models import UserProfile

# Заявители и жалобщики. Свои, а не демо-кандидаты из core.demo: этих
# команда удаляет у себя, и чистка не должна задевать участников конкурсов.
PREFIX = 'demo-mod-'

# (логин, название, индустрия, город, приложен ли документ)
APPLICANTS = [
    ('vektor', 'Вектор Разработка', 'Финтех', 'Москва', True),
    ('kod-i-kofe', 'Код и Кофе', 'Образование', 'Казань', True),
    ('sigma-lab', 'Сигма Лаб', 'Аналитика', 'Новосибирск', True),
    # Без документа: заявка есть, проверять нечего — модератор должен это видеть
    ('bez-dokumenta', 'Без Документа', '', 'Пермь', False),
]

# (кто жалуется, на что, причина)
COMPLAINERS = ['zhaloba-1', 'zhaloba-2', 'zhaloba-3', 'zhaloba-4']

REASONS = {
    'article': [
        'Статья слово в слово скопирована с чужого блога, автор не указан.',
        'В тексте реклама платного курса под видом личного опыта.',
        'Оскорбления в адрес конкретной компании в разделе про собеседования.',
    ],
    'test': ['В тесте намеренно неверные правильные ответы — люди получают нули ни за что.'],
    'contest': ['Конкурс требует прислать готовый коммерческий проект без оплаты.'],
    'user': ['Пользователь рассылает спам в комментариях к статьям.'],
    'company': ['Компания выдаёт себя за другую, использует чужой логотип и название.'],
}

# Заблокированные: бессрочно и на срок
BANNED = [
    ('narushitel-1', 'Накрутка прохождений тестов', None),
    ('narushitel-2', 'Спам в жалобах', 14),
]


def demo_document(company_name):
    """Настоящий PDF на одну страницу — его открывает предпросмотр в панели.

    Заглушки из пары байт тут мало: модалка показывает файл во фрейме,
    и битый PDF выглядит как сломанная страница, а не как демо-данные.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas as pdf_canvas

    from exports.pdf import FONT, FONT_BOLD, _ensure_fonts

    _ensure_fonts()
    buffer = BytesIO()
    page = pdf_canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    page.setFont(FONT_BOLD, 15)
    page.drawString(56, height - 90, 'Выписка из ЕГРЮЛ')
    page.setFont(FONT, 11)
    lines = [
        '',
        f'Полное наименование: ООО «{company_name}»',
        'ОГРН: 1234567890123',
        'ИНН / КПП: 7701234567 / 770101001',
        'Дата регистрации: 14.03.2021',
        'Статус: действующее юридическое лицо',
        '',
        'Документ сформирован для демонстрации панели модератора',
        'и не является юридически значимым.',
    ]
    y = height - 125
    for line in lines:
        page.drawString(56, y, line)
        y -= 20

    page.showPage()
    page.save()
    return buffer.getvalue()


class Command(BaseCommand):
    help = 'Наполняет панель модератора заявками, жалобами и блокировками.'

    def add_arguments(self, parser):
        parser.add_argument('--clear', action='store_true',
                            help='Удалить записи, созданные этой командой')

    def handle(self, *args, **options):
        if options['clear']:
            return self._clear()

        with transaction.atomic():
            applicants = self._make_applicants()
            reports = self._make_reports()
            banned = self._make_banned()

        self.stdout.write(self.style.SUCCESS(
            f'Заявок на проверку {applicants}, жалоб {reports}, блокировок {banned}.'))
        self.stdout.write(f'Панель: /administration/   Пароль демо-аккаунтов: {DEMO_PASSWORD}')
        self.stdout.write('Удалить: manage.py seed_moderation --clear')

    def _account(self, username, name, role=ROLE_USER):
        account = Account.objects.filter(username=username).first()
        if account is None:
            account = Account.objects.create_user(
                username, name=name, password=DEMO_PASSWORD, role=role)
        return account

    def _make_applicants(self):
        """Очередь верификации: компании, ждущие решения модератора."""
        created = 0
        now = timezone.now()
        for index, (slug, name, industry, city, with_document) in enumerate(APPLICANTS):
            username = PREFIX + slug
            self._account(username, name, role='company')
            if Company.objects.filter(username=username).exists():
                continue
            company = Company.objects.create(
                username=username,
                name=name,
                industry=industry,
                city=city,
                description=f'Демонстрационная заявка на верификацию. {MARK}',
                verification_status=Company.VERIF_PENDING,
                # Заявки разной давности: очередь сортируется по дате подачи
                submitted_at=now - timedelta(days=index * 2, hours=index * 5),
            )
            if with_document:
                company.registration_document.save(
                    f'{username}-egrul.pdf', ContentFile(demo_document(name)), save=True)
            created += 1
        return created

    def _make_reports(self):
        """Жалобы всех типов, включая набравшую порог эскалации."""
        for index, username in enumerate(COMPLAINERS):
            self._account(username, f'Жалобщик {index + 1}')
            UserProfile.objects.get_or_create(username=username)

        targets = self._targets()
        created = 0
        now = timezone.now()

        for target_type, reasons in REASONS.items():
            target = targets.get(target_type)
            if target is None:
                self.stdout.write(self.style.WARNING(
                    f'Нет материала типа «{target_type}» — жалобу на него пропускаю'))
                continue
            for number, reason in enumerate(reasons):
                reporter = COMPLAINERS[(created + number) % len(COMPLAINERS)]
                _, is_new = Report.objects.get_or_create(
                    reporter_username=reporter,
                    target_type=target_type,
                    target_id=target['id'],
                    defaults={
                        'target_title': target['title'],
                        'target_url': target['url'],
                        'author_username': target['author'],
                        'reason': reason,
                        'evidence': MARK,
                    },
                )
                created += int(is_new)

        # Одна статья должна собрать порог эскалации: интерфейс помечает
        # такие жалобы отдельно, и без них эту ветку не посмотреть
        article = targets.get('article')
        if article:
            for reporter in COMPLAINERS[:ESCALATION_THRESHOLD]:
                _, is_new = Report.objects.get_or_create(
                    reporter_username=reporter,
                    target_type='article',
                    target_id=article['id'],
                    defaults={
                        'target_title': article['title'],
                        'target_url': article['url'],
                        'author_username': article['author'],
                        'reason': 'Повторная жалоба: материал так и не убрали.',
                        'evidence': MARK,
                    },
                )
                created += int(is_new)
        return created

    def _targets(self):
        """На что жаловаться: берём настоящие материалы, а не выдуманные id."""
        targets = {}
        article = Article.objects.filter(status=Article.STATUS_PUBLISHED).first()
        if article:
            targets['article'] = {
                'id': str(article.id), 'title': article.title or f'Статья #{article.id}',
                'url': f'/articles/{article.id}/', 'author': article.author_username,
            }
        test = Test.objects.filter(status=Test.STATUS_PUBLISHED).first()
        if test:
            targets['test'] = {
                'id': str(test.id), 'title': test.title or f'Тест #{test.id}',
                'url': f'/tests/{test.id}/', 'author': test.owner_username,
            }
        contest = Contest.objects.filter(status=Contest.STATUS_ACTIVE).first()
        if contest:
            targets['contest'] = {
                'id': str(contest.id), 'title': contest.title or f'Конкурс #{contest.id}',
                'url': f'/contests/{contest.id}/', 'author': contest.company_username,
            }
        # На человека и компанию жалуются по логину, а не по id материала.
        # Своих демо-жалобщиков исключаем: жалоба сама на себя выглядит дико
        candidate = (Account.objects
                     .filter(role=ROLE_USER, status=STATUS_ACTIVE)
                     .exclude(username__startswith=PREFIX)
                     .exclude(username__in=COMPLAINERS)
                     .order_by('id').first())
        if candidate:
            targets['user'] = {
                'id': candidate.username, 'title': candidate.name or candidate.username,
                'url': f'/{candidate.username}/', 'author': candidate.username,
            }
        # Компания с названием: на безымянную жалоба читается как ошибка данных
        company = (Company.objects
                   .filter(verification_status=Company.VERIF_APPROVED)
                   .exclude(username__startswith=PREFIX)
                   .exclude(name='')
                   .order_by('id').first())
        if company:
            targets['company'] = {
                'id': company.username, 'title': company.name or company.username,
                'url': f'/{company.username}/', 'author': company.username,
            }
        return targets

    def _make_banned(self):
        """Заблокированные аккаунты: бессрочно и на срок."""
        created = 0
        for slug, reason, days in BANNED:
            username = PREFIX + slug
            account = self._account(username, f'Нарушитель {slug[-1]}')
            if account.status == STATUS_BANNED:
                continue
            account.status = STATUS_BANNED
            account.ban_reason = reason
            account.ban_until = timezone.now() + timedelta(days=days) if days else None
            account.save(update_fields=['status', 'ban_reason', 'ban_until'])
            created += 1
        return created

    def _clear(self):
        usernames = [PREFIX + slug for slug, *_ in APPLICANTS] \
            + [PREFIX + slug for slug, *_ in BANNED] + COMPLAINERS
        reports = Report.objects.filter(evidence=MARK).delete()[0]

        # Файлы удаляем отдельно: delete() у модели убирает строку, а документ
        # так и остаётся лежать в media/ и накапливается с каждым прогоном
        company_qs = Company.objects.filter(username__startswith=PREFIX)
        for company in company_qs:
            if company.registration_document:
                company.registration_document.delete(save=False)
        companies = company_qs.delete()[0]
        UserProfile.objects.filter(username__in=usernames).delete()
        accounts = Account.objects.filter(username__in=usernames).delete()[0]
        self.stdout.write(self.style.SUCCESS(
            f'Удалено: жалоб {reports}, компаний {companies}, аккаунтов {accounts}.'))
