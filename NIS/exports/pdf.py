"""Общий построитель PDF-отчётов на ReportLab (брендинг Career, кириллица)."""
import io
import os

from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

# ── Шрифты с кириллицей ──────────────────────────────────────────────────
FONT = 'DejaVu'
FONT_BOLD = 'DejaVu-Bold'
_FONTS_DIR = os.path.join(os.path.dirname(__file__), 'fonts')
_fonts_ready = False


def _ensure_fonts():
    global _fonts_ready
    if _fonts_ready:
        return
    pdfmetrics.registerFont(TTFont(FONT, os.path.join(_FONTS_DIR, 'DejaVuSans.ttf')))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, os.path.join(_FONTS_DIR, 'DejaVuSans-Bold.ttf')))
    pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT_BOLD, italic=FONT, boldItalic=FONT_BOLD)
    _fonts_ready = True


# ── Палитра (из career.css) ──────────────────────────────────────────────
BRAND = colors.HexColor('#D62839')
TEXT = colors.HexColor('#161A22')
TEXT_2 = colors.HexColor('#3C434F')
MUTED = colors.HexColor('#6E7787')
FAINT = colors.HexColor('#99A2B2')
LINE = colors.HexColor('#E2E7F0')
LINE_2 = colors.HexColor('#D2D9E6')
SURFACE_2 = colors.HexColor('#EDF0F6')
WHITE = colors.white

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _styles():
    return {
        'section': ParagraphStyle('section', fontName=FONT_BOLD, fontSize=13, textColor=TEXT,
                                  spaceBefore=6, spaceAfter=8, leading=16),
        'note': ParagraphStyle('note', fontName=FONT, fontSize=9.5, textColor=MUTED, leading=14),
        'kpi_value': ParagraphStyle('kpi_value', fontName=FONT_BOLD, fontSize=17, textColor=TEXT, leading=20),
        'kpi_label': ParagraphStyle('kpi_label', fontName=FONT, fontSize=8, textColor=MUTED, leading=11, spaceBefore=2),
        'cell': ParagraphStyle('cell', fontName=FONT, fontSize=8.5, textColor=TEXT_2, leading=11),
        'cell_head': ParagraphStyle('cell_head', fontName=FONT_BOLD, fontSize=8, textColor=FAINT, leading=10),
    }


