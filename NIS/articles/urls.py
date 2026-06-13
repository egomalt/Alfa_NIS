from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/articles/', views.articles_cabinet, name='user_articles_cabinet'),
]
