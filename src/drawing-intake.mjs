import {BUNDLE_SCHEMA,MAX_FILES,MAX_TOTAL_BYTES,logicalPath} from './xrefs.mjs';
// Keep large lossless raw JSON off the UI thread during worker transfer and autosave.
export function rawPayload(bundle,threshold=4*1024*1024){
 const json=JSON.stringify(bundle,(_,value)=>typeof value==='bigint'?value.toString():value);
 return json.length>=threshold?new Blob([json],{type:'application/json'}):json;
}
export function savedBundle(project){
 const bundle=JSON.parse(project?.raw||'null');
 if(bundle?.schema!==BUNDLE_SCHEMA||!Array.isArray(bundle.sources))throw Error('이전 형식의 작업입니다. 주도면과 참조 DWG를 함께 다시 선택해주세요.');
 return bundle;
}
export async function prepareFiles(files,cached=null){
 const additions=[];
 for(const file of files){
  if(!/\.dwg$/i.test(file.name))throw Error('참조 도면은 DWG 파일로 선택해주세요.');
  if(file.size>40*1024*1024)throw Error('각 DWG는 40 MB 이하여야 합니다.');
  additions.push({path:logicalPath(file.webkitRelativePath||file.name),file});
 }
 const sources=new Map((cached?.sources||[]).map(s=>[s.path.toLowerCase(),s]));
 const seen=new Set();for(const s of additions){const key=s.path.toLowerCase();if(seen.has(key))throw Error('같은 이름의 파일이 겹칩니다. 폴더 선택을 사용해주세요.');seen.add(key);sources.set(key,s);}
 if(sources.size>MAX_FILES||[...sources.values()].reduce((n,s)=>n+s.file.size,0)>MAX_TOTAL_BYTES)throw Error('DWG는 최대 32개, 합계 100 MB까지 함께 읽을 수 있습니다.');
 const result=[];
 for(const source of sources.values()){
  if(source.parsed){result.push(source);continue;}
  const bytes=await source.file.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  result.push({path:source.path,file:{name:source.file.name,size:source.file.size,sha256},bytes});
 }
 return result;
}
export async function drawingFingerprint(bundle){
 if(bundle.sources.length===1)return bundle.sources[0].file.sha256;
 const value=JSON.stringify({mainPath:bundle.mainPath,sources:bundle.sources.map(s=>[s.path,s.file.sha256]).sort((a,b)=>a[0].localeCompare(b[0]))});
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function chooseMain(paths){
 return new Promise(resolve=>{
  const dialog=document.getElementById('main-drawing-dialog'),select=document.getElementById('main-drawing-select');
  select.replaceChildren(...paths.map(path=>{const option=document.createElement('option');option.value=path;option.textContent=path;return option;}));
  dialog.returnValue='';dialog.onclose=()=>resolve(dialog.returnValue==='open'?select.value:null);dialog.showModal();
 });
}
