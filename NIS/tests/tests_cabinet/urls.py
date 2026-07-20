from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/tests/', views.tests_cabinet, name='user_tests_cabinet'),
]
