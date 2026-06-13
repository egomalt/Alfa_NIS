from django.urls import path

from . import views

urlpatterns = [
    path('tests/', views.tests_catalog_shell, name='tests_catalog'),
]
