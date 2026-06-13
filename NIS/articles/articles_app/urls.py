from django.urls import path
from . import views

urlpatterns = [
    path('articles/<int:article_id>/', views.article_read, name='article_read'),
]
