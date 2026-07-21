from django.urls import path

from . import views

urlpatterns = [
    path('administration/', views.dashboard_shell, name='admin_dashboard'),
]