class ReportBuilder:
    """Собирает PDF-отчёт из блоков: KPI, секции, таблицы, заметки."""

    def __init__(self, title, subtitle=''):
        _ensure_fonts()
        self.title = title
        self.subtitle = subtitle
        self.generated = timezone.localtime(timezone.now())
        self.styles = _styles()
        self.story = []

    # — блоки —
    def spacer(self, h=6):
        self.story.append(Spacer(1, h))

    def section(self, text):
        self.story.append(Paragraph(text, self.styles['section']))

    def note(self, text):
        self.story.append(Paragraph(text, self.styles['note']))
        self.spacer(4)

    def kpi(self, items):
        """items: список (value, label). Разбиваем по 4 плашки в ряд."""
        per_row = 4
        vs, ls = self.styles['kpi_value'], self.styles['kpi_label']
        for i in range(0, len(items), per_row):
            chunk = items[i:i + per_row]
            row = [[Paragraph(str(v), vs), Paragraph(str(l), ls)] for v, l in chunk]
            # добиваем пустыми ячейками до per_row, чтобы ширина колонок была ровной
            while len(row) < per_row:
                row.append('')
            col_w = CONTENT_W / per_row
            t = Table([row], colWidths=[col_w] * per_row)
            style = [
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('TOPPADDING', (0, 0), (-1, -1), 10),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
                ('LEFTPADDING', (0, 0), (-1, -1), 12),
                ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ]
            for c in range(len(chunk)):
                style.append(('BACKGROUND', (c, 0), (c, 0), SURFACE_2))
                style.append(('BOX', (c, 0), (c, 0), 0.5, LINE))
            t.setStyle(TableStyle(style))
            self.story.append(t)
            self.spacer(8)

    def table(self, headers, rows, col_ratios=None):
        """headers: список заголовков; rows: список списков строк-значений."""
        head_style, cell_style = self.styles['cell_head'], self.styles['cell']
        data = [[Paragraph(str(h).upper(), head_style) for h in headers]]
        for r in rows:
            data.append([Paragraph('' if v is None else str(v), cell_style) for v in r])

        if col_ratios:
            total = sum(col_ratios)
            widths = [CONTENT_W * (x / total) for x in col_ratios]
        else:
            widths = [CONTENT_W / len(headers)] * len(headers)

        t = Table(data, colWidths=widths, repeatRows=1)
        style = [
            ('BACKGROUND', (0, 0), (-1, 0), SURFACE_2),
            ('LINEBELOW', (0, 0), (-1, 0), 0.6, LINE_2),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]
        for i in range(1, len(data)):
            if i % 2 == 0:
                style.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#FAFBFD')))
        t.setStyle(TableStyle(style))
        self.story.append(t)
        self.spacer(10)

    def empty_note(self, text):
        self.note(text)

    # — сборка —
    def _draw_frame(self, canvas, doc):
        canvas.saveState()
        # Шапка: красная иконка-логотип + Career + название отчёта
        top = PAGE_H - MARGIN
        x = MARGIN
        canvas.setFillColor(BRAND)
        canvas.roundRect(x, top - 4, 16, 16, 3, stroke=0, fill=1)
        # три «столбика» внутри
        canvas.setFillColor(WHITE)
        canvas.rect(x + 3.5, top - 1.5, 2.2, 5, stroke=0, fill=1)
        canvas.rect(x + 6.9, top + 0.3, 2.2, 7, stroke=0, fill=1)
        canvas.rect(x + 10.3, top + 2.1, 2.2, 9, stroke=0, fill=1)
        canvas.setFillColor(TEXT)
        canvas.setFont(FONT_BOLD, 12)
        canvas.drawString(x + 22, top, 'Career')
        canvas.setFillColor(MUTED)
        canvas.setFont(FONT, 10)
        canvas.drawRightString(PAGE_W - MARGIN, top, self.title)
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.6)
        canvas.line(MARGIN, top - 10, PAGE_W - MARGIN, top - 10)

        # Футер: линия + дата генерации + номер страницы
        fy = MARGIN - 4
        canvas.setStrokeColor(LINE)
        canvas.line(MARGIN, fy + 10, PAGE_W - MARGIN, fy + 10)
        canvas.setFillColor(FAINT)
        canvas.setFont(FONT, 8)
        canvas.drawString(MARGIN, fy, 'Career · сгенерировано ' + self.generated.strftime('%d.%m.%Y %H:%M'))
        canvas.drawRightString(PAGE_W - MARGIN, fy, 'стр. %d' % doc.page)
        canvas.restoreState()

    def build(self):
        buf = io.BytesIO()
        # верхний отступ под шапку, нижний — под футер
        frame = Frame(MARGIN, MARGIN + 6, CONTENT_W, PAGE_H - 2 * MARGIN - 20, id='body')
        doc = BaseDocTemplate(buf, pagesize=A4,
                              leftMargin=MARGIN, rightMargin=MARGIN,
                              topMargin=MARGIN, bottomMargin=MARGIN,
                              title=self.title)
        doc.addPageTemplates([PageTemplate(id='main', frames=[frame], onPage=self._draw_frame)])

        # Титульный блок отчёта
        title_style = ParagraphStyle('rt', fontName=FONT_BOLD, fontSize=20, textColor=TEXT, leading=24, spaceAfter=2)
        sub_style = ParagraphStyle('rs', fontName=FONT, fontSize=10.5, textColor=MUTED, leading=14, spaceAfter=14)
        head = [Paragraph(self.title, title_style)]
        if self.subtitle:
            head.append(Paragraph(self.subtitle, sub_style))
        else:
            head.append(Spacer(1, 10))
        self.story = head + self.story

        doc.build(self.story)
        return buf.getvalue()


def pdf_response(filename, data):
    """Готовый HttpResponse со скачиванием PDF."""
    from django.http import HttpResponse
    resp = HttpResponse(data, content_type='application/pdf')
    resp['Content-Disposition'] = 'attachment; filename="%s"' % filename
    return resp
