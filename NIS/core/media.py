import posixpath

from django.conf import settings
from django.http import Http404
from django.views.static import serve


def public_media(request, path):
    path = posixpath.normpath(path).lstrip('/')
    if path.split('/')[0] == 'contest_submissions':
        raise Http404
    return serve(request, path, document_root=settings.MEDIA_ROOT)
