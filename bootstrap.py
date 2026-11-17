#!/usr/bin/env python3
"""Download pinned upstream dependency, verify integrity, and extract into this project."""
import base64
import hashlib
import io
from pathlib import Path
import tarfile
import urllib.request

ROOT=Path(__file__).resolve().parent
URL='https://registry.npmjs.org/@mlightcad/libredwg-web/-/libredwg-web-0.8.8.tgz'
INTEGRITY='z003e0GpS01Kc4ee6InhxrDyA66OgmKrUfyHkZYkDRiCTbY3plQk/6N0J0lIti08bVHhknKh4WO95UotSk+prQ=='

def setup_package(folder,url,integrity,required):
    target=ROOT/'vendor'/folder
    if all((target/name).exists() for name in required):
        return
    print(f'최초 실행: {folder} 읽기 엔진을 준비합니다.',flush=True)
    with urllib.request.urlopen(url,timeout=60) as response: data=response.read()
    if base64.b64encode(hashlib.sha512(data).digest()).decode()!=integrity:
        raise RuntimeError('DWG 엔진 다운로드 검증 실패')
    target.mkdir(parents=True,exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
        for member in archive.getmembers():
            parts=Path(member.name).parts
            if not parts or parts[0]!='package' or '..' in parts or member.issym() or member.islnk():
                raise RuntimeError('잘못된 패키지 경로')
            destination=target.joinpath(*parts[1:])
            if member.isdir():destination.mkdir(parents=True,exist_ok=True)
            elif member.isfile():
                destination.parent.mkdir(parents=True,exist_ok=True)
                with archive.extractfile(member) as source: destination.write_bytes(source.read())
    print('DWG 읽기 엔진 준비 완료.',flush=True)

def setup():
    setup_package('libredwg',URL,INTEGRITY,['dist/libredwg-web.js','wasm/libredwg-web.wasm'])
    setup_package('pdfjs','https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-4.10.38.tgz','/Y3fcFrXEAsMjJXeL9J8+ZG9U01LbuWaYypvDW2ycW1jL269L3js3DVBjDJ0Up9Np1uqDXsDrRihHANhZOlwdQ==',['build/pdf.mjs','build/pdf.worker.mjs'])

if __name__=='__main__': setup()
