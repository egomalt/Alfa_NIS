"""Вьюхи экспорта статистики в PDF (с проверкой доступа)."""
from authorization.models import ROLE_COMPANY, ROLE_MODERATOR, ROLE_USER
from companies.models import Company
from core.auth import page_login_required

from .company import build_company_pdf, company_filename
from .moderation import admin_filename, build_admin_pdf
from .pdf import pdf_response
from .user import build_user_pdf, user_filename


@page_login_required(ROLE_COMPANY)
def export_company_pdf(request):
    account = request.account
    company, _ = Company.objects.get_or_create(
        username=account.username,
        defaults={'name': account.name, 'contact_email': account.email},
    )
    return pdf_response(company_filename(company), build_company_pdf(company))


@page_login_required(ROLE_USER)
def export_user_pdf(request):
    return pdf_response(user_filename(request.account), build_user_pdf(request.account))


@page_login_required(ROLE_MODERATOR)
def export_admin_pdf(request):
    return pdf_response(admin_filename(), build_admin_pdf())
