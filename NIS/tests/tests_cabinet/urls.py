from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/tests/', views.my_tests, name='user_tests'),
]
