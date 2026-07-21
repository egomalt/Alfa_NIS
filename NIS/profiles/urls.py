from django.urls import path

from . import views

urlpatterns = [
    path('<slug:username>/articles/', views.user_articles_view, name='user_articles_view'),
    path('<slug:username>/', views.profile_view, name='profile_view'),
]
