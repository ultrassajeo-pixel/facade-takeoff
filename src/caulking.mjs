import {polygonLine} from './clipping.mjs';
const EPS=1e-6;
const same=(a,b)=>Math.abs(a-b)<EPS;
const key=x=>Math.round(x*1e6)/1e6;
export function mergeCaulkLines(lines,{shared=true}={}){
 const groups=new Map();for(const l of lines){if(![l.coordinate,l.start,l.end,l.count].every(Number.isFinite)||l.end<=l.start||l.count<1||!Number.isInteger(l.count))throw Error('코킹 경로가 유효하지 않습니다.');const k=JSON.stringify([l.wallId,l.axis,key(l.coordinate),shared?'shared':l.family]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(l);}
 const merged=[];for(const ls of groups.values()){
  const points=[...new Set(ls.flatMap(l=>[l.start,l.end]))].sort((a,b)=>a-b);
  for(let i=1;i<points.length;i++){const start=points[i-1],end=points[i];if(end-start<EPS)continue;const active=ls.filter(l=>l.start<end-EPS&&l.end>start+EPS);if(!active.length)continue;const count=Math.max(...active.map(l=>l.count));merged.push({wallId:ls[0].wallId,axis:ls[0].axis,coordinate:ls[0].coordinate,start,end,count,length:(end-start)*count,sources:[...new Set(active.map(l=>l.source))]});}
 }
 return {segments:merged,length:merged.reduce((n,l)=>n+l.length,0)};
}
export function caulkingPlan(scope,panels,flashing,{openingFlashing}={}){
 if(flashing.some(s=>!s.kind.startsWith('wall'))&&!['shared','separate'].includes(openingFlashing))throw Error('창호 접합부와 후레싱 측면의 코킹이 같은 선인지 상세도에서 확인해야 합니다.');
 const lines=[],edgeMap=new Map();
 const add=(wallId,axis,coordinate,start,end,family,source,count=1,visibility)=>{
  if(end-start<=EPS)return;const wall=scope.walls.find(w=>w.id===wallId);let pairs=[[start,end]];
  for(const polys of [visibility,wall?.polygons].filter(Boolean))pairs=pairs.flatMap(([l,h])=>polygonLine(axis==='x'?{x:coordinate,y:l}:{x:l,y:coordinate},axis==='x'?{x:coordinate,y:h}:{x:h,y:coordinate},polys).map(([a,b])=>axis==='x'?[a.y,b.y]:[a.x,b.x]));
  for(const [start,end] of pairs)if(end-start>EPS)lines.push({wallId,axis,coordinate,start,end,family,source,count});
 };
 for(const p of panels)for(const r of p.cells)for(const [axis,coordinate,start,end,side] of [['x',r.x0,r.y0,r.y1,-1],['x',r.x1,r.y0,r.y1,1],['y',r.y0,r.x0,r.x1,-1],['y',r.y1,r.x0,r.x1,1]]){
  const k=JSON.stringify([p.sourceId,axis,key(coordinate)]);if(!edgeMap.has(k))edgeMap.set(k,[]);edgeMap.get(k).push({wallId:p.sourceId,axis,coordinate,start,end,side,panelId:p.id});
 }
 for(const p of panels)for(const poly of p.polygons||[])for(const ring of poly)for(let i=1;i<ring.length;i++){
  const [ax,ay]=ring[i-1],[bx,by]=ring[i];let axis,coordinate,start,end,side;
  if(same(ax,bx)){axis='x';coordinate=ax;start=Math.min(ay,by);end=Math.max(ay,by);side=by>ay?1:-1;}
  else if(same(ay,by)){axis='y';coordinate=ay;start=Math.min(ax,bx);end=Math.max(ax,bx);side=bx>ax?-1:1;}else continue;
  const k=JSON.stringify([p.sourceId,axis,key(coordinate)]);if(!edgeMap.has(k))edgeMap.set(k,[]);edgeMap.get(k).push({wallId:p.sourceId,axis,coordinate,start,end,side,panelId:p.id});
 }
 let comparisons=0;for(const es of edgeMap.values()){const low=es.filter(e=>e.side<0),high=es.filter(e=>e.side>0);for(const a of low)for(const b of high){if(++comparisons>4000000)throw Error('판넬 접합부 경로 계산 한도를 초과했습니다.');if(a.panelId===b.panelId)continue;add(a.wallId,a.axis,a.coordinate,Math.max(a.start,b.start),Math.min(a.end,b.end),'panel',`판넬 ${a.panelId}/${b.panelId}`);}}
 for(const w of scope.walls)for(const o of w.openings){
  if(!same(o.x0,w.x0))add(w.id,'x',o.x0,o.y0,o.y1,'opening',`창호 ${o.handle} 좌측`,1,o.polygons);
  if(!same(o.x1,w.x1))add(w.id,'x',o.x1,o.y0,o.y1,'opening',`창호 ${o.handle} 우측`,1,o.polygons);
  if(!same(o.y0,w.y0))add(w.id,'y',o.y0,o.x0,o.x1,'opening',`창호 ${o.handle} 하부`,1,o.polygons);
  if(!same(o.y1,w.y1))add(w.id,'y',o.y1,o.x0,o.x1,'opening',`창호 ${o.handle} 상부`,1,o.polygons);
 }
 for(const s of flashing){if(!s.path)throw Error('후레싱 코킹 경로 좌표가 없습니다.');add(s.path.wallId,s.path.axis,s.path.coordinate,s.path.start,s.path.end,'flashing',`후레싱 ${s.id} 양측`,2);}
 const plan=mergeCaulkLines(lines,{shared:openingFlashing!=='separate'});return {...plan,basis:'판넬 이음 + 판넬에 접하는 창호 경계 + 설치 후레싱 양측; 같은 경로 중복 제거',topology:openingFlashing||'no-opening-flashing'};
}
