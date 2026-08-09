from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/company/tests/', views.company_tests_page, name='company_tests'),
]
