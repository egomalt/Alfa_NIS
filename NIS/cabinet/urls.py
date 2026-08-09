from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/', views.cabinet_root, name='cabinet_root'),
    # Профиль/Статистика/Настройки компании — агрегатные разделы, остаются в cabinet.
    # Тесты → companies, Конкурсы → contests.contests_cabinet (свои приложения).
    path('cabinet/company/', views.company_cabinet, name='company_cabinet'),
    path('cabinet/company/statistics/', views.company_statistics, name='company_statistics'),
    path('cabinet/company/settings/', views.company_settings, name='company_settings'),
    # Профиль/Статистика/Настройки кандидата — агрегатные разделы, остаются в cabinet.
    # «Мои тесты» / «Мои статьи» / «Конкурсы» живут в своих доменных приложениях
    # (tests.tests_cabinet, articles.articles_cabinet, contests.contests_cabinet).
    path('cabinet/user/', views.user_cabinet, {'page': 'profile'}, name='user_cabinet'),
    path('cabinet/user/statistics/', views.user_cabinet, {'page': 'stats'}, name='user_statistics'),
    path('cabinet/user/settings/', views.user_cabinet, {'page': 'settings'}, name='user_settings'),
]
