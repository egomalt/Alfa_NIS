from django.urls import path

from . import views

urlpatterns = [
    path('tests/<int:test_id>/', views.test_view_shell, name='test_view_page'),
    path('api/tests/<int:test_id>/view/', views.api_test_view, name='api_test_view'),
    path('api/tests/<int:test_id>/submit/', views.api_test_submit, name='api_test_submit'),
]
