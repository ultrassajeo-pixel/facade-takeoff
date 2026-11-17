"""Minimal synthetic document fixtures for extraction tests, not construction specs."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import io
root=Path(__file__).resolve().parent/'fixtures'
text='개발용 가상 시방서 · 실제 시공 기준 아님\n판넬 유효폭: 1000 mm\n하지 간격: 1,200 mm\n실리콘 용량: 300 mL\n'
(root/'sample-spec.txt').write_text(text)
with ZipFile(root/'sample-spec.docx','w',ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    z.writestr('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+''.join('<w:p><w:r><w:t>'+line+'</w:t></w:r></w:p>' for line in text.splitlines())+'</w:body></w:document>')
stream=b'BT /F1 14 Tf 50 750 Td (SYNTHETIC TEST SPECIFICATION - NOT FOR CONSTRUCTION) Tj 0 -30 Td (panelWidth: 1000 mm) Tj 0 -22 Td (supportSpacing: 1200 mm) Tj 0 -22 Td (cartridgeMl: 300 mL) Tj ET'
objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
out=io.BytesIO();out.write(b'%PDF-1.4\n');offsets=[0]
for i,obj in enumerate(objects,1):offsets.append(out.tell());out.write(str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n')
xref=out.tell();out.write(f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:out.write(f'{offset:010d} 00000 n \n'.encode())
out.write(f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode())
(root/'sample-spec.pdf').write_bytes(out.getvalue())
print('Generated synthetic TXT, DOCX and PDF fixtures.')
