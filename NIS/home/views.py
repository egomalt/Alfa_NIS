from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from authorization.views import get_current_account

ACCESS_LABELS = {
    'all': 'Открыто всем',
    'user': 'Кандидат',
    'company': 'Компания',
    'verified': 'Подтверждённая компания',
}

# Разделы сайта для карты на странице помощи: название, описание, имя маршрута, кому доступно.
# Маршрут None — адрес-шаблон без ссылки
SITE_MAP = [
    {
        'title': 'Открытые разделы',
        'sub': 'Смотреть можно без регистрации',
        'items': [
            ('Главная', 'Поиск по тестам, популярные компании и свежие задания.', 'home_page', 'all'),
            ('Компании', 'Каталог подтверждённых работодателей с поиском и фильтром по отрасли.', 'companies_list_page', 'all'),
            ('Статьи', 'Опыт собеседований и подготовки: поиск, фильтр по тематике, рейтинг.', 'articles_catalog', 'all'),
            ('Тесты', 'Тренировочные задания с вопросами и задачами на код.', 'tests_catalog', 'all'),
            ('Конкурсы', 'Кейсы от компаний с призами и сроком приёма работ.', 'contests_catalog', 'all'),
            ('Профиль участника', 'Публичная страница кандидата или компании.', None, 'all'),
        ],
    },
    {
        'title': 'Кабинет кандидата',
        'sub': 'Доступен после входа с ролью «Кандидат»',
        'items': [
            ('Профиль', 'Сводка по вашей активности и ближайшие действия.', 'user_cabinet', 'user'),
            ('Тесты', 'Созданные вами тесты и их статистика прохождений.', 'user_tests', 'user'),
            ('Статьи', 'Черновики и опубликованные статьи.', 'user_articles', 'user'),
            ('Конкурсы', 'Отправленные решения и вердикты компаний.', 'user_contests', 'user'),
            ('Статистика', 'Результаты тестов, карта активности, серия и выгрузка в PDF.', 'user_statistics', 'user'),
            ('Настройки', 'Фото, описание, навыки, контакты и ссылки на внешние ресурсы.', 'user_settings', 'user'),
        ],
    },
    {
        'title': 'Кабинет компании',
        'sub': 'Доступен после входа с ролью «Компания»',
        'items': [
            ('Профиль', 'Загрузка документа для проверки, её статус и сводка по компании.', 'company_cabinet', 'company'),
            ('Тесты', 'Тесты компании: создание, публикация, статистика.', 'company_tests', 'verified'),
            ('Конкурсы', 'Конкурсы компании и присланные на них решения.', 'company_contests', 'verified'),
            ('Статистика', 'Сводка по тестам, конкурсам и оценкам, выгрузка в PDF.', 'company_statistics', 'company'),
            ('Настройки', 'Описание, логотип, контакты и направления работы.', 'company_settings', 'company'),
        ],
    },
]

ROLE_HINTS = {
    ROLE_USER: (
        'Вы вошли как кандидат',
        'Начните с каталога тестов — прохождения попадут в вашу статистику и серию.',
        'tests_catalog',
        'Открыть тесты',
    ),
    ROLE_COMPANY: (
        'Вы вошли как компания',
        'Если документы ещё не проверены, приложите их на странице профиля — после одобрения откроются тесты и конкурсы.',
        'company_cabinet',
        'Открыть профиль',
    ),
    ROLE_MODERATOR: (
        'Вы вошли как модератор',
        'Очередь заявок и жалоб — в панели модерации.',
        'admin_dashboard',
        'Открыть панель',
    ),
}


@ensure_csrf_cookie
def home_page(request):
    return render(request, 'home/index.html')


def help_page(request):
    account = get_current_account(request)
    hint = ROLE_HINTS.get(account.role) if account else None
    site_map = [
        {
            **group,
            'items': [
                {'title': t, 'text': x, 'url': reverse(u) if u else None, 'access': a, 'access_label': ACCESS_LABELS[a]}
                for t, x, u, a in group['items']
            ],
        }
        for group in SITE_MAP
    ]
    return render(
        request,
        'home/help.html',
        {
            'site_map': site_map,
            'hint': hint and (*hint[:2], reverse(hint[2]), hint[3]),
        },
    )
