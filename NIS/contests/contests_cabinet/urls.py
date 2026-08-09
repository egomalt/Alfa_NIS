from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/contests/', views.my_contests_user, name='user_contests'),
    path('cabinet/company/contests/', views.company_contests, name='company_contests'),
    path('cabinet/company/contests/new/', views.contest_constructor, name='contest_constructor_new'),
    path('cabinet/company/contests/<int:contest_id>/edit/', views.contest_constructor, name='contest_constructor_edit'),
    path('cabinet/company/contests/<int:contest_id>/submissions/', views.contest_submissions, name='contest_submissions'),
]
