"""Общий построитель PDF-отчётов на ReportLab (брендинг Career, кириллица)."""
import io
import os

from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from django.http import HttpResponse
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, KeepTogether, PageTemplate, Paragraph, Spacer,
    Table, TableStyle,
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
# Второй цвет графиков. На странице кабинета тем же янтарным нарисованы
# прохождения тестов рядом с решениями конкурсов
AMBER = colors.HexColor('#B7770C')
GREEN = colors.HexColor('#15935A')

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _styles():
    return {
        # keepWithNext: заголовок раздела не должен оставаться один внизу страницы
        'section': ParagraphStyle('section', fontName=FONT_BOLD, fontSize=13, textColor=TEXT,
                                  spaceBefore=6, spaceAfter=8, leading=16, keepWithNext=1),
        'note': ParagraphStyle('note', fontName=FONT, fontSize=9.5, textColor=MUTED, leading=14),
        'kpi_value': ParagraphStyle('kpi_value', fontName=FONT_BOLD, fontSize=17, textColor=TEXT, leading=20),
        'kpi_label': ParagraphStyle('kpi_label', fontName=FONT, fontSize=8, textColor=MUTED, leading=11, spaceBefore=2),
        'cell': ParagraphStyle('cell', fontName=FONT, fontSize=8.5, textColor=TEXT_2, leading=11),
        'cell_head': ParagraphStyle('cell_head', fontName=FONT_BOLD, fontSize=8, textColor=FAINT, leading=10),
    }


CELL_PADDING = 16


def fit_column_widths(headers, widths):
    """Раздвигает узкие колонки, чтобы заголовок не рвался посреди слова.

    Заголовки печатаются капсом, и «УЧАСТНИКИ» в колонке под число из одной
    цифры переносилось как «УЧАСТН ИКИ». Недостающие пункты забираем у колонок,
    где запас есть, — пропорционально запасу.
    """
    minimums = [
        max((pdfmetrics.stringWidth(word, FONT_BOLD, 8)
             for word in str(h).upper().split()), default=0) + CELL_PADDING
        for h in headers
    ]
    deficit = sum(max(m - w, 0) for m, w in zip(minimums, widths))
    if not deficit:
        return widths

    slack = [max(w - m, 0) for w, m in zip(widths, minimums)]
    total_slack = sum(slack)
    if total_slack < deficit:
        # Ужимать некуда: в такой таблице колонок больше, чем помещается
        return widths
    return [
        max(w, m) - (s / total_slack * deficit if s else 0)
        for w, m, s in zip(widths, minimums, slack)
    ]


def plural(number, forms):
    """Русское склонение: plural(2, ('отзыв', 'отзыва', 'отзывов')) → 'отзыва'."""
    number = abs(int(number))
    if number % 10 == 1 and number % 100 != 11:
        return forms[0]
    if 2 <= number % 10 <= 4 and not 12 <= number % 100 <= 14:
        return forms[1]
    return forms[2]


# ── Графики ──────────────────────────────────────────────────────────────
# Рисуем на канве вручную, а не через reportlab.graphics: нужны ровно две
# формы, а Drawing тянет свою систему координат, свою легенду и свои оси.
# У Flowable координаты идут от левого нижнего угла отведённой области.


class ColumnChart(Flowable):
    """Столбики с общей шкалой. series: [(название, цвет, [значения])]."""

    LEGEND_H = 12
    PEAK_H = 9
    LABEL_H = 11

    def __init__(self, labels, series, width=CONTENT_W, height=46 * mm):
        Flowable.__init__(self)
        self.labels = list(labels)
        self.series = list(series)
        self.width = width
        self.height = height

    def wrap(self, *args):
        return self.width, self.height

    def _label_step(self, group_w):
        """Через сколько столбиков подписывать ось, чтобы подписи не слиплись."""
        widest = max((pdfmetrics.stringWidth(str(t), FONT, 6.5) for t in self.labels), default=0)
        step = 1
        while step < len(self.labels) and (widest + 5) > group_w * step:
            step += 1
        return step

    def draw(self):
        canvas = self.canv
        count = len(self.labels)
        if not count:
            return

        legend_h = self.LEGEND_H if len(self.series) > 1 else 0
        plot_top = self.height - legend_h - self.PEAK_H
        base = self.LABEL_H
        plot_h = max(plot_top - base, 1)
        peak = max((max(values) if values else 0 for _, _, values in self.series), default=0)

        # Легенда
        if legend_h:
            x = 0
            canvas.setFont(FONT, 8)
            for name, color, _ in self.series:
                canvas.setFillColor(color)
                canvas.circle(x + 3, self.height - 5, 3, stroke=0, fill=1)
                canvas.setFillColor(MUTED)
                canvas.drawString(x + 9, self.height - 7.5, name)
                x += 9 + pdfmetrics.stringWidth(name, FONT, 8) + 16

        # Верхняя граница шкалы с подписью максимума
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.5)
        canvas.line(0, plot_top, self.width, plot_top)
        canvas.setFillColor(FAINT)
        canvas.setFont(FONT, 6.5)
        canvas.drawString(0, plot_top + 2.5, str(peak))

        # Ось
        canvas.setStrokeColor(LINE_2)
        canvas.setLineWidth(0.6)
        canvas.line(0, base, self.width, base)

        group_w = self.width / count
        inner = group_w * 0.72
        bar_w = min(inner / len(self.series), 12)
        step = self._label_step(group_w)

        for i, label in enumerate(self.labels):
            left = i * group_w + (group_w - bar_w * len(self.series)) / 2
            for s, (_, color, values) in enumerate(self.series):
                value = values[i] if i < len(values) else 0
                if peak <= 0 or value <= 0:
                    continue
                # Единица не должна быть неотличима от нуля
                h = max(value / peak * plot_h, 1.2)
                x = left + s * bar_w
                canvas.setFillColor(color)
                if h >= 4:
                    canvas.roundRect(x, base, bar_w - 1.5, h, 1.8, stroke=0, fill=1)
                else:
                    canvas.rect(x, base, bar_w - 1.5, h, stroke=0, fill=1)

            if i % step == 0:
                canvas.setFillColor(FAINT)
                canvas.setFont(FONT, 6.5)
                canvas.drawCentredString(i * group_w + group_w / 2, base - 8, str(label))


