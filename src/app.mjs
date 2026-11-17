import {prepareFiles,savedBundle,chooseMain} from './drawing-intake.mjs';
import { DrawingViewer,layerColor } from './viewer.mjs';
import { createTakeoffUI } from './takeoff-ui.mjs';
import {validateProject,readProjectFile,projectDownload} from './project.mjs';
import {ROLE_LABELS} from './scope.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let project=null,activeQuestion=null,worker=null,workerTimer=null,token=0,saveTimer=null,toastTimer=null;
const viewer=new DrawingViewer($('drawing'),s=>{
  $('selected').hidden=!s;if(s){const r=s.reconstruction;$('selected').textContent=r?`${r.label} · ${s.handle}\n레이어: ${s.layer}\n가로 ${r.width.toFixed(3)} × 세로 ${r.height.toFixed(3)} 도면 단위\n면적 ${r.area.toFixed(3)} 도면 단위²\n원본 선: ${r.sourceHandles.join(', ')}\n${r.caution?'좁은 틈·중복선 확인 필요':'복원 경계 · 개별 판넬 확정 전'}`:`${s.type} · ${s.handle}\n레이어: ${s.layer}\n${s.closed?'닫힌 도형':'열린 선/곡선'} · ${s.exact?'원본 직선 좌표':'곡선 표시용 근사'}\n${ROLE_LABELS[project?.takeoff.roles[s.id]]||'도면 해석 중'}`;}ui.selectShape(s);
},p=>$('coords').textContent=`X ${p.x.toFixed(2)}  Y ${p.y.toFixed(2)}`,z=>$('zoom-label').textContent=Math.round(z*100)+'%');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6500);}
const dbPromise=new Promise((resolve,reject)=>{
  const request=indexedDB.open('facade-workspace',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('projects');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});
async function stored(mode,value){const db=await dbPromise;return new Promise((resolve,reject)=>{const tx=db.transaction('projects',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('projects');const req=mode==='get'?store.get('current'):store.put(value,'current');req.onsuccess=()=>{if(mode==='get')resolve(req.result);};tx.oncomplete=()=>{if(mode!=='get')resolve();};tx.onerror=()=>reject(tx.error);});}
function scheduleSave(){clearTimeout(saveTimer);$('save-status').textContent='저장 중…';saveTimer=setTimeout(async()=>{try{await stored('put',project);$('save-status').textContent='이 브라우저에 저장됨';}catch{$('save-status').textContent='자동 저장 실패 · 프로젝트 저장을 이용해주세요';toast('브라우저 저장 공간에 저장하지 못했습니다. 프로젝트 저장으로 파일을 보관해주세요.');}},250);}
stored('get').then(saved=>{if(saved?.drawing){$('restore').hidden=false;$('restore').onclick=()=>{cancelRead(false);setProject(saved);$('restore').hidden=true;toast('이전 작업과 답변을 복원했습니다.');};}}).catch(()=>$('save-status').textContent='브라우저 저장 불가');
function setProject(value){project=validateProject(value);project.answers||={};project.history||=[];activeQuestion=null;$('project-name').value=project.name;$('filename').textContent=project.file.name;$('filemeta').textContent=`${(project.file.size/1024).toFixed(0)} KB · ${project.drawing.version||'DWG'}`;$('empty').hidden=true;$('export').disabled=false;$('share-current').disabled=false;$('viewer-badge').hidden=false;$('step-state').textContent=project.drawing.issues.some(i=>i.level==='blocker')?'추가 확인 필요':'읽기 완료';$('selected').hidden=true;viewer.load(project.drawing);ui.initialize();renderLayers();renderReferences();renderState();scheduleSave();}
function renderReferences(){
 $('add-references').disabled=!project;
 const root=$('reference-status');root.replaceChildren();
 const labels={resolved:'연결됨',missing:'파일 필요',ambiguous:'파일명 중복',cycle:'순환 참조', 'overlay-skipped':'중첩 오버레이 제외'};
 for(const ref of project?.drawing.references||[]){const item=document.createElement('p');item.textContent=`${labels[ref.status]||ref.status} · ${ref.name} → ${ref.resolvedPath||ref.path}`;item.title=`주도면: ${ref.owner}`;root.append(item);}
 if(project?.drawing.clipping?.length){const info=document.createElement('p');info.textContent=`XCLIP ${project.drawing.clipping.length}곳 적용 · 보이는 영역만 산출`;root.append(info);}
 if(!root.children.length)root.textContent='주도면과 참조 DWG를 함께 선택할 수 있습니다.';
}
function renderLayers(){if(!project)return;const query=$('layer-filter').value.toLowerCase();$('layer-total').textContent=project.drawing.layers.length;$('layers').innerHTML='';for(const layer of project.drawing.layers.filter(l=>l.name.toLowerCase().includes(query))){const row=document.createElement('label');row.className='layer-row';row.innerHTML=`<input type="checkbox" ${viewer.hidden.has(layer.name)?'':'checked'}><i class="layer-color" style="background:${layerColor(layer.name)}"></i><span title="${escape(layer.name)}">${escape(layer.name)}</span><small>${layer.count}</small>`;row.querySelector('input').onchange=e=>viewer.setLayer(layer.name,e.target.checked);$('layers').append(row);}}
function renderState(){if(!project)return;const d=project.drawing;$('metric-entities').textContent=d.sourceCount.toLocaleString();$('metric-layers').textContent=d.layers.length;$('metric-text').textContent=d.texts.length+' / '+d.dimensions.length;$('drawing-status').textContent=d.issues.some(i=>i.level==='blocker')?'판독 차단 항목이 있습니다.':'원본 좌표 해석 완료';ui.render();}
function renderChecks(state){const d=project.drawing,root=$('right-content');root.innerHTML=`<h2>읽은 것과 읽지 못한 것</h2><p class="check-summary">산출 차단 요인 <b>${state.blockers.length}건</b> · 참고 사항 ${d.issues.length-state.blockers.length}건<br>표시용 곡선은 근사 좌표이며, 물량 계산에 사용하지 않습니다.</p>`;
  if(!d.issues.length)root.innerHTML+='<div class="no-issues"><strong>현재 검사에서 판독 문제가 발견되지 않았습니다.</strong>이 결과는 물량 정확도나 모든 객체의 완전한 해석을 보증하지 않습니다. 실제 외벽 도면으로 추가 검증이 필요합니다.</div>';
  for(const item of d.issues.slice(0,300)){const c=document.createElement('div');c.className='check-card '+(item.level==='notice'?'notice':'');c.innerHTML=`<strong>${escape(item.message)}</strong><small>${item.level==='notice'?'참고':'산출 차단'}${item.handle?' · 객체 '+escape(item.handle):''}${item.layer?' · '+escape(item.layer):''}</small>`;if(item.handle){c.style.cursor='pointer';c.onclick=()=>{viewer.focusHandle(item.handle);renderLayers();};}root.append(c);}
  if(d.issues.length>300)root.innerHTML+=`<p class="session-label">나머지 ${d.issues.length-300}건은 프로젝트 저장 파일에 보관됩니다.</p>`;
}
function renderData(){const d=project.drawing,root=$('right-content');root.innerHTML=`<h2>DWG 원본에서 읽은 정보</h2><table class="data-table"><tr><td>파일 버전</td><td>${escape(d.version)}</td></tr><tr><td>원본 단위 코드</td><td>${d.units}</td></tr><tr><td>모형 공간 객체</td><td>${d.sourceCount}</td></tr><tr><td>배치 공간 객체</td><td>${d.paperEntities}</td></tr><tr><td>닫힌 직선 도형 후보</td><td>${d.closedCandidates.length}</td></tr><tr><td>읽기 경고 코드</td><td>${d.errorCode}</td></tr></table><p class="session-label">명시된 레이어·치수 소속은 자동 해석하며, 그 외의 도형은 같은 표시끼리 묶어 질문합니다. 크기만으로 외벽을 추정하지 않습니다.</p><h3 class="data-heading">객체 종류</h3><table class="data-table">${Object.entries(d.typeCounts).map(([type,count])=>`<tr><td>${escape(type)}</td><td>${count}</td></tr>`).join('')}</table><button class="button secondary" id="export-raw">원본 해석 데이터 저장</button><h3 class="data-heading">치수 객체 · ${d.dimensions.length}개</h3>`;
  for(const dim of d.dimensions.slice(0,100)){const el=document.createElement('div');el.className='extract-text';el.textContent=`${dim.measurement??'측정값 없음'}${dim.text?' / 표시문자: '+dim.text:''}`;const small=document.createElement('small');small.textContent=dim.layer+' · '+dim.handle;el.append(small);root.append(el);}
  const heading=document.createElement('h3');heading.className='data-heading';heading.textContent='추출 문자 · '+d.texts.length+'개';root.append(heading);
  for(const text of d.texts.slice(0,150)){const el=document.createElement('div');el.className='extract-text';el.textContent=text.text;const small=document.createElement('small');small.textContent=text.layer+' · '+text.handle;el.append(small);root.append(el);}
  $('export-raw').onclick=()=>download(project.raw||'{}',project.file.name+'.parsed.json');
}
function cancelRead(show=true){token++;if(worker){worker.terminate();worker=null;if(show)toast('도면 읽기를 취소했습니다. 기존 작업은 유지됩니다.');}clearTimeout(workerTimer);$('loading').hidden=true;}
async function readFile(file){return readFiles([file]);}
async function readFiles(selection,attach=false){
 const files=Array.from(selection).filter(Boolean);if(!files.length)return;
 if(!attach&&files.length===1&&/\.(?:json|gz)$/i.test(files[0].name)){
  cancelRead(false);const current=++token;$('loading').hidden=false;$('loading-message').textContent='저장 프로젝트를 읽고 있습니다.';
  try{const value=await readProjectFile(files[0]);if(current!==token)return;setProject(value);toast('프로젝트를 불러왔습니다.');}
  catch(e){if(current===token)toast('불러오기 실패: '+e.message);}
  finally{if(current===token)$('loading').hidden=true;}return;
 }
 cancelRead(false);const current=++token;
 try{
  const cached=attach?savedBundle(project):null;
  // Check count and total size before reading any bytes.
  const sources=await prepareFiles(files,cached);if(current!==token)return;
  const mainPath=cached?.mainPath||(sources.length===1?sources[0].path:await chooseMain(sources.map(s=>s.path)));
  if(!mainPath||current!==token)return;
  const name=$('project-name').value||'새 외벽 프로젝트';
  $('loading').hidden=false;$('loading-message').textContent='파일을 준비하고 있습니다.';
  worker=new Worker(new URL('./dwg-worker.mjs',import.meta.url),{type:'module'});
  const fail=message=>{if(current!==token)return;cancelRead(false);toast('읽기 실패: '+message);};
  workerTimer=setTimeout(()=>fail('해석 시간이 180초를 초과했습니다. 파일을 나누어 다시 시도해주세요.'),180000);
  worker.onmessage=({data})=>{if(current!==token)return;if(data.type==='progress')$('loading-message').textContent=data.message;if(data.type==='error')fail(data.message);if(data.type==='result'){
    clearTimeout(workerTimer);worker.terminate();worker=null;$('loading').hidden=true;
    setProject({schema:'facade-workspace/0.2',name,file:data.file,drawing:data.drawing,raw:data.raw,answers:{},history:[],createdAt:new Date().toISOString()});
    toast(`${data.drawing.sourceCount}개 주도면 객체와 참조 도면을 읽었습니다.${attach?' 연결이 바뀌어 기존 산출과 조건을 초기화했습니다.':''}${data.drawing.issues.some(i=>i.level==='blocker')?' 판독 검사의 차단 항목을 확인해주세요.':''}`);
  }};
  worker.onerror=e=>fail(e.message||'DWG 해석 엔진을 실행하지 못했습니다.');worker.postMessage({sources,mainPath},sources.filter(s=>s.bytes).map(s=>s.bytes));
 }catch(e){if(current===token){cancelRead(false);toast('파일을 열지 못했습니다: '+e.message);}}
}

function download(contents,filename,type='application/json;charset=utf-8'){const blob=new Blob([contents],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}
const ui=createTakeoffUI({getProject:()=>project,viewer,changed:()=>{scheduleSave();renderState();},toast,download,readChecks:renderChecks,readData:renderData});
for(const id of ['upload-top','upload-empty'])$(id).onclick=()=>$('file-input').click();
$('file-input').accept='.dwg,.json,.gz';$('file-input').onchange=e=>{readFiles(e.target.files);e.target.value='';};
$('open-folder').onclick=()=>$('folder-input').click();
$('folder-input').onchange=e=>{const files=[...e.target.files].filter(f=>/\.dwg$/i.test(f.name));if(files.length)readFiles(files);else toast('선택한 폴더에 DWG가 없습니다.');e.target.value='';};
$('add-references').onclick=()=>$('reference-input').click();
$('reference-input').onchange=e=>{readFiles(e.target.files,true);e.target.value='';};
$('cancel').onclick=()=>cancelRead();$('fit').onclick=()=>viewer.fit();$('zoom-in').onclick=()=>viewer.zoom(1.4);$('zoom-out').onclick=()=>viewer.zoom(1/1.4);
$('layer-filter').oninput=renderLayers;$('project-name').oninput=()=>{if(project){project.name=$('project-name').value;scheduleSave();}};

$('export').onclick=async()=>{if(!project)return;const button=$('export');button.disabled=true;try{toast('프로젝트를 저장하고 있습니다. 큰 도면은 자동 압축합니다.');const output=await projectDownload(project);download(output.blob,project.name.replace(/[^\p{L}\p{N}_-]/gu,'_')+output.extension);toast('프로젝트와 답변 이력을 파일로 저장했습니다. DWG 불러오기에서 다시 열 수 있습니다.');}catch(e){toast('프로젝트 저장 실패: '+e.message);}finally{button.disabled=false;}};
$('demo').onclick=async()=>{try{const response=await fetch('/samples/facade_sample_12m_6m.dwg');if(!response.ok)throw Error('샘플 파일이 없습니다.');const blob=await response.blob();readFile(new File([blob],'facade_sample_12m_6m.dwg'));}catch(e){toast(e.message);}};
const drop=$('viewport');for(const event of ['dragenter','dragover'])drop.addEventListener(event,e=>{e.preventDefault();drop.classList.add('dragover');});drop.addEventListener('dragleave',()=>drop.classList.remove('dragover'));drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('dragover');readFiles(e.dataTransfer.files);});
window.addEventListener('beforeunload',()=>{if(worker)worker.terminate();});

$('share-current').onclick=async()=>{if(!project)return;const button=$('share-current'),snapshot=structuredClone(project);delete snapshot.raw;button.disabled=true;button.textContent='현재 작업 전달 중…';try{const response=await fetch('/api/project/share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(snapshot)}),receipt=await response.json();if(!response.ok)throw Error(receipt.error||'작업을 전달하지 못했습니다.');toast(`${receipt.file}의 해석 데이터와 조건을 이 Mac에 전달했습니다. 대화에서 이어서 분석할 수 있습니다.`);}catch(e){toast(e.message);}finally{button.disabled=false;button.textContent='현재 작업 전달';}};
