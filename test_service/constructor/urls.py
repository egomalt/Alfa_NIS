from django.urls import path

from . import views

urlpatterns = [
    path('constructor/', views.constructor_shell, name='constructor_page'),
    path('api/tests/', views.api_tests_list, name='api_tests_list'),
]
