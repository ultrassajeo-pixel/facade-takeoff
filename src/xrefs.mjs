import {clipForInsert} from './clipping.mjs';
import {MAX_DRAWING_ENTITIES} from './drawing-limits.mjs';
// Resolve only files explicitly supplied by the user. CAD paths never trigger I/O.
export const BUNDLE_SCHEMA='facade-drawing-bundle/1';
export const MAX_FILES=32, MAX_TOTAL_BYTES=100*1024*1024;
export function logicalPath(value){
 const parts=[];for(const part of String(value).normalize('NFC').replaceAll('\\','/').split('/')){
  if(!part||part==='.')continue;if(part==='..'&&parts.length&&parts.at(-1)!=='..')parts.pop();else parts.push(part);
 }return parts.join('/');
}
const key=value=>logicalPath(value).toLowerCase();
export function resolveReference(owner,reference,paths){
 const raw=String(reference||''),ref=logicalPath(raw),absolute=/^(?:[a-z]:|[/\\])/i.test(raw);
 const candidates=absolute?[ref]:[logicalPath(owner).split('/').slice(0,-1).concat(ref).join('/'),ref];
 for(const candidate of candidates){const matches=paths.filter(p=>key(p)===key(candidate));if(matches.length)return matches.length===1?{status:'resolved',path:matches[0]}:{status:'ambiguous'};}
 const matches=paths.filter(p=>key(p).split('/').at(-1)===key(ref).split('/').at(-1));
 return matches.length===1?{status:'resolved',path:matches[0]}:{status:matches.length?'ambiguous':'missing'};
}
export function assembleReferences(bundle){
 const sources=bundle.sources||[];
 if(!sources.length||sources.length>MAX_FILES)throw Error(`DWG는 ${MAX_FILES}개까지 함께 열 수 있습니다.`);
 if(sources.reduce((n,s)=>n+(s.file?.size||0),0)>MAX_TOTAL_BYTES)throw Error('함께 읽는 DWG의 합계는 100 MB 이하여야 합니다.');
 const paths=sources.map(s=>logicalPath(s.path));
 if(new Set(paths.map(key)).size!==paths.length)throw Error('같은 경로의 DWG가 중복되었습니다. 폴더 선택으로 파일을 구분해주세요.');
 const main=sources.find(s=>key(s.path)===key(bundle.mainPath));if(!main)throw Error('주도면을 찾을 수 없습니다.');
 const blocks=(main.parsed.database.tables?.BLOCK_RECORD?.entries||[]).filter(b=>/^\*paper_space/i.test(b.name)),layers=new Map(),references=[],issues=[],imported=new Set(),checked=new Set();let entityCount=0;
 const problem=(code,message,source)=>issues.push({id:code+':'+issues.length,code,message,level:'blocker',sourceFile:source.path});
 function check(source){
  if(checked.has(source))return;checked.add(source);const p=source.parsed;
  if(source!==main&&p.errorCode)problem('xref-parser-warning',`${source.path}: 참조 DWG 읽기 경고(${p.errorCode})가 있습니다.`,source);
  if(source!==main&&p.stats?.unknownEntityCount)problem('xref-unknown-entity',`${source.path}: 해석하지 못한 객체 ${p.stats.unknownEntityCount}개가 있습니다.`,source);

 }
 function context(source,namespace,chain){
  check(source);const db=source.parsed.database;
  if((db.objects?.SPATIAL_FILTER||[]).some(f=>!f.handle))problem('xref-clip',`${source.path}: XCLIP 경계 객체의 식별 정보가 없습니다.`,source);
  const blockMap=new Map((db.tables?.BLOCK_RECORD?.entries||[]).map(b=>[b.name,b]));
  const scoped=name=>namespace?namespace+'::'+name:name;
  const layerName=name=>namespace?namespace+'|'+name:name;
  for(const layer of db.tables?.LAYER?.entries||[])layers.set(layerName(layer.name),{...layer,name:layerName(layer.name)});
  function block(name){
   const id=scoped(name);if(imported.has(id))return id;imported.add(id);
   const original=blockMap.get(name);if(!original)return id;
   const copy={...original,name:id,entities:[]};blocks.push(copy);
   if(original.flags&12){
    const reference={owner:source.path,name,path:original.xrefPath||name+'.dwg'};references.push(reference);
    if(namespace&&(original.flags&8)){reference.status='overlay-skipped';copy.flags=0;return id;}
    const resolved=resolveReference(source.path,reference.path,paths);Object.assign(reference,resolved);reference.resolvedPath=resolved.path;
    if(resolved.status!=='resolved'){
     copy.flags=0;problem('xref-'+resolved.status,`${source.path} → ${reference.path}: ${resolved.status==='ambiguous'?'같은 이름의 파일이 여러 개입니다. 원래 폴더 구조로 선택해주세요.':'참조 DWG 파일을 함께 선택해주세요.'}`,source);return id;
    }
    const target=sources[paths.indexOf(resolved.path)];
    if(chain.includes(key(target.path))||chain.length>=24){reference.status='cycle';copy.flags=0;problem('xref-cycle',`${reference.path}: 순환 참조 또는 24단계를 넘는 중첩 참조입니다.`,source);return id;}
    const child=context(target,namespace?namespace+'|'+name:name,[...chain,key(target.path)]);
    copy.flags=0;copy.basePoint=target.parsed.database.header?.INSBASE||target.parsed.database.tables?.BLOCK_RECORD?.entries?.find(b=>/^\*model_space$/i.test(b.name))?.basePoint||original.basePoint;
    copy.entities=(target.parsed.database.entities||[]).map(e=>child.entity(e,true));
    if(!copy.entities.length)problem('xref-empty',`${target.path}: 참조 도면의 모형 공간이 비어 있습니다.`,target);
   }else copy.entities=(original.entities||[]).map(e=>entity(e));
   return id;
  }
  function entity(e,model=false){
   if(++entityCount>MAX_DRAWING_ENTITIES)throw Error('참조를 포함한 객체 수가 처리 한도를 초과했습니다.');
   const copy={...e,handle:scoped(e.handle),layer:namespace&&(e.layer!=='0'||model)?layerName(e.layer||'0'):(e.layer||'0'),sourceFile:source.path,sourceHandle:e.handle};
   if(e.type==='INSERT'||e.type==='DIMENSION')copy.name=block(e.name);
   if(e.type==='INSERT')try{copy.clip=clipForInsert(db,e);}catch(error){copy.clipInvalid=true;problem('xclip-invalid',`${source.path} · ${e.handle}: ${error.message}`,source);}
   if(e.attribs)copy.attribs=e.attribs.map(a=>entity(a,model));return copy;
  }
  return {entity};
 }
 const root=context(main,'',[key(main.path)]),entities=(main.parsed.database.entities||[]).map(e=>root.entity(e,true));
 return {...main.parsed,database:{...main.parsed.database,entities,tables:{...main.parsed.database.tables,BLOCK_RECORD:{entries:blocks},LAYER:{entries:[...layers.values()]}}},referenceIssues:issues,references};
}
