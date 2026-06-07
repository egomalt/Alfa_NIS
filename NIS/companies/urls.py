from django.urls import path

from . import views

urlpatterns = [
    path('<slug:username>/tests/', views.app_shell, name='company_tests_page'),
    path('<slug:username>/',       views.app_shell, name='company_profile_page'),
]
