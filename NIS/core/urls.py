from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve

urlpatterns = [
    # Служебная админка Django (не путать с /administration/ — собственной панелью модератора)
    path('django-admin/', admin.site.urls),
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
    path('', include('companies.urls')),
    path('', include('cabinet.urls')),
    path('', include('administration.dashboard.urls')),
    path('', include('exports.urls')),
    # profiles must come last — catches /<username>/
    path('', include('profiles.urls')),
]

# Загруженные файлы отдаёт сам Django: отдельного веб-сервера перед проектом
# нет. На боевом сервере эту раздачу лучше перенести на nginx и выставить
# SERVE_MEDIA=0.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
elif settings.SERVE_MEDIA:
    urlpatterns += [
        re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    ]
