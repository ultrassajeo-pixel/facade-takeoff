// XCLIP is a visibility mask: retain the original panel/support grid and physical edges.
import {listNumbers} from './rules.mjs';
import {rectanglePolygon,intersect,difference,polygonArea,polygonBounds,mapPolygons,polygonLine} from './clipping.mjs';
const EPS=1e-6,ceil=n=>Math.ceil(n-1e-9),transpose=(r,h)=>h?{...r,x0:r.y0,y0:r.x0,x1:r.y1,y1:r.x1}:r;
export function clippedPanels(source,v,seams,offset=0){
 const horizontal=v.direction==='horizontal',swap=p=>horizontal?{x:p.y,y:p.x}:p;
 const w=transpose(source,horizontal),visible=mapPolygons(source.polygons,swap),holes=source.openings.map(o=>mapPolygons(o.polygons||rectanglePolygon(o),swap));
 const height=w.y1-w.y0,pw=+v.panelWidth,n=ceil((w.x1-w.x0)/pw),cuts=[w.y0,...seams.map(x=>x+w.y0),w.y1],panels=[];
 const positions=listNumbers(v.supportPositions||'없음')||[];
 const supports=v.supportMode==='positions'?positions.map(x=>x+w.y0):Array.from({length:Math.max(0,Math.floor((height-+v.supportOffset)/+v.supportSpacing+1e-9)+1)},(_,i)=>w.y0+ +v.supportOffset+i*+v.supportSpacing);
 if(n*(cuts.length-1)>20000)throw Error('XCLIP 판넬 분할 한도를 초과했습니다.');
 for(let col=0;col<n;col++)for(let row=0;row<cuts.length-1;row++){
  const x0=v.startSide==='low'?w.x0+col*pw:Math.max(w.x0,w.x1-(col+1)*pw),x1=v.startSide==='low'?Math.min(w.x1,x0+pw):w.x1-col*pw;
  const rect={x0,x1,y0:cuts[row],y1:cuts[row+1]},gross=intersect(rectanglePolygon(rect),visible);if(!gross.length)continue;
  let material=gross,originalMaterial=rectanglePolygon(rect);
  for(const h of holes)material=difference(material,h);
  // Unclipped opening rectangles define real component ends, never the clipping boundary.
  for(const o of source.openings)originalMaterial=difference(originalMaterial,rectanglePolygon(transpose(o,horizontal)));
  const realEnds=originalMaterial.flatMap(p=>{const b=polygonBounds([p]);return [b.y0,b.y1];});
  const groups=v.openings==='cut'?gross:material;
  for(const group of groups){
   const polygons=intersect(material,[group]);if(polygonArea(polygons)<EPS)continue;
   const b=polygonBounds(v.openings==='cut'?[group]:polygons),isJoint=row<cuts.length-2&&Math.abs(b.y1-cuts[row+1])<EPS,lap=isJoint?+v.panelLap:0;
   if(isJoint&&lap>=cuts[row+2]-cuts[row+1]-EPS&&lap>0)throw Error('판넬 겹침이 다음 이음 구간 길이 이상입니다.');
   const required=b.y1-b.y0+lap+ +v.trim,rounded=ceil(required/+v.lengthStep)*+v.lengthStep,orderLength=v.procurement==='fixed'?+v.stockPanelLength:rounded;
   if(orderLength+EPS<required||orderLength>+v.maxLength+EPS)throw Error(`외벽 ${source.handle}: 표시 영역의 주문 길이 ${rounded} mm가 허용 길이를 초과합니다.`);
   const runCount=y=>polygonLine({x:b.x0,y},{x:b.x1,y},polygons).filter(([a,c])=>Math.hypot(a.x-c.x,a.y-c.y)>EPS).length;
   const visibleRuns=y=>Math.max(runCount(Math.max(b.y0+EPS,Math.min(b.y1-EPS,y-.001))),runCount(Math.max(b.y0+EPS,Math.min(b.y1-EPS,y+.001))));
   const coords=[...supports];if(v.endSupport==='yes')coords.push(...realEnds);
   for(const end of realEnds)if(end>=b.y0-EPS&&end<=b.y1+EPS&&visibleRuns(end)&&!coords.some(y=>Math.abs(y-end)<EPS))throw Error(`외벽 ${source.handle}: 표시된 실제 판넬 끝단의 하지 위치가 없습니다.`);
   let boltCount=0;const fixingRows=[];
   for(const y of [...new Set(coords.map(y=>Math.round(y*1e6)/1e6))].sort((a,b)=>a-b)){
    if(y<b.y0-EPS||y>b.y1+EPS)continue;
    const end=realEnds.some(e=>Math.abs(e-y)<EPS),runs=visibleRuns(y),count=runs*(end?+v.endBolts:+v.middleBolts);boltCount+=count;
    if(count)fixingRows.push({position:y-w.y0,segments:runs,classification:end?'끝단':'중간',count});
   }
   const area=polygonArea(polygons);panels.push({id:`P${String(offset+panels.length+1).padStart(4,'0')}`,wall:source.handle,sourceId:source.id,column:col+1,row:row+1,cutWidth:b.x1-b.x0,installedLength:b.y1-b.y0,lap,orderLength,orderWidth:+v.orderWidth,netArea:area/1e6,boltCount,fixingRows,rect:transpose(b,horizontal),cells:[],polygons:mapPolygons(polygons,swap),offcutArea:(+v.orderWidth*orderLength-area)/1e6,clipped:true});
   if(offset+panels.length>20000)throw Error('XCLIP 판넬 수가 처리 한도를 초과했습니다.');
  }
 }return panels;
}
