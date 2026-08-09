from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

urlpatterns = [
    path('api/v1/', include('api.v1.urls')),
    path('', include('home.urls')),
    path('', include('authorization.urls')),
    path('', include('tests.constructor.urls')),
    path('', include('tests.tests_app.urls')),
    path('', include('tests.tests_cabinet.urls')),
    path('', include('tests.tests_catalog.urls')),
    path('', include('articles.constructor.urls')),
    path('', include('articles.articles_app.urls')),
    path('', include('articles.articles_cabinet.urls')),
    path('', include('articles.articles_catalog.urls')),
    path('', include('contests.contests_cabinet.urls')),
    path('', include('contests.contests_app.urls')),
    path('', include('company_catalog.urls')),
    path('', include('cabinet.urls')),
    path('', include('administration.dashboard.urls')),
    path('', include('exports.urls')),
    # profiles must come last — catches /<username>/
    path('', include('profiles.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
