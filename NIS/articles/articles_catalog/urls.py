from django.urls import path
from . import views

urlpatterns = [
    path('articles/', views.articles_catalog_shell, name='articles_catalog'),
]
