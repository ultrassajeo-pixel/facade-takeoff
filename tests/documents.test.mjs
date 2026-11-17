import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
test('DOCX extraction preserves Korean text and table/paragraph order locally',()=>{const bytes=readFileSync(new URL('./fixtures/sample-spec.docx',import.meta.url));const text=execFileSync('python3',[fileURLToPath(new URL('../read_docx.py',import.meta.url))],{input:bytes.toString('base64'),encoding:'utf8'});assert.match(text,/판넬 유효폭: 1000 mm/);assert.match(text,/하지 간격: 1,200 mm/);assert.ok(text.indexOf('판넬')<text.indexOf('하지'));});
test('broken DOCX bytes are rejected instead of being treated as an empty specification',()=>{assert.throws(()=>execFileSync('python3',[fileURLToPath(new URL('../read_docx.py',import.meta.url))],{input:Buffer.from('not a document').toString('base64'),stdio:['pipe','pipe','pipe']}));});
test('PDF text extraction preserves numeric source conditions without OCR assumptions',async()=>{
 // Text-only Node test; rendering remains a browser responsibility.
 globalThis.DOMMatrix=class{};
 const {getDocument}=await import('../vendor/pdfjs/build/pdf.mjs');
 const document=await getDocument({data:new Uint8Array(readFileSync(new URL('./fixtures/sample-spec.pdf',import.meta.url))),isEvalSupported:false,disableFontFace:true,useSystemFonts:true}).promise;
 try{const text=(await(await document.getPage(1)).getTextContent()).items.map(i=>i.str).join('\n');assert.match(text,/panelWidth: 1000 mm/);assert.match(text,/supportSpacing: 1200 mm/);}finally{await document.destroy();}
});
