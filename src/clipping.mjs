import boolean from '../vendor/polygon-clipping/polygon-clipping.mjs';
const EPS=1e-7;
export const rectanglePolygon=r=>[[[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1],[r.x0,r.y0]]]];
export const pointsPolygon=points=>[[points.map(p=>[p.x,p.y])]];
export const polygonPoints=polys=>polys.flat(2).map(([x,y])=>({x,y}));
export const mapPolygons=(polys,fn)=>polys.map(p=>p.map(r=>r.map(([x,y])=>{const q=fn({x,y});return [q.x,q.y];})));
const ringArea=r=>Math.abs(r.reduce((n,a,i)=>{const b=r[(i+1)%r.length];return n+a[0]*b[1]-b[0]*a[1];},0)/2);
export const polygonArea=polys=>polys.reduce((n,p)=>n+ringArea(p[0])-p.slice(1).reduce((s,r)=>s+ringArea(r),0),0);
export const intersect=(a,b)=>a.length&&b.length?boolean.intersection(a,b):[];
export const difference=(a,b)=>!a.length?[]:!b.length?a:boolean.difference(a,b);
export function polygonBounds(polys){const ps=polygonPoints(polys);return {x0:Math.min(...ps.map(p=>p.x)),y0:Math.min(...ps.map(p=>p.y)),x1:Math.max(...ps.map(p=>p.x)),y1:Math.max(...ps.map(p=>p.y))};}
export function clipPolygons(polys,clips){
 for(const c of clips){polys=c.inverted?difference(polys,pointsPolygon(c.polygon)):intersect(polys,pointsPolygon(c.polygon));if(!polys.length)break;}
 return polys;
}
function inRing(p,r){let inside=false;
 for(let i=0,j=r.length-1;i<r.length;j=i++){
  const [ax,ay]=r[j],[bx,by]=r[i],dx=bx-ax,dy=by-ay;
  if(Math.abs(dx*(p.y-ay)-dy*(p.x-ax))<=EPS*Math.max(1,Math.hypot(dx,dy))&&p.x>=Math.min(ax,bx)-EPS&&p.x<=Math.max(ax,bx)+EPS&&p.y>=Math.min(ay,by)-EPS&&p.y<=Math.max(ay,by)+EPS)return 0;
  if((ay>p.y)!==(by>p.y)&&p.x<(bx-ax)*(p.y-ay)/(by-ay)+ax)inside=!inside;
 }return inside?1:-1;
}
export const inPolygons=(p,polys)=>polys.some(poly=>inRing(p,poly[0])>=0&&!poly.slice(1).some(r=>inRing(p,r)>0));
export const inClips=(p,clips)=>clips.every(c=>{const v=inRing(p,c.polygon.map(p=>[p.x,p.y]));return c.inverted?v<=0:v>=0;});
function partitionLine(a,b,rings,contains){
 const dx=b.x-a.x,dy=b.y-a.y,ts=[0,1],at=t=>({x:a.x+dx*t,y:a.y+dy*t});
 if(Math.hypot(dx,dy)<EPS)return contains(a)?[[a,b]]:[];
 for(const r of rings)for(let i=0;i<r.length;i++){
  const [x,y]=r[i],[xx,yy]=r[(i+1)%r.length],ex=xx-x,ey=yy-y,den=dx*ey-dy*ex;
  if(Math.abs(den)<EPS){if(Math.abs(dx*(y-a.y)-dy*(x-a.x))<EPS){for(const [px,py] of [[x,y],[xx,yy]]){const t=(Math.abs(dx)>Math.abs(dy)?(px-a.x)/dx:(py-a.y)/dy);if(t>0&&t<1)ts.push(t);}}continue;}
  const t=((x-a.x)*ey-(y-a.y)*ex)/den,u=((x-a.x)*dy-(y-a.y)*dx)/den;
  if(t>0&&t<1&&u>=-EPS&&u<=1+EPS)ts.push(t);
 }
 ts.sort((a,b)=>a-b);const unique=ts.filter((t,i)=>!i||t-ts[i-1]>1e-12),out=[];
 for(let i=1;i<unique.length;i++){const l=unique[i-1],h=unique[i];if(contains(at((l+h)/2))){const last=out.at(-1);if(last&&Math.hypot(last[1].x-at(l).x,last[1].y-at(l).y)<EPS)last[1]=at(h);else out.push([at(l),at(h)]);}}return out;
}
export const clipLine=(a,b,clips)=>partitionLine(a,b,clips.map(c=>c.polygon.map(p=>[p.x,p.y])),p=>inClips(p,clips));
export const polygonLine=(a,b,polys)=>partitionLine(a,b,polys.flat(),p=>inPolygons(p,polys));
export function validatePolygon(points){
 if(points.length<3||points.length>2000||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.max(Math.abs(p.x),Math.abs(p.y))>1e12))throw Error('XCLIP 경계 좌표 또는 처리 한도가 올바르지 않습니다.');
 if(polygonArea(pointsPolygon(points))<EPS)throw Error('XCLIP 경계 면적이 0입니다.');
 // Self-intersections and repeated bridging edges have ambiguous interior semantics.
 for(let i=0;i<points.length;i++)for(let j=i+2;j<points.length;j++){
  if(i===0&&j===points.length-1)continue;const a=points[i],b=points[(i+1)%points.length],c=points[j],d=points[(j+1)%points.length];
  const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  if(cross(a,b,c)*cross(a,b,d)<-EPS&&cross(c,d,a)*cross(c,d,b)<-EPS)throw Error('자기 교차 XCLIP 경계는 해석할 수 없습니다.');
 }
}
const identity=[1,0,0,0,0,1,0,0,0,0,1,0];
export function clipForInsert(db,e){
 const objects=db.objects||{},dicts=new Map((objects.DICTIONARY||[]).map(d=>[d.handle,d]));
 const ext=e.ownerDictionaryHardId||e.extensionDictionary;
 if(!ext||ext==='0')return null;
 const extension=dicts.get(ext);if(!extension)throw Error('XCLIP 확장 사전 연결을 해석할 수 없습니다.');
 const filterId=extension.entries?.ACAD_FILTER;if(!filterId)return null;
 const filters=dicts.get(filterId);if(!filters)throw Error('ACAD_FILTER 사전이 누락되었습니다.');
 const id=filters.entries?.SPATIAL;if(!id)return null;
 const f=(objects.SPATIAL_FILTER||[]).find(f=>f.handle===id);if(!f)throw Error('SPATIAL_FILTER 경계 객체가 누락되었습니다.');
 if(f.clipBoundaryVisible===false)return null; // DXF 71 enables clipping, not XCLIPFRAME.
 if(f.frontClippingPlaneFlag||f.backClippingPlaneFlag)throw Error('앞·뒤 깊이 평면이 있는 3D XCLIP은 아직 지원하지 않습니다.');
 const n=f.extrusionDirection||{x:0,y:0,z:1};if(Math.abs(n.x)>EPS||Math.abs(n.y)>EPS||Math.abs(n.z-1)>EPS||['x','y','z'].some(k=>Math.abs(f.origin?.[k]||0)>EPS))throw Error('XY 평면 밖의 XCLIP 경계입니다.');
 if(!Array.isArray(f.matrix)||f.matrix.length!==12||f.matrix.some((v,i)=>!Number.isFinite(v)||Math.abs(v-identity[i])>EPS))throw Error('지원하지 않는 XCLIP 경계 좌표계 변환입니다.');
 const m=f.invertBlockMatrix;
 if(!Array.isArray(m)||m.length!==12||m.some(v=>!Number.isFinite(v))||Math.abs(m[8])+Math.abs(m[9])+Math.abs(m[11])>EPS||Math.abs(m[0]*m[5]-m[1]*m[4])<1e-12)throw Error('XCLIP 역변환 행렬이 올바르지 않습니다.');
 let vertices=f.vertices||[],inverted=false;
 const roundtrip=dicts.get(f.extensionDictionary)?.entries?.ACAD_XREC_ROUNDTRIP;
 if(roundtrip){
  const record=(objects.XRECORD||[]).find(r=>r.handle===roundtrip);if(!record)throw Error('역방향 XCLIP 기록이 누락되었습니다.');
  let section='',inner=[];
  for(const tag of record.data||[]){if(tag.code===102)section=tag.value;else if(section==='ACAD_INVERTEDCLIP_ROUNDTRIP'&&tag.code===10)inner.push(tag.value);}
  if(inner.length){
   const expand=ps=>ps.length===2?[ps[0],{x:ps[1].x,y:ps[0].y},ps[1],{x:ps[0].x,y:ps[1].y}]:ps;
   const a=expand(vertices),b=expand(inner);validatePolygon(a);validatePolygon(b);
   // Both observed AutoCAD representations put the inner contour in one of these
   // fields. Require actual containment, rather than guessing by bounding-box area.
   if(polygonArea(difference(pointsPolygon(b),pointsPolygon(a)))<EPS)vertices=b;
   else if(polygonArea(difference(pointsPolygon(a),pointsPolygon(b)))<EPS)vertices=a;
   else throw Error('역방향 XCLIP 내부·외부 경계 관계를 확정할 수 없습니다.');
   inverted=true;
  }else throw Error('역방향 XCLIP 경계를 확정할 수 없습니다.');
 }
 if(vertices.length===2){const [a,b]=vertices;vertices=[a,{x:b.x,y:a.y},b,{x:a.x,y:b.y}];}
 const polygon=vertices.map(p=>({x:m[0]*p.x+m[1]*p.y+m[3],y:m[4]*p.x+m[5]*p.y+m[7]}));
 if(polygon.length>3&&Math.hypot(polygon[0].x-polygon.at(-1).x,polygon[0].y-polygon.at(-1).y)<EPS)polygon.pop();
 validatePolygon(polygon);return {handle:id,polygon,inverted};
}
