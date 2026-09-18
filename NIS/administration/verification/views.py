from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.views.decorators.clickjacking import xframe_options_sameorigin

from authorization.models import ROLE_MODERATOR
from companies.models import Company
from core.auth import page_login_required


# Без этого сайт целиком отдаётся с X-Frame-Options: DENY и предпросмотр
# в модалке админки остаётся пустым
@xframe_options_sameorigin
@page_login_required()
def verification_document(request, username):
    """Отдаёт регистрационный документ компании.

    Файл лежит в приватном хранилище (core.storage), прямой ссылки на него
    нет ни у кого. Открыть его может модератор — ему по этому документу
    принимать решение — и сама компания, чтобы проверить, что загрузила.
    """
    account = request.account
    if account.role != ROLE_MODERATOR and account.username != username:
        raise Http404

    company = get_object_or_404(Company, username=username)
    if not company.registration_document:
        raise Http404('Документ не загружен')

    return FileResponse(
        company.registration_document.open('rb'),
        content_type='application/pdf',
        filename=company.registration_document.name.split('/')[-1],
    )
