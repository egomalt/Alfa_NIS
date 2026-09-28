from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie

from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from authorization.views import get_current_account

ACCESS_LABELS = {
    'all': 'Открыто всем',
    'user': 'Кандидат',
    'company': 'Компания',
    'verified': 'Подтверждённая компания',
}

# Разделы сайта для карты на странице помощи. url=None — адрес-шаблон без ссылки
SITE_MAP = [
    {
        'title': 'Открытые разделы',
        'sub': 'Смотреть можно без регистрации',
        'items': [
            ('Главная', 'Поиск по тестам, популярные компании и свежие задания.', '/', 'all'),
            ('Компании', 'Каталог подтверждённых работодателей с поиском и фильтром по отрасли.', '/companies/', 'all'),
            ('Статьи', 'Опыт собеседований и подготовки: поиск, фильтр по тематике, рейтинг.', '/articles/', 'all'),
            ('Тесты', 'Тренировочные задания с вопросами и задачами на код.', '/tests/', 'all'),
            ('Конкурсы', 'Кейсы от компаний с призами и сроком приёма работ.', '/contests/', 'all'),
            ('Профиль участника', 'Публичная страница кандидата или компании.', None, 'all'),
        ],
    },
    {
        'title': 'Кабинет кандидата',
        'sub': 'Доступен после входа с ролью «Кандидат»',
        'items': [
            ('Профиль', 'Сводка по вашей активности и ближайшие действия.', '/cabinet/user/', 'user'),
            ('Тесты', 'Созданные вами тесты и их статистика прохождений.', '/cabinet/user/tests/', 'user'),
            ('Статьи', 'Черновики и опубликованные статьи.', '/cabinet/user/articles/', 'user'),
            ('Конкурсы', 'Отправленные решения и вердикты компаний.', '/cabinet/user/contests/', 'user'),
            ('Статистика', 'Результаты тестов, карта активности, серия и выгрузка в PDF.', '/cabinet/user/statistics/', 'user'),
            ('Настройки', 'Фото, описание, навыки, контакты и ссылки на внешние ресурсы.', '/cabinet/user/settings/', 'user'),
        ],
    },
    {
        'title': 'Кабинет компании',
        'sub': 'Доступен после входа с ролью «Компания»',
        'items': [
            ('Профиль', 'Загрузка документа для проверки, её статус и сводка по компании.', '/cabinet/company/', 'company'),
            ('Тесты', 'Тесты компании: создание, публикация, статистика.', '/cabinet/company/tests/', 'verified'),
            ('Конкурсы', 'Конкурсы компании и присланные на них решения.', '/cabinet/company/contests/', 'verified'),
            ('Статистика', 'Сводка по тестам, конкурсам и оценкам, выгрузка в PDF.', '/cabinet/company/statistics/', 'company'),
            ('Настройки', 'Описание, логотип, контакты и направления работы.', '/cabinet/company/settings/', 'company'),
        ],
    },
]

ROLE_HINTS = {
    ROLE_USER: ('Вы вошли как кандидат', 'Начните с каталога тестов — прохождения попадут в вашу статистику и серию.',
                '/tests/', 'Открыть тесты'),
    ROLE_COMPANY: ('Вы вошли как компания', 'Если документы ещё не проверены, приложите их на странице профиля — '
                   'после одобрения откроются тесты и конкурсы.', '/cabinet/company/', 'Открыть профиль'),
    ROLE_MODERATOR: ('Вы вошли как модератор', 'Очередь заявок и жалоб — в панели модерации.',
                     '/administration/', 'Открыть панель'),
}


@ensure_csrf_cookie
def home_page(request):
    return render(request, 'home/index.html')


def help_page(request):
    account = get_current_account(request)
    site_map = [
        {**group, 'items': [
            {'title': t, 'text': x, 'url': u, 'access': a, 'access_label': ACCESS_LABELS[a]}
            for t, x, u, a in group['items']
        ]}
        for group in SITE_MAP
    ]
    return render(request, 'home/help.html', {
        'site_map': site_map,
        'hint': ROLE_HINTS.get(account.role) if account else None,
    })
