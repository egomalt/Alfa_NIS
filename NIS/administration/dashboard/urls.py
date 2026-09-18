from django.urls import path

from administration.verification import views as verification_views
from . import views

urlpatterns = [
    path('administration/', views.dashboard_shell, name='admin_dashboard'),
    path(
        'administration/verification/<slug:username>/document/',
        verification_views.verification_document,
        name='admin_verification_document',
    ),
]
