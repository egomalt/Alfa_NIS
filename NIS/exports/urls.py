from django.urls import path

from . import views

urlpatterns = [
    path('export/company/statistics.pdf', views.export_company_pdf, name='export_company_pdf'),
    path('export/user/statistics.pdf', views.export_user_pdf, name='export_user_pdf'),
    path('export/admin/statistics.pdf', views.export_admin_pdf, name='export_admin_pdf'),
]
