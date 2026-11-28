# Authored regression source. Requires python-docx and openpyxl only to regenerate.
from pathlib import Path
OUT=Path(__file__).parent
from docx import Document
from docx.shared import Inches,Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from openpyxl import Workbook
from openpyxl.chart import BarChart,Reference
from openpyxl.styles import Font,PatternFill
from openpyxl.worksheet.pagebreak import Break
d=Document();sec=d.sections[0];sec.header.paragraphs[0].text='TOOLATLAS HEADER';sec.footer.paragraphs[0].text='PRIVATE FOOTER'
d.add_heading('Complex quarterly report',0);d.add_paragraph('नमस्ते दुनिया क्षत्रिय ज्ञान');d.add_paragraph('ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ ਪੰਜਾਬੀ ਕ੍ਰਿਪਾ')
t=d.add_table(rows=3,cols=2);t.style='Table Grid';t.cell(0,0).text='Outer A';t.cell(0,1).text='Nested';n=t.cell(0,1).add_table(rows=2,cols=2);n.style='Table Grid';n.cell(0,0).text='Inner 1';n.cell(0,1).text='Inner 2';n.cell(1,0).merge(n.cell(1,1)).text='Inner merged';t.cell(1,0).merge(t.cell(1,1)).text='Outer merged';t.cell(2,0).text='Revenue';t.cell(2,1).text='1250'
p=d.add_paragraph();r=OxmlElement('w:r');p._p.append(r);pict=OxmlElement('w:pict');r.append(pict)
from lxml import etree
pict.append(etree.fromstring(b'<v:shape xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" style="width:220pt;height:42pt" type="#_x0000_t202"><v:textbox><w:txbxContent><w:p><w:r><w:t>FLOATING BOX CONTENT</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape>'))
d.add_page_break();d.add_heading('Second page after explicit break',1);d.add_paragraph('Final sentence, no content may be lost.');d.save(str(OUT/'complex.docx'))
w=Workbook();s=w.active;s.title='Revenue';s.merge_cells('A1:D1');s['A1']='Quarterly बिक्री';s['A1'].font=Font(size=20,bold=True);s.append(['Region','Actual','Target','Difference']);
for row in [('North',125,100,'=B3-C3'),('South',230,200,'=B4-C4'),('East',80,90,'=B5-C5')]:s.append(row)
for c in s[2]:c.fill=PatternFill('solid',fgColor='224466');c.font=Font(color='FFFFFF',bold=True)
for col in 'ABCD':s.column_dimensions[col].width=20
chart=BarChart();chart.add_data(Reference(s,min_col=2,max_col=3,min_row=2,max_row=5),titles_from_data=True);chart.set_categories(Reference(s,min_col=1,min_row=3,max_row=5));chart.title='Actual versus target';s.add_chart(chart,'A8');s.print_area='A1:D22';s.page_setup.orientation='landscape';s.page_setup.paperSize=s.PAPERSIZE_A4;s.page_setup.fitToWidth=1;s.sheet_properties.pageSetUpPr.fitToPage=True;s.oddHeader.center.text='CONFIDENTIAL REPORT';s.oddFooter.center.text='Page &P of &N';s['A30']='OUTSIDE PRINT AREA SECRET';w.save(str(OUT/'complex.xlsx'))
