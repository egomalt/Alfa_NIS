from django.urls import path

from . import views

urlpatterns = [
    path('tests/', views.test_view_shell, name='tests_list'),
    path('tests/<int:test_id>/', views.test_view_shell, name='test_detail'),
]
