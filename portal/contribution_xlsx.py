"""Archivo editable de aportaciones. Autor: Luis Montañez Escobar."""
import io
import zipfile
from copy import copy
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from xml.etree import ElementTree as ET

from openpyxl import load_workbook
from openpyxl.writer.excel import ExcelWriter
from openpyxl.formatting.rule import FormulaRule
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.cell_range import CellRange
from openpyxl.workbook.properties import CalcProperties

AUTHOR = 'Luis Montañez Escobar'


class PublicArchive(zipfile.ZipFile):
    """Escribir las propiedades públicas durante la reconstrucción del libro."""
    def writestr(self, entry, data, *args, **kwargs):
        name = entry.filename if isinstance(entry, zipfile.ZipInfo) else entry
        if name == 'docProps/app.xml':
            xml = ET.fromstring(data)
            for node in xml:
                if node.tag.rsplit('}', 1)[-1] == 'Application':
                    node.text = 'Microsoft Excel'
                elif node.tag.rsplit('}', 1)[-1] == 'AppVersion':
                    node.text = '16.0'
            data = ET.tostring(xml, encoding='utf-8', xml_declaration=True)
        return super().writestr(entry, data, *args, **kwargs)


def literal(cell, value):
    cell.value = value
    cell.data_type = 's'


def configure_print_layout(sheet, end=27, count=16):
    # Excel no conserva paneles congelados en Diseño de página.
    sheet.freeze_panes = None
    sheet.auto_filter.ref = f'A11:F{end}'
    sheet.print_area = f'A1:F{end + 5}'
    sheet.print_title_rows = '1:11'
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = 'portrait'
    sheet.page_setup.paperSize = sheet.PAPERSIZE_LETTER
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 1 if count <= 20 else 0
    sheet.page_margins = PageMargins(left=0.3, right=0.3, top=0.3, bottom=0.3, header=0.1, footer=0.1)
    sheet.print_options.horizontalCentered = True
    sheet.print_options.verticalCentered = False
    sheet.sheet_view.view = 'pageLayout'
    sheet.sheet_view.showGridLines = False
    sheet.sheet_view.showRuler = True
    sheet.sheet_view.zoomScale = sheet.sheet_view.zoomScalePageLayoutView = 85
    sheet.sheet_view.topLeftCell = 'A1'
    sheet.sheet_view.selection[0].activeCell = 'C12'
    sheet.sheet_view.selection[0].sqref = 'C12'


def export_workbook(data, blank=False):
    book = load_workbook(Path(__file__).with_name('contributions-template.xlsx'))
    sheet = book['Aportaciones']
    book.properties.creator = book.properties.lastModifiedBy = AUTHOR
    book.properties.title = f"Aportaciones · semana {data['week']} · {data['season']}"
    book.properties.subject = 'Control de aportaciones de La Quiniela Fiscalizada'
    book.properties.description = 'Registro de recepciones por participante'
    book.properties.keywords = book.properties.category = None
    treasurer = data['treasurer']['name'] if data['treasurer'] else 'Por asignar'
    literal(sheet['B2'], ('PRUEBA · ' if data.get('sandbox') else '') + 'Control de aportaciones')
    sheet['B2'].alignment = Alignment(vertical='center', wrap_text=True)
    kind = 'Formato en blanco' if blank else 'Control actual'
    literal(sheet['B4'], f"Semana {data['week']} · NFL {data['season']} · {kind}")
    literal(sheet['B5'], f'Tesorero: {treasurer}')
    sheet['C6'] = data['fee']
    literal(sheet['D6'], 'Fecha')
    sheet['E6'] = None if blank else datetime.now(ZoneInfo('America/Mexico_City')).replace(tzinfo=None)
    sheet['E6'].number_format = 'dd/mm/yyyy'
    count = len(data['participants'])
    end = max(27, count + 11)
    extra = end - 27
    if extra:
        footer_merges = [str(r) for r in sheet.merged_cells.ranges if r.min_row >= 28]
        for ref in footer_merges:
            sheet.unmerge_cells(ref)
        sheet.insert_rows(28, extra)
        for ref in footer_merges:
            area = CellRange(ref)
            area.shift(row_shift=extra)
            sheet.merge_cells(str(area))
        for drawing in sheet._images:
            if drawing.anchor._from.row >= 27:
                drawing.anchor._from.row += extra
        for row, height in [(28, 6), (29, 18), (30, 22), (31, 25), (32, 15)]:
            sheet.row_dimensions[row + extra].height = height
    marks = f'C12:C{end}'
    totals = [f'SUM(D12:D{end})', f'COUNTIF({marks},"✓")',
              f'COUNTIFS(B12:B{end},"Completa",{marks},"<>✓")']
    for address, formula in zip(['A9', 'C9', 'E9'], totals):
        sheet[address] = f'=IF(COUNTA({marks})=0,"",{formula})' if blank else '=' + formula
    for index in range(12, end + 1):
        for column in range(1, 7):
            cell = sheet.cell(index, column)
            if index != 12:
                cell._style = copy(sheet.cell(12, column)._style)
            cell.comment = None
        person = data['participants'][index - 12] if index - 12 < count else None
        sheet.row_dimensions[index].height = 24
        sheet.cell(index, 4, f'=IF(C{index}="✓",$C$6,IF(C{index}="✗",0,""))').number_format = '$#,##0.00'
        if person is None:
            continue
        literal(sheet.cell(index, 1), person['name'])
        literal(sheet.cell(index, 2), 'Completa' if person['complete'] else 'Incompleta' if person['choices'] else 'Sin elecciones')
        sheet.cell(index, 3).value = None if blank else '✓' if person['paid'] is True else '✗' if person['paid'] is False else None
        at = person['receivedAt']
        sheet.cell(index, 5).value = datetime.fromisoformat(at).astimezone(ZoneInfo('America/Mexico_City')).replace(tzinfo=None) if at and not blank else None
        sheet.cell(index, 5).number_format = 'dd/mm/yyyy'
        sheet.cell(index, 6).value = None
    sheet.data_validations.dataValidation.clear()
    validation = DataValidation(type='list', formula1='"✓,✗"', allow_blank=True)
    validation.showDropDown = False
    validation.showErrorMessage = True
    validation.showInputMessage = True
    validation.promptTitle = 'Recibido'
    validation.prompt = '✓ = recibido; ✗ = pendiente; vacía = sin confirmar.'
    validation.errorTitle = 'Marca de recepción'
    validation.error = 'Selecciona ✓ o ✗, o deja la casilla vacía.'
    validation.errorStyle = 'stop'
    sheet.add_data_validation(validation)
    validation.add(marks)
    sheet.conditional_formatting._cf_rules.clear()
    sheet.conditional_formatting.add(marks, FormulaRule(formula=['C12="✓"'],
        fill=PatternFill('solid', fgColor='E4EEDC'), font=Font(name='Arial', color='25543C', bold=True)))
    sheet.conditional_formatting.add(marks, FormulaRule(formula=['C12="✗"'],
        fill=PatternFill('solid', fgColor='F7E9E7'), font=Font(name='Arial', color='8F453B', bold=True)))
    configure_print_layout(sheet, end, count)
    book.calculation = CalcProperties(fullCalcOnLoad=True, forceFullCalc=True, calcMode='auto')
    result = io.BytesIO()
    # La biblioteca reconstruye hojas, relaciones y propiedades en una sola escritura.
    ExcelWriter(book, PublicArchive(result, 'w', zipfile.ZIP_DEFLATED, allowZip64=True)).save()
    return result.getvalue()
