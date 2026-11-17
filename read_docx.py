"""Extract DOCX paragraphs/tables locally; limit zip expansion and avoid XML entities."""
import base64, io, sys, zipfile
from xml.etree import ElementTree as ET
data=base64.b64decode(sys.stdin.read(29*1024*1024),validate=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    info=archive.getinfo('word/document.xml')
    if info.file_size>8*1024*1024: raise ValueError('Expanded document too large')
    xml=archive.read(info)
    if b'<!DOCTYPE' in xml or b'<!ENTITY' in xml: raise ValueError('Unsafe XML')
    root=ET.fromstring(xml)
ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
lines=[' '.join(t.text or '' for t in p.iter(ns+'t')) for p in root.iter(ns+'p')]
text='\n'.join(lines)
if len(text)>500000: raise ValueError('Text too long')
print(text)
