from django.urls import path

from . import views

urlpatterns = [
    path('authorization/signup/', views.accounts_shell, name='register_page'),
    path('authorization/signin/', views.accounts_shell, name='login_page'),
]
