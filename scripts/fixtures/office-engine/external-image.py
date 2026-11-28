# Authored document with an external image relationship. Only used behind a deny-all network probe.
from pathlib import Path
from docx import Document
from docx.oxml import parse_xml
from docx.opc.constants import RELATIONSHIP_TYPE as RT
p=Path(__file__).parent
d=Document();d.add_paragraph('LOCAL DOCUMENT. External image must never be downloaded.');d.add_paragraph('नमस्ते दुनिया');
r=d.part.relate_to('https://example.invalid/toolatlas-private-document-marker.png',RT.IMAGE,is_external=True)
d.add_paragraph().add_run()._r.append(parse_xml('''<w:drawing xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="1" name="External image"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="External image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:link="'''+r+'''"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>'''))
d.save(p/'external-image.docx')

from io import BytesIO
from PIL import Image
from docx.shared import Inches
image=BytesIO();Image.new("RGB",(80,80),"red").save(image,format="PNG");image.seek(0)
e=Document();e.add_paragraph("LOCAL DOCUMENT. Embedded image.");e.add_paragraph("नमस्ते दुनिया");e.add_picture(image,width=Inches(1));e.save(p/"embedded-image.docx")
