from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/articles/', views.my_articles, name='user_articles'),
]
