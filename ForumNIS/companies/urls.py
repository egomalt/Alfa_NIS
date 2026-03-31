from django.urls import path

from . import views

urlpatterns = [
    path("<slug:username>/verification/", views.app_shell, name="company_verification_page"),
    path("<slug:username>/", views.app_shell, name="company_profile_page"),
    path("<slug:username>/tests/", views.app_shell, name="company_tests_page"),
    path("api/companies/<slug:username>/", views.api_company_detail, name="api_company_detail"),
    path("api/companies/<slug:username>/profile/", views.api_company_profile, name="api_company_profile"),
    path(
        "api/companies/<slug:username>/verification/",
        views.api_company_verification,
        name="api_company_verification",
    ),
    path("api/companies/<slug:username>/tests/", views.api_company_tests, name="api_company_tests"),
]
