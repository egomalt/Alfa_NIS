"""Документация API: список методов /api/v1/ с описаниями.

HTTP-методы и требуемая роль берутся из самих вьюх (декораторы
require_http_methods и api_login_required), описания — из словаря ниже.
Тест проверяет, что у каждого маршрута есть описание.
"""

from django.shortcuts import render

from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER

from . import urls

ROLE_LABELS = {ROLE_USER: 'кандидат', ROLE_COMPANY: 'компания', ROLE_MODERATOR: 'модератор'}

GROUPS = [
    ('auth/', 'Вход и регистрация'),
    ('candidates/', 'Кандидаты'),
    ('articles/', 'Статьи'),
    ('reports/', 'Жалобы'),
    ('companies/', 'Компании'),
    ('tests/', 'Тесты'),
    ('contests/', 'Конкурсы'),
    ('admin/', 'Модерация'),
]

DESCRIPTIONS = {
    'auth/signup/': 'Регистрация кандидата или компании. Сразу выполняет вход',
    'auth/signin/': 'Вход по имени пользователя и паролю',
    'auth/signout/': 'Выход из аккаунта',
    'auth/me/': 'Текущий аккаунт: имя, роль, блокировка. Без входа — account: null',
    'candidates/<slug:username>/update/': 'Изменение своего профиля: имя, контакты, о себе, навыки, ссылки',
    'candidates/<slug:username>/avatar/': 'Загрузка фото профиля (JPG, PNG, WebP, GIF до 5 МБ)',
    'candidates/<slug:username>/articles/': 'Опубликованные статьи кандидата',
    'candidates/<slug:username>/contests/': 'Участия кандидата в конкурсах для публичного профиля',
    'candidates/<slug:username>/': 'Публичный профиль кандидата. Контакты — только ему самому и подтверждённым компаниям',
    'articles/catalog/': 'Каталог опубликованных статей',
    'articles/<int:article_id>/vote/': 'Голос за статью: +1 или −1, повторный голос снимает',
    'articles/my/': 'Свои статьи, включая черновики',
    'articles/create/': 'Новый черновик статьи',
    'articles/<int:article_id>/': 'Сохранение своей статьи: заголовок, текст, теги, обложка',
    'articles/<int:article_id>/publish/': 'Публикация своей статьи',
    'articles/<int:article_id>/delete/': 'Удаление своей статьи',
    'reports/': 'Жалоба на статью, тест, конкурс или пользователя',
    'companies/': 'Каталог подтверждённых компаний',
    'companies/my-ratings/': 'Оценки, которые кандидат поставил компаниям',
    'companies/<slug:username>/': 'Публичный профиль компании',
    'companies/<slug:username>/profile/': 'Изменение своего профиля компании: описание, контакты, логотип',
    'companies/<slug:username>/verification/': 'Загрузка регистрационного документа (PDF) на проверку',
    'companies/<slug:username>/tests/': 'Тесты компании. Черновики видит только она сама',
    'companies/<slug:username>/statistics/': 'Сводная статистика своей компании',
    'companies/<slug:username>/rate/': 'Оценка компании от 1 до 5 после участия в её конкурсе',
    'companies/<slug:username>/contests/': 'Опубликованные конкурсы компании',
    'tests/': 'Свои тесты, включая черновики',
    'tests/create/': 'Новый тест',
    'tests/catalog/': 'Каталог опубликованных тестов',
    'tests/my-attempts/': 'Свои прохождения тестов, активность по дням и серия',
    'tests/<int:test_id>/': 'Свой тест целиком: чтение, сохранение (PUT), удаление',
    'tests/<int:test_id>/publish/': 'Публикация теста: проверяет, что у каждого вопроса есть верный ответ',
    'tests/<int:test_id>/statistics/': 'Как проходят свой тест: баллы, доля справившихся, сравнение с площадкой',
    'tests/pages/<int:page_id>/run/': 'Проверка решения задачи на код на всех тест-кейсах в изолированном контейнере',
    'tests/<int:test_id>/view/': 'Тест для прохождения — без правильных ответов',
    'tests/<int:test_id>/submit/': 'Отправка ответов и подсчёт результата',
    'contests/company/': 'Конкурсы своей компании со статистикой',
    'contests/': 'Новый конкурс',
    'contests/catalog/': 'Каталог опубликованных конкурсов',
    'contests/user-history/': 'Свои участия в конкурсах',
    'contests/my-submissions/<int:sub_id>/': 'Своё решение и вердикт компании',
    'contests/<int:contest_id>/': 'Конкурс: чтение всем, сохранение (PUT) и удаление — только своей компании',
    'contests/<int:contest_id>/publish/': 'Публикация конкурса: нужны название, кейс и срок в будущем',
    'contests/<int:contest_id>/attachments/': 'Загрузка стартового файла к конкурсу (до 25 МБ)',
    'contests/<int:contest_id>/attachments/<int:attachment_id>/': 'Удаление стартового файла',
    'contests/<int:contest_id>/submissions/': 'Решения участников своего конкурса',
    'contests/<int:contest_id>/submissions/<int:sub_id>/': 'Решение компании по работе: принять или отклонить',
    'contests/<int:contest_id>/submissions/<int:sub_id>/like/': 'Отметить работу как понравившуюся или снять отметку',
    'contests/<int:contest_id>/submissions/<int:sub_id>/winner/': 'Назначить работу победителем или снять',
    'contests/<int:contest_id>/statistics/': 'Воронка участия и решения по дням',
    'contests/<int:contest_id>/submit/': 'Отправка решения: файл, ссылка или текст — как задано в конкурсе',
    'contests/<int:contest_id>/my-submissions/': 'Свои решения по конкурсу',
    'admin/overview/': 'Сводка для панели модератора',
    'admin/verifications/': 'Заявки компаний на проверку',
    'admin/verifications/<slug:username>/approve/': 'Одобрить компанию',
    'admin/verifications/<slug:username>/reject/': 'Отклонить заявку с причиной',
    'admin/users/': 'Пользователи с поиском и фильтром',
    'admin/users/<slug:username>/ban/': 'Заблокировать на срок или навсегда',
    'admin/users/<slug:username>/unban/': 'Снять блокировку',
    'admin/reports/': 'Очередь жалоб',
    'admin/reports/<int:report_id>/takedown/': 'Снять материал по жалобе',
    'admin/reports/<int:report_id>/resolve/': 'Закрыть жалобу как рассмотренную',
    'admin/reports/<int:report_id>/dismiss/': 'Отклонить жалобу',
    'admin/content/article/<int:article_id>/delete/': 'Удалить статью',
    'admin/content/contest/<int:contest_id>/delete/': 'Удалить конкурс',
    'admin/content/test/<int:test_id>/delete/': 'Удалить тест',
    'admin/users/<slug:username>/content/': 'Материалы пользователя по видам',
    'admin/users/<slug:username>/purge/': 'Удалить материалы пользователя выбранных видов',
}


