from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/', views.cabinet_root, name='cabinet_root'),
    path('cabinet/company/', views.company_cabinet, name='company_cabinet'),
    path('cabinet/user/', views.user_cabinet, name='user_cabinet'),
]
