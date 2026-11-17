import {CLIPPING_POLICY,RECOVERY_POLICY} from './common-rules.mjs';
import {rectanglePolygon,intersect,polygonArea,mapPolygons,polygonLine} from './clipping.mjs';
import {clippedPanels} from './clipped-takeoff.mjs';
import {SCALE,PROFILE_KINDS,PROFILE_FIELDS,activeFields,isValid,listNumbers} from './rules.mjs';
import {pendingScopeGroups} from './scope.mjs';
import {combineCuts} from './cutting.mjs';
import {caulkingPlan} from './caulking.mjs';
export const ENGINE='facade-takeoff/0.6.2';
const EPS=1e-6;
const ceil=n=>Math.ceil(n-1e-9);
const sum=a=>a.reduce((s,n)=>s+n,0);
export const rectArea=r=>(r.x1-r.x0)*(r.y1-r.y0);
const inside=(a,b)=>a.x0>=b.x0-EPS&&a.y0>=b.y0-EPS&&a.x1<=b.x1+EPS&&a.y1<=b.y1+EPS;
const overlap=(a,b)=>Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>EPS&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>EPS;
function bounds(points){return {x0:Math.min(...points.map(p=>p.x)),x1:Math.max(...points.map(p=>p.x)),y0:Math.min(...points.map(p=>p.y)),y1:Math.max(...points.map(p=>p.y))};}
function mergeRecoveredRegions(walls,errors){
 const remaining=new Set(walls),merged=[];
 const touches=(a,b)=>((Math.abs(a.x1-b.x0)<EPS||Math.abs(a.x0-b.x1)<EPS)&&Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0)>EPS)||((Math.abs(a.y1-b.y0)<EPS||Math.abs(a.y0-b.y1)<EPS)&&Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0)>EPS);
 while(remaining.size){
  const first=remaining.values().next().value;remaining.delete(first);const group=[first];
  if(first.recoveryGroup)for(let i=0;i<group.length;i++)for(const next of remaining)if(next.recoveryGroup===first.recoveryGroup&&next.role===first.role&&touches(group[i],next)){group.push(next);remaining.delete(next);}
  if(group.length===1){merged.push(first);continue;}
  const r={...first,x0:Math.min(...group.map(r=>r.x0)),x1:Math.max(...group.map(r=>r.x1)),y0:Math.min(...group.map(r=>r.y0)),y1:Math.max(...group.map(r=>r.y1)),sourceRegionIds:group.map(r=>r.id)};
  if(Math.abs(rectArea(r)-sum(group.map(rectArea)))>Math.max(1e-4,rectArea(r)*1e-10))errors.push({id:'region-union-'+first.id,message:'연결된 복원 영역의 외곽이 비정형입니다. 외접 사각형으로 물량을 늘려 계산하지 않습니다.'});
  merged.push(r);
 }return merged;
}
export function rectangle(shape,scale=1){
 if(!shape?.closed||!shape.exact||shape.points.length<4)return null;
 let p=shape.points.map(p=>({x:p.x*scale,y:p.y*scale}));if(p.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.abs(p.x)>1e12||Math.abs(p.y)>1e12))return null;
 if(p.length>4&&Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y)<EPS)p.pop();
 let changed=true;while(changed&&p.length>4){changed=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length];if((Math.abs(a.x-b.x)<EPS&&Math.abs(b.x-c.x)<EPS&&b.y>=Math.min(a.y,c.y)&&b.y<=Math.max(a.y,c.y))||(Math.abs(a.y-b.y)<EPS&&Math.abs(b.y-c.y)<EPS&&b.x>=Math.min(a.x,c.x)&&b.x<=Math.max(a.x,c.x))){p.splice(i,1);changed=true;break;}}}
 if(p.length!==4)return null;const b=bounds(p);if(rectArea(b)<=EPS)return null;
 const corners=new Set(p.map(v=>`${Math.abs(v.x-b.x0)<EPS?0:Math.abs(v.x-b.x1)<EPS?1:2},${Math.abs(v.y-b.y0)<EPS?0:Math.abs(v.y-b.y1)<EPS?1:2}`));
 if(corners.size!==4||[...corners].some(c=>c.includes('2')))return null;
 if(p.some((a,i)=>{const n=p[(i+1)%4];return Math.abs(a.x-n.x)>EPS&&Math.abs(a.y-n.y)>EPS;}))return null;
 return {...b,id:shape.id,handle:shape.handle,layer:shape.layer};
}
export function extractScope(drawing,state){
 const errors=[],scale=SCALE[state.inputs?.units];let walls=[],openings=[];
 if(!scale)return {errors,walls,openings,segments:[],scale:null};
 for(const shape of drawing.shapes||[]){const role=state.roles?.[shape.id];if(shape.scopeSourceOnly||!['wall','window','door'].includes(role))continue;
  const r=rectangle(shape.originalPoints?{...shape,points:shape.originalPoints}:shape,scale);if(!r){errors.push({id:'shape-'+shape.id,message:`객체 ${shape.handle}: 현재 정밀 산출은 XY 축에 평행한 직사각형 외벽·개구부를 지원합니다. 곡선·경사·비정형은 별도 형상 처리가 필요합니다.`});continue;}
  if(shape.polygons)r.polygons=mapPolygons(shape.polygons,p=>({x:p.x*scale,y:p.y*scale}));
  if(shape.reconstruction?.caution)errors.push({id:'region-thin-'+shape.id,message:`복원 영역 ${shape.handle}는 매우 좁고 긴 경계입니다. 중복선·틈인지 판넬 면인지 확인되지 않아 산출을 보류합니다.`});
  r.recoveryGroup=shape.reconstruction?.groupId;r.role=role;(role==='wall'?walls:openings).push(r);
 }
 walls=mergeRecoveredRegions(walls,errors);openings=mergeRecoveredRegions(openings,errors);
 if(!walls.length)errors.push({id:'wall',message:'산출할 외벽 외곽을 지정해주세요.'});
 if(walls.length>50||openings.length>500)errors.push({id:'geometry-limit',message:'한 프로젝트는 외벽 50개·개구부 500개까지 지원합니다. 구간을 나눠주세요.'});
 for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++)if(overlap(walls[i],walls[j])&&polygonArea(intersect(walls[i].polygons||rectanglePolygon(walls[i]),walls[j].polygons||rectanglePolygon(walls[j])))>EPS)errors.push({id:'overlap-wall',message:'외벽 외곽이 중복되거나 겹칩니다. 산출 범위를 다시 지정해주세요.'});
 for(const o of openings){const owner=walls.filter(w=>inside(o,w)&&polygonArea(intersect(o.polygons||rectanglePolygon(o),w.polygons||rectanglePolygon(w)))>EPS);if(owner.length!==1){errors.push({id:'opening-'+o.id,message:`개구부 ${o.handle}가 정확히 한 외벽 안에 포함되어야 합니다.`});continue;}o.wallId=owner[0].id;}
 for(let i=0;i<openings.length;i++)for(let j=i+1;j<openings.length;j++)if(overlap(openings[i],openings[j])&&polygonArea(intersect(openings[i].polygons||rectanglePolygon(openings[i]),openings[j].polygons||rectanglePolygon(openings[j])))>EPS)errors.push({id:'overlap-opening',message:'개구부가 서로 겹치거나 중복되어 있습니다.'});
 for(const w of walls){w.openings=openings.filter(o=>o.wallId===w.id);if(!w.polygons&&w.openings.some(o=>o.polygons))w.polygons=rectanglePolygon(w);if(w.polygons)for(const o of w.openings)o.polygons=intersect(o.polygons||rectanglePolygon(o),w.polygons);}
 return {errors,walls,openings,segments:errors.length?[]:edgeSegments(walls),scale};
}
function subtractIntervals(start,end,holes){let runs=[[start,end]];for(const [a,b] of holes){runs=runs.flatMap(([l,h])=>b<=l+EPS||a>=h-EPS?[[l,h]]:[[l,Math.min(h,a)],[Math.max(l,b),h]].filter(([x,y])=>y-x>EPS));}return runs;}
function edgeSegments(walls){
 const seg=[];let currentWall;const push=(kind,source,start,end)=>{const vertical=/Left|Right|Jamb/.test(kind);const axis=vertical?'x':'y',coordinate=kind.endsWith('Left')?source.x0:kind.endsWith('Right')?source.x1:kind.endsWith('Top')||kind.endsWith('Head')?source.y1:kind.endsWith('Jamb')?(source._jambSide==='right'?source.x1:source.x0):source.y0;if(end-start<=EPS)return;let runs=[[start,end]];
 const a=axis==='x'?{x:coordinate,y:start}:{x:start,y:coordinate},b=axis==='x'?{x:coordinate,y:end}:{x:end,y:coordinate};
 const visibility=source.polygons||currentWall.polygons;
 if(visibility)runs=polygonLine(a,b,visibility).map(([p,q])=>axis==='x'?[p.y,q.y]:[p.x,q.x]);
 for(const [start,end] of runs)if(end-start>EPS)seg.push({path:{wallId:currentWall.id,axis,coordinate,start,end},id:`${source.id}/${kind}/${seg.length+1}`,kind,sourceId:source.id,handle:source.handle,length:end-start});};
 for(const w of walls){currentWall=w;for(const [kind,axis,coord,start,end] of [['wallTop','y',w.y1,w.x0,w.x1],['wallBottom','y',w.y0,w.x0,w.x1],['wallLeft','x',w.x0,w.y0,w.y1],['wallRight','x',w.x1,w.y0,w.y1]]){
   const h=w.openings.filter(o=>coord>=o[axis+'0']-EPS&&coord<=o[axis+'1']+EPS).map(o=>axis==='y'?[o.x0,o.x1]:[o.y0,o.y1]);for(const [a,b] of subtractIntervals(start,end,h))push(kind,w,a,b);
  }
  for(const o of w.openings){const pref=o.role==='window'?'window':'door';
   if(o.y1<w.y1-EPS)push(pref+'Head',o,o.x0,o.x1);
   // A door threshold may exist at ground level; it requires explicit apply/none.
   if(o.role==='door'||o.y0>w.y0+EPS)push(o.role==='window'?'windowSill':'doorThreshold',o,o.x0,o.x1);
   if(o.x0>w.x0+EPS)push(pref+'Jamb',{...o,_jambSide:'left'},o.y0,o.y1);if(o.x1<w.x1-EPS)push(pref+'Jamb',{...o,_jambSide:'right'},o.y0,o.y1);
  }
 }return seg;
}
export function inspect(drawing,state){
 const scope=extractScope(drawing,state),v=state.inputs||{},pending=[];
 const kinds=[...new Set(scope.segments.map(s=>s.kind))],profiles=state.profiles||{};
 const flashingActive=kinds.some(k=>profiles[k]?.mode!=='none');
 const openingFlashing=kinds.some(k=>!k.startsWith('wall')&&profiles[k]?.mode==='apply');
 for(const f of activeFields({...v,flashingActive,openingFlashing}))if(!isValid(f,v[f.id]))pending.push({id:f.id,message:f.label,field:f});
 for(const k of kinds){const p=profiles[k]||{};for(const f of PROFILE_FIELDS.filter(f=>f.id==='mode'||p.mode==='apply'))if(!isValid(f,p[f.id]))pending.push({id:`profile.${k}.${f.id}`,message:`${PROFILE_KINDS[k]} · ${f.label}`,kind:k,field:f});}
 const blockers=[...(drawing.issues||[]).filter(i=>i.level==='blocker').map(i=>({id:i.id,message:i.message})),...scope.errors];
 for(const [i,d] of (drawing.reconstruction?.diagnostics||[]).entries())blockers.push({id:'reconstruction-'+i,message:d.message});
 for(const conflict of state.conflicts||[])blockers.push({id:'conflict-'+conflict.field,message:`${conflict.label}: 문서·답변 간 값이 다릅니다. 자료·대화에서 적용할 근거를 선택해주세요.`});
 const groups=pendingScopeGroups(drawing,state);for(const g of groups)blockers.push({id:'role-group-'+g.id,message:`${g.layer}의 ${g.shapes.length}개 표시 묶음이 아직 구분되지 않았습니다.`});
 if(!state.scopeConfirmed)blockers.push({id:'scope-confirm',message:'도면 해석에서 남은 질문을 해결하면 산출 범위가 정해집니다.'});
 if(v.uniform==='no')blockers.push({id:'uniform',message:'공법·규격이 다른 구간은 별도 프로젝트로 나누어 주세요.'});
 if(v.edgeOwnership==='unresolved')blockers.push({id:'edgeOwnership',message:'공유 코너 후레싱을 담당할 입면을 정하고 부위별 적용 여부를 지정해주세요.'});
 if(v.panelOrderMode==='combined'&&(+v.minLength>+v.maxLength||v.procurement!=='custom'))blockers.push({id:'combined-order',message:'합산 발주는 최소 길이 이하가 아닌 최대 길이와 길이별 주문 제작 조건이 필요합니다.'});
 if(v.reuse==='yes')blockers.push({id:'reuse',message:'잔재 재사용 절단 계획은 현재 엔진의 지원 범위 밖입니다. 재사용이 필수이면 산출을 진행할 수 없습니다.'});
 const seams=isValid({type:'text'},v.seams)?listNumbers(v.seams):[];
 if(seams===null)blockers.push({id:'seams',message:'이음 위치는 중복 없는 mm 숫자 목록 또는 “없음”으로 입력해주세요.'});
 const positions=v.supportMode==='positions'?listNumbers(v.supportPositions):null;
 if(v.supportMode==='positions'&&isValid({type:'text'},v.supportPositions)&&(!positions||!positions.length))blockers.push({id:'supportPositions',message:'실제 하지 위치가 한 개 이상 필요합니다.'});
 if(+v.orderWidth<+v.panelWidth)blockers.push({id:'orderWidth',message:'발주 원폭은 유효폭보다 작을 수 없습니다.'});
 if(+v.stockPanelLength>+v.maxLength&&v.procurement==='fixed')blockers.push({id:'stockPanelLength',message:'정척 길이가 최대 제작·운반 길이보다 큽니다.'});
 for(const w of scope.walls){const length=v.direction==='horizontal'?w.x1-w.x0:w.y1-w.y0,width=v.direction==='horizontal'?w.y1-w.y0:w.x1-w.x0;
  if(seams?.some(x=>x<=EPS||x>=length-EPS))blockers.push({id:'seams-'+w.id,message:`외벽 ${w.handle}: 이음 위치는 0과 전체 길이 ${length} mm 사이여야 합니다.`});
  if(positions?.some(x=>x>length+EPS))blockers.push({id:'supports-'+w.id,message:`외벽 ${w.handle}: 하지 위치가 외벽 길이를 벗어납니다.`});
  if(v.supportMode==='spacing'&&+v.supportOffset>length)blockers.push({id:'offset',message:'첫 하지 위치가 외벽 길이를 벗어납니다.'});
  if(+v.panelWidth>0&&ceil(width/+v.panelWidth)>10000)blockers.push({id:'panels-limit',message:'폭 분할 수가 10,000개를 넘습니다. 단위와 유효폭을 확인해주세요.'});
  if(v.supportMode==='spacing'&&+v.supportSpacing>0&&length/+v.supportSpacing>10000)blockers.push({id:'support-limit',message:'하지 기준선이 10,000개를 넘습니다. 단위와 간격을 확인해주세요.'});
  if(seams&&seams.length>1000)blockers.push({id:'seam-limit',message:'이음 위치가 1,000개를 넘습니다.'});
 }
 for(const k of kinds){const p=profiles[k]||{};if(p.mode==='apply'){
  if(+p.lap>=+p.stock)blockers.push({id:'profile-lap-'+k,message:`${PROFILE_KINDS[k]}: 겹침은 정척 길이보다 작아야 합니다.`});
  if(p.reuse==='yes')blockers.push({id:'profile-reuse-'+k,message:`${PROFILE_KINDS[k]}: 구간 간 잔재 재사용 계획이 필요합니다.`});
 }}
 return {scope,kinds,flashingActive,openingFlashing,pending,blockers,canCalculate:!pending.length&&!blockers.length};
}
function transpose(r,h){return h?{...r,x0:r.y0,x1:r.y1,y0:r.x0,y1:r.x1}:r;}
function cellsFor(rect,holes){
 const relevant=holes.filter(h=>overlap(rect,h)),xs=[rect.x0,rect.x1],ys=[rect.y0,rect.y1];
 for(const h of relevant){xs.push(Math.max(rect.x0,h.x0),Math.min(rect.x1,h.x1));ys.push(Math.max(rect.y0,h.y0),Math.min(rect.y1,h.y1));}
 const unique=a=>[...new Set(a)].sort((a,b)=>a-b),x=unique(xs),y=unique(ys),cells=[];
 if(x.length*y.length>200000)throw Error('개구부 분할이 처리 한도를 넘습니다. 산출 범위를 나눠주세요.');
 for(let i=0;i<x.length-1;i++)for(let j=0;j<y.length-1;j++){const c={x0:x[i],x1:x[i+1],y0:y[j],y1:y[j+1],i,j};if(rectArea(c)>EPS&&!relevant.some(h=>inside(c,h)))cells.push(c);}return cells;
}
function connected(cells){const map=new Map(cells.map(c=>[`${c.i},${c.j}`,c])),groups=[];while(map.size){const first=map.values().next().value,stack=[first],group=[];map.delete(`${first.i},${first.j}`);while(stack.length){const c=stack.pop();group.push(c);for(const [i,j] of [[c.i-1,c.j],[c.i+1,c.j],[c.i,c.j-1],[c.i,c.j+1]]){const key=`${i},${j}`,n=map.get(key);if(n){map.delete(key);stack.push(n);}}}groups.push(group);}return groups;}
const cellBounds=c=>({x0:Math.min(...c.map(r=>r.x0)),x1:Math.max(...c.map(r=>r.x1)),y0:Math.min(...c.map(r=>r.y0)),y1:Math.max(...c.map(r=>r.y1))});
function runsAt(cells,y){const runs=cells.filter(c=>y>c.y0-EPS&&y<c.y1+EPS).map(c=>[c.x0,c.x1]).sort((a,b)=>a[0]-b[0]),merged=[];for(const r of runs){const prev=merged.at(-1);if(prev&&r[0]<=prev[1]+EPS)prev[1]=Math.max(prev[1],r[1]);else merged.push([...r]);}return merged.length;}
export function panelLayout(scope,v){
 const panels=[],h=v.direction==='horizontal',seams=listNumbers(v.seams),pw=+v.panelWidth;
 for(const source of scope.walls){if(source.polygons){panels.push(...clippedPanels(source,v,seams,panels.length));continue;}const w=transpose(source,h),holes=source.openings.map(o=>transpose(o,h)),height=w.y1-w.y0,width=w.x1-w.x0,n=ceil(width/pw),cuts=[w.y0,...seams.map(x=>x+w.y0),w.y1];
  const supports=v.supportMode==='positions'?listNumbers(v.supportPositions).map(x=>x+w.y0):Array.from({length:Math.max(0,Math.floor((height-+v.supportOffset)/+v.supportSpacing+1e-9)+1)},(_,i)=>w.y0+ +v.supportOffset+i*+v.supportSpacing);
  if(n*(cuts.length-1)>20000)throw Error('판넬 분할 수가 20,000개를 넘습니다. 구간을 나눠주세요.');
  for(let col=0;col<n;col++)for(let row=0;row<cuts.length-1;row++){
   if(panels.length>20000)throw Error('판넬 수가 20,000개를 넘습니다. 구간을 나눠주세요.');
   const x0=v.startSide==='low'?w.x0+col*pw:Math.max(w.x0,w.x1-(col+1)*pw),x1=v.startSide==='low'?Math.min(w.x1,x0+pw):w.x1-col*pw;
   const rect={x0,x1,y0:cuts[row],y1:cuts[row+1]},cells=cellsFor(rect,holes);
   if(!cells.length)continue;
   const groups=v.openings==='cut'?[cells]:connected(cells);
   for(const component of groups){
    // Site cutting keeps a full blank only where some installed material remains.
    const b=v.openings==='cut'?rect:cellBounds(component),isJoint=row<cuts.length-2&&Math.abs(b.y1-cuts[row+1])<EPS,lap=isJoint?+v.panelLap:0;
    if(isJoint&&lap>=cuts[row+2]-cuts[row+1]-EPS&&lap>0)throw Error('판넬 겹침이 다음 이음 구간 길이 이상입니다. 이음 상세를 확인해주세요.');
    const required=b.y1-b.y0+lap+ +v.trim,rounded=ceil(required/+v.lengthStep)*+v.lengthStep;
    const orderLength=v.procurement==='fixed'?+v.stockPanelLength:rounded;
    if(orderLength+EPS<required||orderLength>+v.maxLength+EPS)throw Error(`외벽 ${source.handle}: 필요한 주문 길이 ${rounded} mm가 허용 길이/정척을 초과합니다. 이음 위치를 지정해주세요.`);
    const area=sum(component.map(rectArea));let boltCount=0;const fixingRows=[];
    if(area>EPS)for(const fixingComponent of connected(component)){const fixingBounds=cellBounds(fixingComponent),b=fixingBounds;const coords=[...supports.filter(y=>y>=b.y0-EPS&&y<=b.y1+EPS)];
     if(v.endSupport==='yes')coords.push(b.y0,b.y1);
     for(const end of [b.y0,b.y1])if(!coords.some(y=>Math.abs(y-end)<EPS))throw Error(`외벽 ${source.handle}: ${Math.round(end-w.y0)} mm 판넬 끝단의 하지 위치가 없습니다. 끝단 보강 여부나 실제 하지 위치를 알려주세요.`);
     const axis=[...new Set(coords.map(y=>Math.round(y*1e6)/1e6))].sort((a,b)=>a-b);
     for(const y of axis){const end=Math.abs(y-b.y0)<EPS||Math.abs(y-b.y1)<EPS;
      // A support exactly at an opening edge uses the adjacent material on either side, never the void.
      const delta=Math.min(.001,(b.y1-b.y0)/10000),a=Math.max(b.y0+delta,Math.min(b.y1-delta,y-delta)),c=Math.max(b.y0+delta,Math.min(b.y1-delta,y+delta));
      const runs=Math.max(runsAt(fixingComponent,a),runsAt(fixingComponent,c)),count=runs*(end?+v.endBolts:+v.middleBolts);boltCount+=count;if(count)fixingRows.push({position:y-w.y0,segments:runs,classification:end?'끝단':'중간',count});
     }
    }
    panels.push({id:`P${String(panels.length+1).padStart(4,'0')}`,wall:source.handle,sourceId:source.id,column:col+1,row:row+1,cutWidth:b.x1-b.x0,installedLength:b.y1-b.y0,lap,orderLength,orderWidth:+v.orderWidth,netArea:area/1e6,boltCount,fixingRows,rect:transpose(b,h),cells:component.map(c=>transpose(c,h)),offcutArea:(+v.orderWidth*orderLength-area)/1e6});
   }
  }
 }return panels;
}
export function flashingPieces(length,stock,lap){if(!(length>0&&stock>0&&lap>=0&&lap<stock))throw Error('후레싱 길이·정척·겹침 조건 오류');const count=Math.max(1,ceil((length-lap)/(stock-lap)));if(count>20000)throw Error('후레싱 분할 수가 20,000개를 넘습니다.');return Array.from({length:count},(_,i)=>i<count-1?stock:length-(count-1)*(stock-lap));}
export function screwCount(length,spacing,inset,rows){if(length<2*inset-EPS)throw Error('후레싱 조각이 피스 양끝 이격 합계보다 짧습니다. 피스 이격 상세를 확인해주세요.');return (Math.abs(length-2*inset)<EPS?1:ceil((length-2*inset)/spacing)+1)*rows;}
export function calculate(drawing,state){
 const gate=inspect(drawing,state);if(!gate.canCalculate)throw Error([...gate.pending,...gate.blockers].map(x=>x.message).join('\n'));
 const v=state.inputs,scope=gate.scope,panels=panelLayout(scope,v),panelGroups=new Map();let cutPlan=null;
 const addOrder=(width,length,ids,blankId)=>{const key=`${width}×${length}`;if(!panelGroups.has(key))panelGroups.set(key,{spec:v.panelSpec,width,length,installed:0,panelIds:[],blankIds:[]});const g=panelGroups.get(key);g.installed++;g.panelIds.push(...ids);if(blankId)g.blankIds.push(blankId);};
 if(v.panelOrderMode==='combined'){
  const byWidth=new Map();for(const p of panels){if(!byWidth.has(p.orderWidth))byWidth.set(p.orderWidth,[]);byWidth.get(p.orderWidth).push(p);}
  cutPlan={orders:[],required:0,ordered:0,remnant:0,materialOptimal:true,blankCountOptimal:false};
  for(const [width,ps] of byWidth){const plan=combineCuts(ps.map(p=>({id:p.id,length:p.orderLength})),{min:+v.minLength,max:+v.maxLength,step:+v.lengthStep});cutPlan.required+=plan.required;cutPlan.ordered+=plan.ordered;cutPlan.remnant+=plan.remnant;
   for(const o of plan.orders){o.id=`B${String(cutPlan.orders.length+1).padStart(4,'0')}`;o.width=width;o.spec=v.panelSpec;cutPlan.orders.push(o);addOrder(width,o.length,o.cuts.map(c=>c.id),o.id);for(const cut of o.cuts){const panel=ps.find(p=>p.id===cut.id);panel.blankId=o.id;panel.cutOffset=cut.offset;panel.blankLength=o.length;}}
  }
 }else for(const p of panels)addOrder(p.orderWidth,p.orderLength,[p.id]);
 for(const g of panelGroups.values()){g.spare=ceil(g.installed*+v.panelLoss/100);g.order=g.installed+g.spare;}
 const flashing=[],fg=new Map();let screws=0,sealantMl=0;
 for(const seg of scope.segments){const p=state.profiles[seg.kind];if(p.mode==='none')continue;
  const pieces=flashingPieces(seg.length,+p.stock,+p.lap),laps=pieces.length-1;
  const pieceScrews=v.commonQuantity?[]:pieces.map(l=>screwCount(l,+v.screwSpacing,+v.screwInset,+v.screwRows)),screw=v.commonQuantity?screwCount(seg.length,+v.screwSpacing,0,+v.screwRows)+laps*Number(v.lapScrews||0):sum(pieceScrews)+laps*+v.lapScrews;
  const beadLength=v.sealantMethod==='length'?0:(v.sealantBasis==='net'?seg.length:sum(pieces))*+v.sealantLines+laps*+p.developed*+v.lapBeads;
  const ml=v.sealantMethod==='length'?0:beadLength*+v.beadWidth*+v.beadDepth*(v.beadShape==='triangle'?.5:1)*+v.fillPercent/100/1000;
  const item={...seg,label:PROFILE_KINDS[seg.kind],spec:p.spec,stock:+p.stock,developed:+p.developed,lap:+p.lap,pieces,laps,pieceScrews,screws:screw,beadLength,sealantMl:ml};flashing.push(item);screws+=screw;sealantMl+=ml;
  const key=JSON.stringify([p.spec,+p.stock,+p.developed,+p.loss]);if(!fg.has(key))fg.set(key,{spec:p.spec,stock:+p.stock,developed:+p.developed,loss:+p.loss,netLength:0,cutLength:0,installed:0,segments:[]});const g=fg.get(key);g.installed+=pieces.length;g.netLength+=seg.length;g.cutLength+=sum(pieces);g.segments.push(seg.id);
 }
 for(const g of fg.values()){g.spare=ceil(g.installed*g.loss/100);g.order=g.installed+g.spare;g.sheetArea=g.stock*g.developed*g.order/1e6;}
 const packaged=(installed,loss,pack)=>({installed,allowance:ceil(installed*(1+loss/100)),packs:ceil(ceil(installed*(1+loss/100))/pack),order:ceil(ceil(installed*(1+loss/100))/pack)*pack,packSize:pack});
 const openingFixings=v.openingExtra==='perEdge'?scope.segments.filter(s=>!s.kind.startsWith('wall')&&(s.kind!=='doorThreshold'||v.doorBottomBolts==='yes')).map(s=>({...s,count:screwCount(s.length,+v.openingBoltSpacing,+v.openingBoltInset,+v.openingBoltRows)})):[];
 const bolts={spec:v.boltSpec,main:sum(panels.map(p=>p.boltCount)),openingExtra:sum(openingFixings.map(f=>f.count)),openingFixings,...packaged(sum(panels.map(p=>p.boltCount))+sum(openingFixings.map(f=>f.count)),+v.boltLoss,+v.boltPack)};
 const screwResult=gate.flashingActive?{spec:v.screwSpec,...packaged(screws,+v.screwLoss,+v.screwPack)}:{spec:'미적용',installed:0,order:0,packs:0};
 const caulking=v.sealantMethod==='length'?caulkingPlan(scope,panels,flashing,{openingFlashing:v.caulkJunction}):null;
 const sealant=caulking?{spec:v.sealantSpec||'실리콘 · 사용자 시공 소요량',method:'length',lengthMm:caulking.length,yieldMm:+v.sealantYield,order:ceil(caulking.length*(1+ +v.sealantLoss/100)/+v.sealantYield),paths:caulking.segments,basis:caulking.basis}:gate.flashingActive?{spec:v.sealantSpec,installedMl:sealantMl,allowanceMl:sealantMl*(1+ +v.sealantLoss/100),cartridgeMl:+v.cartridgeMl,order:ceil(sealantMl*(1+ +v.sealantLoss/100)/+v.cartridgeMl)}:{spec:'미적용',installedMl:0,allowanceMl:0,order:0};
 const grossArea=sum(scope.walls.map(w=>w.polygons?polygonArea(w.polygons):rectArea(w)))/1e6,openingArea=sum(scope.openings.map(o=>o.polygons?polygonArea(o.polygons):rectArea(o)))/1e6,netArea=grossArea-openingArea;
 if(Math.abs(sum(panels.map(p=>p.netArea))-netArea)>Math.max(.000001,netArea*1e-9))throw Error('내부 검증 실패: 판넬 분할 면적과 외벽 순면적이 일치하지 않습니다. 결과를 발행하지 않습니다.');
 const result={engine:ENGINE,scope:v.scope,units:'mm',scale:scope.scale,grossArea,openingArea,netArea,panels,cutPlan,panelGroups:[...panelGroups.values()],flashing,flashingGroups:[...fg.values()],bolts,screws:screwResult,sealant,inputSnapshot:structuredClone(state),formulas:{panel:cutPlan?'동일 규격·발주 폭의 조각을 최소~최대 제작 길이로 합산. 잔재 최소 재료 길이 검증, 발주 장수의 전역 최소는 보장하지 않음':'길이별 실사용 조각 수 + 규격별 ceil(실사용 × 예비율)',bolt:'판넬별 하지 교차 연속구간 × 끝단/중간 볼트 수 + 명시된 개구부 추가 볼트; 할증 후 포장 올림',flashing:'구간별 max(1, ceil((순길이 − 겹침) / (정척 − 겹침))); 구간 간 잔재 재사용 없음',screw:v.commonQuantity?'후레싱 연속 구간마다 양끝 포함 (ceil(순길이 / 최대간격) + 1) × 줄 수; 별도 겹침 추가분은 입력한 경우만 적용':'조각별 (ceil((제작길이 − 양끝 이격 합계) / 최대간격) + 1) × 줄 수 + 겹침 추가분',sealant:caulking?'같은 물리적 코킹선의 중복을 제거한 총길이 / 통당 시공길이; 통 단위 올림':'도포길이 × 폭 × 깊이 × 단면계수 × 충진율 / 1000 = mL; 할증 후 통수 올림'}};
 if(scope.walls.some(w=>w.polygons))result.formulas.clipping=CLIPPING_POLICY;
 if(scope.walls.some(w=>w.recoveryGroup)||scope.openings.some(o=>o.recoveryGroup))result.formulas.reconstruction=RECOVERY_POLICY;
 if(v.commonQuantity){result.bolts.spec||='판넬 고정 볼트 · 수량 기준';result.screws.spec||='후레싱 고정 피스 · 수량 기준';result.quantityBasis='예비분·판매 포장 미반영 (별도 입력이 있으면 적용)';result.commonRules=structuredClone(state.commonRules);}
 if(!Number.isFinite(result.bolts.order)||result.panels.some(p=>!Number.isFinite(p.orderLength))||!Number.isFinite(result.sealant.order))throw Error('유한한 수량으로 계산할 수 없습니다. 입력 범위를 확인해주세요.');
 const counts=[result.bolts.order,result.screws.order,result.sealant.order,...result.panelGroups.map(g=>g.order),...result.flashingGroups.map(g=>g.order)];
 if(counts.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('수량이 정밀 정수 계산 범위를 벗어났습니다. 간격·단위·포장 수량을 확인해주세요.');
 return result;
}
