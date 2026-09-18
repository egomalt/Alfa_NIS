from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.clickjacking import xframe_options_sameorigin

from authorization.models import ROLE_MODERATOR
from companies.models import Company
from core.auth import page_login_required


# Без этого сайт целиком отдаётся с X-Frame-Options: DENY и предпросмотр
# в модалке админки остаётся пустым
@xframe_options_sameorigin
@page_login_required(ROLE_MODERATOR)
def verification_document(request, username):
    """Отдаёт регистрационный документ компании модератору.

    Панель ссылается сюда, а не на путь в /media/: там документ лежит под
    своим именем и открывается любым, кто это имя угадает. Здесь файл
    проходит ту же проверку роли, что и сама админка.
    """
    company = get_object_or_404(Company, username=username)
    if not company.registration_document:
        raise Http404('Документ не загружен')
    return FileResponse(
        company.registration_document.open('rb'),
        content_type='application/pdf',
        filename=company.registration_document.name.split('/')[-1],
    )
