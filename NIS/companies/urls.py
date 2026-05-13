from django.urls import path

from . import views

urlpatterns = [
    path('api/companies/<slug:username>/', views.api_company_detail),
    path('api/companies/<slug:username>/profile/', views.api_company_profile),
    path('api/companies/<slug:username>/verification/', views.api_company_verification),
    path('api/companies/<slug:username>/tests/', views.api_company_tests),
    path('<slug:username>/tests/', views.app_shell, name='company_tests_page'),
    path('<slug:username>/', views.app_shell, name='company_profile_page'),
]
