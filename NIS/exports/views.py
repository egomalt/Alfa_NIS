"""Вьюхи экспорта статистики в PDF (с проверкой доступа)."""
from django.http import Http404

from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from authorization.views import get_current_account
from companies.models import Company

from .admin import admin_filename, build_admin_pdf
from .company import build_company_pdf, company_filename
from .pdf import pdf_response
from .user import build_user_pdf, user_filename


def export_company_pdf(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_COMPANY:
        raise Http404
    company, _ = Company.objects.get_or_create(
        username=account.username,
        defaults={'name': account.name, 'contact_email': account.email},
    )
    return pdf_response(company_filename(company), build_company_pdf(company))


def export_user_pdf(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_USER:
        raise Http404
    return pdf_response(user_filename(account), build_user_pdf(account))


def export_admin_pdf(request):
    account = get_current_account(request)
    if account is None or account.role != ROLE_MODERATOR:
        raise Http404
    return pdf_response(admin_filename(), build_admin_pdf())
