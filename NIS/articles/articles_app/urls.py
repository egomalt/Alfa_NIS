from django.urls import path
from . import views

urlpatterns = [
    path('articles/<int:article_id>/', views.article_read, name='article_read'),
]

# re-exported for api/v1/urls.py
api_article_vote = views.api_article_vote
