from django.urls import include, path

urlpatterns = [
    path('', include('constructor.urls')),
    path('', include('tests_app.urls')),
]
