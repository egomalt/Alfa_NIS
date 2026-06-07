from django.urls import path

from . import views

urlpatterns = [
    path('constructor/', views.constructor_shell, name='constructor_page'),
    path('constructor/<int:test_id>/', views.constructor_shell, name='constructor_edit_page'),
    path('api/tests/', views.api_tests_list, name='api_tests_list'),
    path('api/tests/create/', views.api_tests_create, name='api_tests_create'),
    path('api/tests/<int:test_id>/', views.api_test_detail, name='api_test_detail'),
    path('api/tests/<int:test_id>/publish/', views.api_test_publish, name='api_test_publish'),
    path('api/tests/pages/<int:page_id>/run/', views.api_code_run, name='api_code_run'),
]
