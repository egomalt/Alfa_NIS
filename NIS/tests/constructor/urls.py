from django.urls import path

from . import views

urlpatterns = [
    path('constructor/',              views.constructor_shell, name='constructor_page'),
    path('constructor/<int:test_id>/', views.constructor_shell, name='constructor_edit_page'),
]
