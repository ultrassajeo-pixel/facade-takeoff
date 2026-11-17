// Recover bounded faces from measured straight segments. No drafting gap is
// bridged: tolerance covers floating point noise only, not construction error.
import {MAX_DRAWING_ENTITIES} from './drawing-limits.mjs';
const EPS=1e-6,MAX_SEGMENTS=2000,MAX_EDGES=20000;
const cross=(a,b)=>a.x*b.y-a.y*b.x;
const sub=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const area=ps=>{const o=ps[0];return ps.reduce((n,p,i)=>n+cross(sub(p,o),sub(ps[(i+1)%ps.length],o)),0)/2;};
const on=(p,a,b)=>{
 const v=sub(b,a),w=sub(p,a),len=Math.hypot(v.x,v.y);
 return len>EPS&&Math.abs(cross(v,w))/len<=EPS&&w.x*v.x+w.y*v.y>=-EPS*len&&w.x*v.x+w.y*v.y<=len*len+EPS*len;
};
function position(p,ring){
 let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i];if(on(p,a,b))return 0;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }return inside?1:-1;
}
function canonical(points){
 let ps=points.slice(),changed=true;
 while(changed&&ps.length>3){changed=false;for(let i=0;i<ps.length;i++){
  if(on(ps[i],ps[(i+ps.length-1)%ps.length],ps[(i+1)%ps.length])){ps.splice(i,1);changed=true;break;}
 }}
 const first=ps.reduce((best,p,i)=>p.x<ps[best].x||(p.x===ps[best].x&&p.y<ps[best].y)?i:best,0);
 return [...ps.slice(first),...ps.slice(0,first)];
}
function eligible(s){return s.exact===true&&s.planar!==false&&s.visible!==false&&!s.clips?.length&&['LINE','LWPOLYLINE','POLYLINE2D','POLYLINE3D'].includes(s.type);}
export function recoverFaces(shapes){
 const segments=[];let cutCount=0;
 function cut(s,p){const key=`${Math.round(p.x/EPS)},${Math.round(p.y/EPS)}`;if(s.cutKeys.has(key))return;if(++cutCount>80000)throw Error('선 교차점 복원 한도를 초과했습니다.');s.cutKeys.add(key);s.cuts.push(p);}
 for(const s of [...shapes].sort((a,b)=>a.id.localeCompare(b.id))){
  if(!eligible(s))continue;
  if(!Array.isArray(s.points)||s.points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))continue;
  const ps=s.closed?[...s.points,s.points[0]]:s.points;
  for(let i=1;i<ps.length;i++)if(distance(ps[i-1],ps[i])>EPS){
   if(segments.length===MAX_SEGMENTS)throw Error('선 연결 복원 한도 2,000구간을 초과했습니다.');
   const segment={a:ps[i-1],b:ps[i],id:s.id,cuts:[],cutKeys:new Set(),edges:[]};cut(segment,segment.a);cut(segment,segment.b);segments.push(segment);
  }
 }
 // Split at crossings and at every endpoint on a collinear overlap.
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j];
  if(Math.max(a.a.x,a.b.x)+EPS<Math.min(b.a.x,b.b.x)||Math.max(b.a.x,b.b.x)+EPS<Math.min(a.a.x,a.b.x)||Math.max(a.a.y,a.b.y)+EPS<Math.min(b.a.y,b.b.y)||Math.max(b.a.y,b.b.y)+EPS<Math.min(a.a.y,a.b.y))continue;
  for(const p of [a.a,a.b])if(on(p,b.a,b.b)){cut(a,p);cut(b,p);}
  for(const p of [b.a,b.b])if(on(p,a.a,a.b)){cut(a,p);cut(b,p);}
  const r=sub(a.b,a.a),s=sub(b.b,b.a),den=cross(r,s);
  if(Math.abs(den)<=1e-12*Math.hypot(r.x,r.y)*Math.hypot(s.x,s.y))continue;
  const q=sub(b.a,a.a),t=cross(q,s)/den,u=cross(q,r)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1){const p={x:a.a.x+t*r.x,y:a.a.y+t*r.y};cut(a,p);cut(b,p);}
 }
 const nodes=[],buckets=new Map(),edges=new Map();
 function node(p){
  const x=Math.floor(p.x/EPS),y=Math.floor(p.y/EPS);
  for(let i=x-1;i<=x+1;i++)for(let j=y-1;j<=y+1;j++)for(const n of buckets.get(`${i},${j}`)||[])if(distance(nodes[n],p)<=EPS)return n;
  const key=`${x},${y}`,id=nodes.length;nodes.push({x:p.x,y:p.y,neighbors:[]});if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
 }
 const edgeKey=(a,b)=>a<b?`${a},${b}`:`${b},${a}`;
 for(const s of segments){
  const v=sub(s.b,s.a);s.cuts.sort((a,b)=>(a.x-b.x)*v.x+(a.y-b.y)*v.y);
  const ids=s.cuts.map(node).filter((id,i,a)=>i===0||id!==a[i-1]);
  for(let i=1;i<ids.length;i++){
   const a=ids[i-1],b=ids[i],key=edgeKey(a,b);s.edges.push(key);
   if(!edges.has(key)){
    if(edges.size===MAX_EDGES)throw Error('선 교차 복원 한도 20,000구간을 초과했습니다.');
    edges.set(key,{a,b,sources:new Set()});nodes[a].neighbors.push(b);nodes[b].neighbors.push(a);
   }edges.get(key).sources.add(s.id);
  }
 }
 // Prune dangling trees; their out-and-back walks are not material boundaries.
 const degree=nodes.map(n=>n.neighbors.length),queue=degree.flatMap((d,i)=>d<2?[i]:[]),removed=new Set();
 while(queue.length){const a=queue.pop();for(const b of nodes[a].neighbors){const key=edgeKey(a,b);if(removed.has(key))continue;removed.add(key);degree[b]--;if(degree[b]===1)queue.push(b);}}
 for(let a=0;a<nodes.length;a++)nodes[a].neighbors=nodes[a].neighbors.filter(b=>!removed.has(edgeKey(a,b))).sort((b,c)=>Math.atan2(nodes[b].y-nodes[a].y,nodes[b].x-nodes[a].x)-Math.atan2(nodes[c].y-nodes[a].y,nodes[c].x-nodes[a].x));
 const visited=new Set(),found=[];
 for(let a=0;a<nodes.length;a++)for(const b of nodes[a].neighbors){
  if(visited.has(`${a}>${b}`))continue;
  const walk=[],keys=[],sourceIds=new Set();let u=a,v=b,closed=false;
  for(let steps=0;steps<=edges.size*2;steps++){
   const k=`${u}>${v}`;if(visited.has(k)){closed=u===a&&v===b;break;}
   visited.add(k);walk.push(u);const key=edgeKey(u,v);keys.push(key);for(const id of edges.get(key).sources)sourceIds.add(id);
   const ns=nodes[v].neighbors,next=ns[(ns.indexOf(u)+ns.length-1)%ns.length];u=v;v=next;
  }
  if(!closed||walk.length<3||new Set(walk).size!==walk.length)continue;
  const points=canonical(walk.map(i=>({x:nodes[i].x,y:nodes[i].y}))),a2=area(points);
  if(a2>EPS*EPS)found.push({points,area:a2,sourceIds:[...sourceIds].sort(),keys});
 }
 const nested=new Set();
 for(let i=0;i<found.length;i++)for(let j=i+1;j<found.length;j++){
  const [small,big]=found[i].area<found[j].area?[i,j]:[j,i];
  const positions=found[small].points.map(p=>position(p,found[big].points));
  if(positions.every(p=>p>=0)&&positions.some(p=>p>0)){nested.add(i);nested.add(j);}
 }
 const accepted=found.filter((_,i)=>!nested.has(i)).sort((a,b)=>a.points[0].x-b.points[0].x||a.points[0].y-b.points[0].y||a.area-b.area);
 const used=new Set(accepted.flatMap(f=>f.sourceIds)),usedEdges=new Set(accepted.flatMap(f=>f.keys));
 const allIds=[...new Set(segments.map(s=>s.id))].sort();
 return {faces:accepted.map(({keys,...f})=>f),unusedSourceIds:allIds.filter(id=>!used.has(id)),
  coveredSourceIds:allIds.filter(id=>segments.filter(s=>s.id===id).every(s=>s.edges.length&&s.edges.every(k=>usedEdges.has(k)))),
  diagnostics:nested.size?[{code:'nested-boundaries',message:'중첩된 경계가 있어 내부 구멍과 재료 면의 구분을 보류했습니다.'}]:[]};
}
const candidateLayer=name=>/(?:^|[|_ -])(?:PANEL(?:S)?|GW\d+(?:\.\d+)?T)(?:$|[_ -])|판넬|패널|WALL[_ -]?OUTLINE|WINDOW[_ -]?OPENING|DOOR[_ -]?OPENING|외벽.*외곽|창문.*개구|출입구.*개구/i.test(name);
const hash=text=>{let n=2166136261;for(const c of text)n=Math.imul(n^c.charCodeAt(0),16777619);return (n>>>0).toString(16);};
export function reconstructRegions(drawing){
 if(drawing.reconstruction?.version===1)return drawing.reconstruction;
 const groups=new Map(),blocked=new Set((drawing.issues||[]).filter(i=>i.level==='blocker'&&i.handle).map(i=>i.handle)),hidden=new Set((drawing.layers||[]).filter(l=>l.off||l.frozen).map(l=>l.name));
 for(const s of drawing.shapes){
  if(!candidateLayer(s.layer||'')||hidden.has(s.layer)||!eligible(s)||blocked.has(s.handle)||blocked.has(s.sourceHandle))continue;
  const instance=s.instance??(s.id.includes('/')?s.id.slice(0,s.id.lastIndexOf('/')):'');
  const key=JSON.stringify([s.sourceFile||'',instance,s.layer,Math.round((s.planeZ||0)/EPS)*EPS]);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);
 }
 const result={version:1,faceCount:0,groups:[],diagnostics:[]},derived=[],planes=new Map();
 for(const [key,shapes] of groups){
  if(!shapes.some(s=>!s.closed))continue;
  try{
   const recovered=recoverFaces(shapes),groupId='region-'+hash(key),sourceMap=new Map(shapes.map(s=>[s.id,s]));
   if(derived.length+recovered.faces.length>10000||drawing.shapes.length+derived.length+recovered.faces.length>MAX_DRAWING_ENTITIES)throw Error('복원 영역 수가 처리 한도를 초과했습니다.');
   const faces=recovered.faces.map((f,index)=>{const xs=f.points.map(p=>p.x),ys=f.points.map(p=>p.y),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);return {id:`${groupId}/${index+1}`,handle:`R-${hash(key)}-${index+1}`,type:'RECOVERED_FACE',layer:shapes[0].layer,
    points:f.points,closed:true,exact:true,visible:true,planeZ:shapes[0].planeZ||0,sourceFile:shapes[0].sourceFile,
    reconstruction:{version:1,groupId,area:f.area,width:w,height:h,caution:Math.max(w,h)/Math.max(Math.min(w,h),EPS)>1000?'thin-region':null,sourceIds:f.sourceIds,sourceHandles:f.sourceIds.map(id=>sourceMap.get(id).handle),label:`영역 ${derived.length+index+1}`}};});
   if(faces.length){for(const s of shapes)if(s.closed&&recovered.coveredSourceIds.includes(s.id))s.scopeSourceOnly=true;derived.push(...faces);}
   result.groups.push({id:groupId,layer:shapes[0].layer,faceIds:faces.map(f=>f.id),sourceCount:shapes.length,unusedSourceIds:recovered.unusedSourceIds});
   result.diagnostics.push(...recovered.diagnostics.map(d=>({...d,layer:shapes[0].layer})));
   if(recovered.unusedSourceIds.length)result.diagnostics.push({code:'unclosed-lines',layer:shapes[0].layer,message:`${shapes[0].layer}: ${recovered.unusedSourceIds.length}개 선은 닫힌 영역으로 연결되지 않았습니다. 누락된 면으로 임의 보충하지 않습니다.`});
   const planeKey=JSON.parse(key).slice(0,3).join('|');if(!planes.has(planeKey))planes.set(planeKey,new Set());planes.get(planeKey).add(JSON.parse(key)[3]);
   if(faces.some(f=>f.reconstruction.caution))result.diagnostics.push({code:'thin-region',layer:shapes[0].layer,message:'매우 좁고 긴 복원 영역이 있습니다. 중복선·틈 여부가 해결되기 전에는 자재 면으로 산출하지 않습니다.'});
  }catch(error){result.diagnostics.push({code:'region-limit',layer:shapes[0].layer,message:error.message});}
 }
 for(const [key,zs] of planes)if(zs.size>1)result.diagnostics.push({code:'different-elevations',message:`${key.split('|').at(-1)}: 서로 다른 Z 평면 ${zs.size}개를 분리했습니다. 높이가 다른 선을 이어 면을 만들지 않습니다.`});
 drawing.shapes.push(...derived);result.faceCount=derived.length;drawing.reconstruction=result;
 return result;
}
