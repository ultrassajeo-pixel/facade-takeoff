import {initialTakeoff} from './rules.mjs';
import {MAX_DRAWING_ENTITIES} from './drawing-limits.mjs';
import {reconstructRegions} from './regions.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const MAX_PROJECT_TEXT=400*1024*1024;
export async function projectDownload(project,threshold=16*1024*1024){
 const blob=new Blob([JSON.stringify(project)],{type:'application/json'});
 if(blob.size>MAX_PROJECT_TEXT)throw Error('해석 데이터가 프로젝트 저장 한도 400 MB를 초과했습니다.');
 if(blob.size<=threshold)return {blob,extension:'.facade.json'};
 const compressed=await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
 if(compressed.size>100*1024*1024)throw Error('압축 프로젝트가 저장 한도 100 MB를 초과했습니다.');
 return {blob:compressed,extension:'.facade.json.gz'};
}
export async function readProjectFile(file){
 if(file.size>100*1024*1024)throw Error('프로젝트 파일이 너무 큽니다.');
 const magic=new Uint8Array(await file.slice(0,2).arrayBuffer());
 if(magic[0]!==31||magic[1]!==139)return validateProject(JSON.parse(await file.text()));
 const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader(),decoder=new TextDecoder(),parts=[];let bytes=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>MAX_PROJECT_TEXT){await reader.cancel();throw Error('압축 해제된 프로젝트가 400 MB 한도를 초과했습니다.');}parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());}finally{reader.releaseLock();}
 return validateProject(JSON.parse(parts.join('')));
}
export function validateProject(p){
 if(!object(p)||!['facade-workspace/0.1','facade-workspace/0.2'].includes(p.schema)||!object(p.file)||typeof p.file.name!=='string'||!object(p.drawing))throw Error('지원하는 프로젝트 파일이 아닙니다.');
 const d=p.drawing;for(const key of ['shapes','layers','issues','texts','dimensions'])if(!Array.isArray(d[key]))throw Error('프로젝트의 도면 정보가 올바르지 않습니다.');
 if(d.shapes.length>MAX_DRAWING_ENTITIES||!object(d.bounds)||!Object.values(d.bounds).every(Number.isFinite))throw Error('프로젝트의 좌표 범위가 올바르지 않습니다.');
 for(const s of d.shapes)if(typeof s.id!=='string'||!Array.isArray(s.points)||s.points.length>100000||s.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))throw Error('유효하지 않은 도형 좌표입니다.');
 // Clipped projects retain original geometry and visible polygon topology.
 let clipCoordinates=0;
 const checkPoints=points=>{if(!Array.isArray(points)||points.length>100000||points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.max(Math.abs(p.x),Math.abs(p.y))>1e12))throw Error('XCLIP 원본 좌표가 올바르지 않습니다.');clipCoordinates+=points.length;};
 for(const shape of d.shapes){
  if(shape.originalPoints)checkPoints(shape.originalPoints);
  if(shape.paths){if(!Array.isArray(shape.paths))throw Error('XCLIP 표시 경로 오류');for(const path of shape.paths)checkPoints(path);}
  if(shape.polygons){if(!Array.isArray(shape.polygons))throw Error('XCLIP 다각형 형식 오류');for(const poly of shape.polygons){if(!Array.isArray(poly)||!poly.length)throw Error('XCLIP 다각형 형식 오류');for(const ring of poly){if(!Array.isArray(ring)||ring.some(p=>!Array.isArray(p)||p.length!==2))throw Error('XCLIP 다각형 좌표 오류');checkPoints(ring.map(([x,y])=>({x,y})));}}}
 }
 for(const item of [...d.shapes,...d.texts])if(item.clips){if(!Array.isArray(item.clips)||item.clips.length>24)throw Error('XCLIP 중첩 한도 오류');for(const clip of item.clips)checkPoints(clip.polygon);}
 if(clipCoordinates>3000000)throw Error('XCLIP 좌표 수가 저장 한도를 초과했습니다.');
 if(d.reconstruction){
  if(d.reconstruction.version!==1)throw Error('지원하지 않는 영역 복원 버전입니다.');
  const originals=d.shapes.filter(s=>!s.reconstruction&&s.type!=='RECOVERED_FACE');
  const expected={...d,reconstruction:undefined,shapes:originals.map(s=>({...s,scopeSourceOnly:undefined}))};
  reconstructRegions(expected);
  const actualFaces=d.shapes.filter(s=>s.reconstruction||s.type==='RECOVERED_FACE'),expectedFaces=expected.shapes.slice(originals.length);
  if(JSON.stringify(actualFaces)!==JSON.stringify(expectedFaces)||JSON.stringify(d.reconstruction)!==JSON.stringify(expected.reconstruction)||originals.some((s,i)=>!!s.scopeSourceOnly!==!!expected.shapes[i].scopeSourceOnly))throw Error('복원 영역과 원본 선의 근거가 일치하지 않습니다. 원본 DWG를 다시 열어주세요.');
 }else if(d.shapes.some(s=>s.reconstruction||s.type==='RECOVERED_FACE'||s.scopeSourceOnly))throw Error('복원 영역의 원본 연결 정보가 없습니다.');
 p.takeoff||=initialTakeoff();for(const key of ['roles','inputs','profiles'])if(!object(p.takeoff[key]))throw Error('프로젝트의 산출 조건이 올바르지 않습니다.');
 for(const key of ['history','documents','proposals','messages']){p[key]||=[];if(!Array.isArray(p[key]))throw Error('프로젝트 기록 형식이 올바르지 않습니다.');}
 let characters=0;for(const doc of p.documents){if(typeof doc.name!=='string'||!Array.isArray(doc.pages))throw Error('참고 문서 정보가 올바르지 않습니다.');for(const page of doc.pages){if(typeof page.text!=='string')throw Error('참고 문서 텍스트가 올바르지 않습니다.');characters+=page.text.length;}}
 if(characters>2000000||p.documents.length>50)throw Error('프로젝트의 참고 문서 용량이 너무 큽니다.');p.schema='facade-workspace/0.2';return p;
}
