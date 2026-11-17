export async function readDocument(file){
 if(file.size>20*1024*1024)throw Error('참고 문서는 20 MB 이하로 올려주세요.');
 const name=file.name,ext=name.split('.').pop().toLowerCase();let pages=[];
 if(ext==='pdf'){
  const pdfjs=await import('/vendor/pdfjs/build/pdf.mjs');pdfjs.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/build/pdf.worker.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,stopAtErrors:true,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/'});const doc=await task.promise;
  try{if(doc.numPages>300)throw Error('PDF는 300쪽 이하로 나눠주세요.');for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();pages.push({page:i,text:content.items.map(t=>t.str+(t.hasEOL?'\n':' ')).join('')});}}finally{await doc.destroy();}
 }else if(['txt','md','csv','json'].includes(ext))pages=[{page:1,text:await file.text()}];
 else if(ext==='docx'){
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
  const res=await fetch('/api/document',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:btoa(binary)})});const data=await res.json();if(!res.ok)throw Error(data.error);pages=[{page:1,text:data.text}];
 }else throw Error('PDF, DOCX, TXT, MD 문서를 지원합니다. 이미지·스캔본의 조건은 질문에 직접 답해주세요.');
 const empty=pages.filter(p=>p.text.trim().length<20).map(p=>p.page),characters=pages.reduce((s,p)=>s+p.text.length,0);
 if(characters>500000)throw Error('추출 문자가 50만 자를 넘습니다. 필요한 구간으로 문서를 나눠주세요.');
 return {id:crypto.randomUUID(),name,size:file.size,pages,characters,emptyPages:empty,addedAt:new Date().toISOString(),warning:empty.length?`${empty.length}쪽에서 텍스트를 충분히 읽지 못했습니다. 스캔·표·도면의 조건은 질문으로 보완해야 합니다.`:''};
}