def _decorators(view):
    """Цепочка обёрток вьюхи — от внешней к исходной функции."""
    while view is not None:
        yield view
        view = getattr(view, '__wrapped__', None)


def _methods(view):
    """HTTP-методы из require_http_methods: список лежит в замыкании обёртки."""
    for wrapper in _decorators(view):
        for cell in wrapper.__closure__ or ():
            value = cell.cell_contents
            if isinstance(value, (list, tuple)) and value and all(isinstance(m, str) and m.isupper() for m in value):
                return list(value)
    return ['GET']


def _access(view):
    roles = getattr(view, 'login_roles', None)
    if roles is None:
        return 'все'
    if not roles:
        return 'вход'
    return ', '.join(ROLE_LABELS.get(role, role) for role in roles)


def endpoints():
    """Все методы API в порядке объявления: [(группа, [строки таблицы])]."""
    grouped = {title: [] for _, title in GROUPS}
    for pattern in urls.urlpatterns:
        route = str(pattern.pattern)
        title = next(title for prefix, title in GROUPS if route.startswith(prefix))
        grouped[title].append(
            {
                'path': f'/api/v1/{route}',
                'methods': _methods(pattern.callback),
                'access': _access(pattern.callback),
                'description': DESCRIPTIONS.get(route, ''),
            }
        )
    return [(title, rows) for title, rows in grouped.items() if rows]


def api_docs(request):
    groups = endpoints()
    return render(request, 'api/docs.html', {'groups': groups, 'total': sum(len(rows) for _, rows in groups)})
