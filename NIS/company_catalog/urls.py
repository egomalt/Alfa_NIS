from django.urls import path

from . import views

urlpatterns = [
    path('companies/', views.companies_list_shell, name='companies_list_page'),
]
