from django.urls import path

from . import views

urlpatterns = [
    path('tests/<int:test_id>/', views.test_view_shell, name='test_view_page'),
    path('cabinet/user/tests/', views.user_tests_cabinet, name='user_tests_cabinet'),
]