class BarList(Flowable):
    """Горизонтальные полосы: подпись — дорожка — значение.

    rows: [(подпись, значение-текст, доля 0..1)] или то же с четвёртым
    элементом-цветом, если строки нужно раскрасить по-разному.
    """

    ROW_H = 15

    def __init__(self, rows, width=CONTENT_W, label_w=110, value_w=54, color=BRAND):
        Flowable.__init__(self)
        self.rows = list(rows)
        self.width = width
        self.label_w = label_w
        self.value_w = value_w
        self.color = color
        self.height = self.ROW_H * max(len(self.rows), 1)

    def wrap(self, *args):
        return self.width, self.height

    def draw(self):
        canvas = self.canv
        track_x = self.label_w + 8
        track_w = max(self.width - track_x - self.value_w - 8, 10)

        for i, row in enumerate(self.rows):
            label, value, share = row[0], row[1], row[2]
            color = row[3] if len(row) > 3 else self.color
            top = self.height - i * self.ROW_H
            text_y = top - 11
            track_y = top - 11.5

            canvas.setFillColor(TEXT_2)
            canvas.setFont(FONT, 8.5)
            canvas.drawString(0, text_y, str(label))

            canvas.setFillColor(SURFACE_2)
            canvas.roundRect(track_x, track_y, track_w, 7, 3.5, stroke=0, fill=1)
            filled = max(min(share, 1), 0) * track_w
            if filled > 0:
                canvas.setFillColor(color)
                canvas.roundRect(track_x, track_y, max(filled, 3), 7, 3.5, stroke=0, fill=1)

            canvas.setFillColor(TEXT)
            canvas.setFont(FONT_BOLD, 8.5)
            canvas.drawRightString(self.width, text_y, str(value))


class ReportBuilder:
    """Собирает PDF-отчёт из блоков: KPI, секции, таблицы, графики, заметки."""

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
        widths = fit_column_widths(headers, widths)

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

    def _keep(self, title, note, flowable):
        """Заголовок, пояснение и сам график — одним неразрывным блоком.

        Без этого длинный отчёт оставлял заголовок «Рейтинг компании» внизу
        страницы, а полосы уезжали на следующую.
        """
        group = []
        if title:
            group.append(Paragraph(title, self.styles['section']))
        if note:
            group.append(Paragraph(note, self.styles['note']))
            group.append(Spacer(1, 6))
        group.append(flowable)
        self.story.append(KeepTogether(group))
        self.spacer(10)

    def columns(self, labels, series, title=None, note=None, height=46 * mm):
        """Столбиковая диаграмма. series: [(название, цвет, [значения])]."""
        self._keep(title, note, ColumnChart(labels, series, height=height))

    def bars(self, rows, title=None, note=None, label_w=110, color=BRAND):
        """Горизонтальные полосы: [(подпись, значение, доля 0..1)]."""
        self._keep(title, note, BarList(rows, label_w=label_w, color=color))

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
    resp = HttpResponse(data, content_type='application/pdf')
    resp['Content-Disposition'] = 'attachment; filename="%s"' % filename
    return resp


def fmt_date(value):
    """Дата для отчётов. Раньше эта функция была скопирована в три файла экспорта."""
    return value.strftime('%d.%m.%Y') if value else '—'
