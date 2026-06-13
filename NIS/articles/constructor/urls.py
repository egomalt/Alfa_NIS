from django.urls import path

from . import views

urlpatterns = [
    path('cabinet/user/articles/new/', views.article_constructor, name='article_constructor_new'),
    path('cabinet/user/articles/<int:article_id>/edit/', views.article_constructor, name='article_constructor_edit'),
]
