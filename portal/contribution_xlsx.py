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
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation
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


def export_workbook(data):
    book = load_workbook(Path(__file__).with_name('contributions-template.xlsx'))
    sheet = book['Aportaciones']
    book.properties.creator = book.properties.lastModifiedBy = AUTHOR
    book.properties.title = f"Aportaciones · semana {data['week']} · {data['season']}"
    book.properties.subject = 'Control de aportaciones de La Quiniela Fiscalizada'
    book.properties.description = 'Registro de recepciones por participante'
    book.properties.keywords = book.properties.category = None
    treasurer = data['treasurer']['name'] if data['treasurer'] else 'Por asignar'
    if data.get('sandbox'):
        sheet['A2'] = 'PRUEBA · Control de aportaciones'
    literal(sheet['A3'], f"Semana {data['week']} · NFL {data['season']} · Tesorero: {treasurer}")
    sheet['B4'] = data['fee']
    sheet['D4'] = datetime.now(ZoneInfo('America/Mexico_City')).replace(tzinfo=None)
    sheet['D4'].number_format = 'dd/mm/yyyy hh:mm'
    count = len(data['participants'])
    end = max(10, count + 9)
    sheet['B6'] = f'=SUM(D10:D{end})'
    sheet['D6'] = f'=COUNTIF(C10:C{end},"Recibida")'
    sheet['F6'] = f'=COUNTIFS(B10:B{end},"Completa",C10:C{end},"<>Recibida")'
    for index, person in enumerate(data['participants'], 10):
        for column in range(1, 7):
            cell = sheet.cell(index, column)
            if index != 10:
                cell._style = copy(sheet.cell(10, column)._style)
            cell.comment = None
        literal(sheet.cell(index, 1), person['name'])
        literal(sheet.cell(index, 2), 'Completa' if person['complete'] else 'Incompleta' if person['choices'] else 'Sin elecciones')
        literal(sheet.cell(index, 3), 'Recibida' if person['paid'] is True else 'Pendiente' if person['paid'] is False else 'Sin confirmar')
        sheet.cell(index, 4, f'=IF(C{index}="Recibida",$B$4,0)').number_format = '$#,##0.00'
        at = person['receivedAt']
        sheet.cell(index, 5).value = datetime.fromisoformat(at).astimezone(ZoneInfo('America/Mexico_City')).replace(tzinfo=None) if at else None
        sheet.cell(index, 5).number_format = 'dd/mm/yyyy hh:mm'
        sheet.cell(index, 6).value = None
        sheet.row_dimensions[index].height = 25
    sheet.data_validations.dataValidation.clear()
    validation = DataValidation(type='list', formula1='"Sin confirmar,Pendiente,Recibida"', allow_blank=False)
    validation.showErrorMessage = True
    validation.errorTitle = 'Estado de aportación'
    validation.error = 'Elige Sin confirmar, Pendiente o Recibida.'
    validation.errorStyle = 'stop'
    sheet.add_data_validation(validation)
    validation.add(f'C10:C{end}')
    sheet.conditional_formatting.add(f'C10:C{end}', FormulaRule(formula=['C10="Recibida"'],
        fill=PatternFill('solid', fgColor='E4EEDC'), font=Font(name='Arial', color='25543C', bold=True)))
    sheet.freeze_panes = 'B10'
    sheet.auto_filter.ref = f'A9:F{end}'
    sheet.print_area = f'A1:F{end}'
    sheet.print_title_rows = '1:9'
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
    sheet.page_setup.orientation = 'landscape'
    sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    book.calculation = CalcProperties(fullCalcOnLoad=True, forceFullCalc=True, calcMode='auto')
    result = io.BytesIO()
    # La biblioteca reconstruye hojas, relaciones y propiedades en una sola escritura.
    ExcelWriter(book, PublicArchive(result, 'w', zipfile.ZIP_DEFLATED, allowZip64=True)).save()
    return result.getvalue()
