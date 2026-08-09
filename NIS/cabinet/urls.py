from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/', views.cabinet_root, name='cabinet_root'),
    path('cabinet/company/', views.company_cabinet, name='company_cabinet'),
    path('cabinet/company/statistics/', views.company_statistics, name='company_statistics'),
    path('cabinet/company/settings/', views.company_settings, name='company_settings'),
    path('cabinet/company/tests/', views.company_tests, name='company_tests'),
    path('cabinet/user/', views.user_cabinet, {'page': 'profile'}, name='user_cabinet'),
    path('cabinet/user/tests/', views.user_cabinet, {'page': 'tests'}, name='user_tests'),
    path('cabinet/user/articles/', views.user_cabinet, {'page': 'articles'}, name='user_articles'),
    path('cabinet/user/contests/', views.user_cabinet, {'page': 'contests'}, name='user_contests'),
    path('cabinet/user/statistics/', views.user_cabinet, {'page': 'stats'}, name='user_statistics'),
    path('cabinet/user/settings/', views.user_cabinet, {'page': 'settings'}, name='user_settings'),
]
