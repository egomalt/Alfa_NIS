from django.urls import path

from . import views

urlpatterns = [
    path('contests/', views.contests_catalog, name='contests_catalog'),
    path('contests/<int:contest_id>/', views.contest_view, name='contest_view'),
]
