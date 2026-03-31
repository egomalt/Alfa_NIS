from django.urls import path

from . import views

urlpatterns = [
    path("authorization/signup/", views.accounts_shell, name="register_page"),
    path("authorization/signin/", views.accounts_shell, name="login_page"),
    path("api/companies/", views.api_register_company, name="api_register_company"),
    path("api/login/", views.api_login_company, name="api_login_company"),
]
