from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path('api/v1/', include('api.v1.urls')),
    path('', include('home.urls')),
    path('', include('authorization.urls')),
    path('', include('tests.constructor.urls')),
    path('', include('tests.tests_app.urls')),
    path('', include('companies.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
