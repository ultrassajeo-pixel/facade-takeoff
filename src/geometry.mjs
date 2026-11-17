import {clipPolygons,clipLine,pointsPolygon,polygonPoints,inClips,polygonArea as clippedArea} from './clipping.mjs';
import { errorDescriptions } from './dwg-reader.mjs';
import {MAX_DRAWING_ENTITIES} from './drawing-limits.mjs';
import {splinePoints,ellipsePoints,hatchPaths} from './cad-curves.mjs';
import {reconstructRegions} from './regions.mjs';

const TAU = Math.PI * 2;
const identity = [1, 0, 0, 1, 0, 0];
export const transformPoint = (m, p) => ({x: m[0]*p.x+m[2]*p.y+m[4], y:m[1]*p.x+m[3]*p.y+m[5]});
export function multiply(a,b) {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
const translate = (x,y) => [1,0,0,1,x,y];
const rotate = a => [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
// LibreDWG LWPOLYLINE flags are native DWG flags (512=closed, 1=explicit extrusion),
// not DXF group-70 flags. If extrusion is absent, the DWG default is +Z.
const planar = e => (e.type==='LWPOLYLINE' && !(e.flag&1)) || !e.extrusionDirection || (Math.abs(e.extrusionDirection.x)<1e-9 && Math.abs(e.extrusionDirection.y)<1e-9 && Math.abs(e.extrusionDirection.z-1)<1e-9);
export function arcPoints(center,radius,start,sweep,steps = 80) {
  const n=Math.max(2,Math.min(512,Math.ceil(Math.abs(sweep)/TAU*steps)));
  return Array.from({length:n+1},(_,i)=>({x:center.x+radius*Math.cos(start+sweep*i/n),y:center.y+radius*Math.sin(start+sweep*i/n)}));
}
export function bulgeSegment(a,b,bulge) {
  if (!bulge || Math.abs(bulge)<1e-12) return [a,b];
  const chord=Math.hypot(b.x-a.x,b.y-a.y);
  if (!chord) return [a];
  const center={x:(a.x+b.x)/2-(b.y-a.y)*(1-bulge*bulge)/(4*bulge),y:(a.y+b.y)/2+(b.x-a.x)*(1-bulge*bulge)/(4*bulge)};
  return arcPoints(center,chord*(1+bulge*bulge)/(4*Math.abs(bulge)),Math.atan2(a.y-center.y,a.x-center.x),4*Math.atan(bulge));
}
export function polygonArea(points) {
  return Math.abs(points.reduce((s,p,i)=>{const n=points[(i+1)%points.length];return s+p.x*n.y-n.x*p.y;},0)/2);
}
export function cleanText(s='') {
  return String(s).replace(/\\U\+([0-9a-f]{4})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)))
    .replace(/\\P/g,'\n').replace(/\\[A-Za-z][^;]*;/g,'').replace(/[{}]/g,'').replace(/%%d/g,'°').replace(/%%p/g,'±').replace(/%%c/g,'Ø');
}
export function normalizeDrawing(parsed) {
  const db=parsed.database;
  const shapes=[],texts=[],dimensions=[],issues=[...(parsed.referenceIssues||[])],typeCounts={},clipping=[];
  const blocks=new Map((db.tables?.BLOCK_RECORD?.entries||[]).map(b=>[b.name,b]));
  const layers=(db.tables?.LAYER?.entries||[]).map(l=>({...l,count:0}));
  const layerMap=new Map(layers.map(l=>[l.name,l]));
  const maxEntities=MAX_DRAWING_ENTITIES;
  let visits=0;
  const seenIssues=new Set();
  function issue(code,message,entity,level='blocker') {
    const id=code+':'+(entity?.handle||'file');
    if(seenIssues.has(id))return;
    seenIssues.add(id);issues.push({id,code,message,level,handle:entity?.handle,layer:entity?.layer});
  }
  if(parsed.errorCode) issue('parser-warning','DWG 읽기 경고: '+errorDescriptions(parsed.errorCode).join(' · '));
  if(parsed.stats?.unknownEntityCount) issue('unknown-entity',`엔진이 해석하지 못한 객체 ${parsed.stats.unknownEntityCount}개가 있습니다.`);
  if(!db.entities?.length) issue('empty-model','모형 공간에 해석 가능한 객체가 없습니다. 배치 공간 또는 외부참조 여부를 확인해야 합니다.');
  const addPath=(e,points,closed,m,layer,key,exact=true,clips=[],z=[1,0])=>{
    if(!points.length || points.some(p=>!finitePoint(p))) {issue('invalid-coordinate','유효하지 않은 좌표가 있습니다.',e);return;}
    const planar=points.every(p=>Math.abs((p.z||0)-(points[0].z||0))<=1e-8);
    if(!planar) issue('3d-coordinate','한 객체 안에서 Z 높이가 달라 XY 투영과 실제 길이가 다릅니다. 산출을 차단합니다.',e);
    const pts=points.map(p=>transformPoint(m,p));
    const polygons=clips.length&&closed?clipPolygons(pointsPolygon(pts),clips):null;
    const segments=closed?[...pts,pts[0]]:pts;
    const paths=clips.length?(pts.length===1?(inClips(pts[0],clips)?[pts]:[]):segments.slice(1).flatMap((p,i)=>clipLine(segments[i],p,clips))):null;
    if(polygons?!polygons.length:paths&&!paths.length)return;
    const visiblePoints=polygons?polygonPoints(polygons):paths?paths.flat():pts;
    const elevation=['LWPOLYLINE','POLYLINE2D'].includes(e.type)?(e.elevation??points[0]?.z??0):(points[0]?.z??0);
    shapes.push({...(clips.length?{originalPoints:pts,clips,polygons,paths}:{}),id:key,sourceFile:e.sourceFile,sourceHandle:e.sourceHandle,handle:e.handle,type:e.type,layer,points:visiblePoints,closed,exact,planar,planeZ:elevation*z[0]+z[1],color:e.color,colorIndex:e.colorIndex,visible:e.isVisible!==false});
  };
  function visit(e,m=identity,parentLayer='0',path='',stack=[],clips=[],z=[1,0]) {
    if(++visits>maxEntities) {issue('entity-limit','객체 수가 처리 한도를 초과했습니다. 자동으로 잘라서 산출하지 않습니다.');return;}
    if(e.isInPaperSpace||e.isVisible===false)return;
    typeCounts[e.type]=(typeCounts[e.type]||0)+1;
    const layer=(e.layer==='0'&&parentLayer!=='0')?parentLayer:(e.layer||parentLayer);
    if(!layerMap.has(layer)){const l={name:layer,count:0};layers.push(l);layerMap.set(layer,l);}
    layerMap.get(layer).count++;
    const key=path+'/'+e.handle;
    if(!planar(e)){issue('ocs-plane','기울어진 객체 좌표계가 있어 이 객체의 표시와 산출을 보류합니다.',e);return;}
    if(e.type==='INSERT') {
      if(e.clipInvalid)return;
      if(e.clip)clipping.push({id:key,handle:e.handle,inverted:!!e.clip.inverted,vertices:e.clip.polygon.length});
      const block=blocks.get(e.name);
      if(!block){issue('missing-block',`블록 ${e.name}을 찾을 수 없습니다.`,e);return;}
      if(block.flags&12){issue('xref',`외부참조 ${e.name}의 원본 파일 연결이 필요합니다.`,e);return;}
      if(stack.includes(e.name)||stack.length>24){issue('block-cycle','블록 중첩/순환 참조를 해석할 수 없습니다.',e);return;}
      const p=e.insertionPoint,b=block.basePoint||{x:0,y:0};
      if(!finitePoint(p)){issue('invalid-coordinate','블록 삽입점이 유효하지 않습니다.',e);return;}
      // Translation along Z does not change the dimensions of XY-planar geometry.
      const cols=Math.max(1,e.columnCount||1),rows=Math.max(1,e.rowCount||1);
      if(cols*rows>10000){issue('array-limit','배열 블록이 처리 한도를 초과했습니다.',e);return;}
      const placement=multiply(m,multiply(translate(p.x,p.y),rotate(e.rotation||0)));
      for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
        const local=multiply(placement,multiply(translate(col*(e.columnSpacing||0),row*(e.rowSpacing||0)),multiply([e.xScale??1,0,0,e.yScale??1,0,0],translate(-b.x,-b.y))));
        const activeClips=e.clip?[...clips,{...e.clip,polygon:e.clip.polygon.map(p=>transformPoint(local,p))}]:clips;
        const childZ=[z[0]*(e.zScale??1),z[1]+z[0]*((p.z||0)-(e.zScale??1)*(b.z||0))];
        for(const c of block.entities||[])visit(c,local,layer,key+`:${row},${col}`,[...stack,e.name],activeClips,childZ);
      }
      // ATTRIB coordinates already include insert placement in owner space.
      for(const a of e.attribs||[])visit(a,m,layer,key+':attr',stack,clips,z);
      return;
    }
    if(e.type==='LINE') addPath(e,[e.startPoint,e.endPoint],false,m,layer,key,true,clips,z);
    else if(['LWPOLYLINE','POLYLINE2D','POLYLINE3D'].includes(e.type)){
      if(e.type!=='LWPOLYLINE' && ((e.flag||0)&6)){issue('spline-fit','곡선 맞춤 폴리라인은 아직 정확히 해석할 수 없습니다.',e);return;}
      const vertices=(e.vertices||[]).map(v=>({...v,...(v.point||v.location||{})}));
      const closed=!!(e.flag&(e.type==='LWPOLYLINE'?512:1)),pts=[];
      let exact=true;
      for(let i=0;i<vertices.length;i++){
        const a=vertices[i],b=vertices[(i+1)%vertices.length];
        if(!finitePoint(a)||!finitePoint(b)){issue('invalid-coordinate','폴리라인 좌표가 유효하지 않습니다.',e);return;}
        if(i===vertices.length-1&&!closed){pts.push(a);break;}
        if(a.bulge)exact=false;
        pts.push(...bulgeSegment(a,b,a.bulge||0).slice(0,-1));
      }
      // A constant OCS elevation preserves lengths/area on a +Z plane.
      addPath(e,pts,closed,m,layer,key,exact,clips,z);
    } else if(e.type==='CIRCLE'||e.type==='ARC'){
      let sweep=e.type==='CIRCLE'?TAU:((e.endAngle-e.startAngle)%TAU+TAU)%TAU;
      if(!finitePoint(e.center)||!Number.isFinite(e.radius)||e.radius<=0){issue('invalid-curve','원/호의 좌표 또는 반지름이 유효하지 않습니다.',e);return;}
      addPath(e,arcPoints(e.center,e.radius,e.startAngle||0,sweep),e.type==='CIRCLE',m,layer,key,false,clips,z);
    } else if(['SPLINE','ELLIPSE','HATCH','LEADER'].includes(e.type)){
      try{
        if(e.type==='HATCH'){
          const paths=hatchPaths(e);for(const [i,points] of paths.entries())addPath(e,points,true,m,layer,key+':hatch:'+i,false,clips,z);
          issue('hatch-boundaries','해치 경계와 내부 구멍을 표시했습니다. 해치 패턴·경계의 자재 용도는 아직 확정하지 않았습니다.',e,'notice');
        }else if(e.type==='SPLINE'){
          const cps=e.controlPoints||[];if(cps.some(p=>Math.abs((p.z||0)-(cps[0]?.z||0))>1e-8))issue('3d-coordinate','스플라인 제어점의 Z 높이가 다릅니다.',e);
          addPath(e,splinePoints(e),!!(e.flag&1),m,layer,key,false,clips,z);
        }else if(e.type==='ELLIPSE'){
          if(Math.abs(e.majorAxisEndPoint?.z||0)>1e-8)throw Error('XY 평면 밖의 타원 축입니다.');
          const ps=ellipsePoints(e);addPath(e,ps,Math.hypot(ps[0].x-ps.at(-1).x,ps[0].y-ps.at(-1).y)<1e-8,m,layer,key,false,clips,z);
        }else{
          if(e.isSpline)throw Error('곡선 지시선의 제어점 해석이 필요합니다.');
          addPath(e,e.vertices||[],false,m,layer,key,false,clips,z);
          issue('leader-display','지시선 경로를 표시했습니다. 화살촉 장식은 생략합니다.',e,'notice');
        }
      }catch(error){issue('invalid-'+e.type,error.message,e);}
    } else if(['TEXT','MTEXT','ATTRIB','ATTDEF'].includes(e.type)){
      const p=e.startPoint||e.insertionPoint;
      if(finitePoint(p)&&(!clips.length||inClips(transformPoint(m,p),clips)))texts.push({clips,id:key,handle:e.handle,type:e.type,layer,text:cleanText(e.text),point:transformPoint(m,p),height:Math.abs((e.textHeight||1)*Math.hypot(m[0],m[1])),rotation:(e.rotation||0)+Math.atan2(m[1],m[0])});
    } else if(e.type==='DIMENSION'){
      if(clips.length&&!inClips(transformPoint(m,e.textPoint||e.definitionPoint||{x:0,y:0}),clips))return;
      dimensions.push({handle:e.handle,layer,type:e.subclassMarker,measurement:e.measurement,text:e.text||'',point:transformPoint(m,e.textPoint||e.definitionPoint||{x:0,y:0})});
      if(e.text && e.text.trim() && e.text.trim()!=='<>' && !e.text.includes('<>'))issue('dimension-override',`치수 ${e.handle}에 직접 입력된 표시값 “${e.text}”이 있습니다. 실제 치수와의 관계를 확인해야 합니다.`,e);
      const b=blocks.get(e.name);
      if(b)for(const c of b.entities||[])visit(c,m,layer,key,[...stack,e.name],clips,z);
      else issue('dimension-display','치수 도형 블록이 없어 수치 정보만 읽었습니다.',e,'notice');
    } else if(e.type==='POINT'){
      if(finitePoint(e.position))addPath(e,[e.position],false,m,layer,key,true,clips,z);
    } else {
      issue('unsupported-'+e.type,`${e.type} 객체는 현재 표시·산출에 반영되지 않습니다.`,e);
    }
  }
  for(const e of db.entities||[])visit(e);
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const s of shapes)for(const p of s.points){minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);}
  for(const t of texts){minX=Math.min(minX,t.point.x);minY=Math.min(minY,t.point.y);maxX=Math.max(maxX,t.point.x+t.height*Math.min(t.text.length,30));maxY=Math.max(maxY,t.point.y+t.height);}
  if(!Number.isFinite(minX)){minX=0;minY=0;maxX=100;maxY=100;}
  const paperEntities=(db.tables?.BLOCK_RECORD?.entries||[]).filter(b=>/^\*paper_space/i.test(b.name)).reduce((n,b)=>n+(b.entities?.length||0),0);
  if(paperEntities)issue('paper-space',`배치 공간 객체 ${paperEntities}개는 별도 보관됩니다. 현재 뷰어는 모형 공간을 표시합니다.`,null,'notice');
  const drawing={shapes,texts,dimensions,issues,layers,typeCounts,references:parsed.references||[],clipping,bounds:{minX,minY,maxX,maxY},
    sourceCount:db.entities?.length||0,paperEntities,units:db.header?.INSUNITS??0,version:parsed.signature,
    engine:parsed.engine,unknownCount:parsed.stats?.unknownEntityCount||0,errorCode:parsed.errorCode,
    closedCandidates:shapes.filter(s=>s.closed&&s.exact&&s.points.length>=3).map(s=>({id:s.id,handle:s.handle,layer:s.layer,area:s.polygons?clippedArea(s.polygons):polygonArea(s.points)}))};
  reconstructRegions(drawing);return drawing;
}
