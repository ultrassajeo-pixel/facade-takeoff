// Display sampling only: these paths must not become exact quantity geometry.
const TAU=Math.PI*2;
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export function splinePoints(e){
 const p=e.degree,c=e.controlPoints||[],k=e.knots||[],w=e.weights||c.map(()=>1),n=c.length-1;
 if(!Number.isInteger(p)||p<1||p>10||c.length<=p||c.length>2000||c.some(v=>!point(v))||k.length!==c.length+p+1||k.some((v,i)=>!Number.isFinite(v)||(i&&v<k[i-1]))||w.length!==c.length||w.some(v=>!Number.isFinite(v)||v<=0)||!(k[n+1]>k[p]))throw Error('스플라인 제어점·매듭·가중치가 올바르지 않습니다.');
 const spans=[];for(let i=p;i<=n;i++)if(k[i+1]>k[i])spans.push(i);
 if(spans.length>128)throw Error('스플라인 표시 구간이 처리 한도를 초과했습니다.');
 const out=[];
 for(const span of spans)for(let step=0;step<=24;step++){
  if(out.length&&step===0)continue;
  const u=k[span]+(k[span+1]-k[span])*step/24;
  const d=Array.from({length:p+1},(_,j)=>{const i=span-p+j;return [c[i].x*w[i],c[i].y*w[i],w[i]];});
  for(let r=1;r<=p;r++)for(let j=p;j>=r;j--){const i=span-p+j,den=k[i+p-r+1]-k[i],a=den?(u-k[i])/den:0;for(let q=0;q<3;q++)d[j][q]=(1-a)*d[j-1][q]+a*d[j][q];}
  const [x,y,weight]=d[p];if(!Number.isFinite(weight)||weight<=0)throw Error('스플라인 평가값이 유효하지 않습니다.');out.push({x:x/weight,y:y/weight});
 }
 return out;
}
function sweep(start,end,ccw=true){let angle=(end-start)%TAU;if(Math.abs(angle)<1e-12)return ccw?TAU:-TAU;return ccw?(angle+TAU)%TAU:-((TAU-angle)%TAU);}
export function ellipsePoints(e,ccw=true){
 const c=e.center,a=e.majorAxisEndPoint,r=e.axisRatio;
 if(!point(c)||!point(a)||!Number.isFinite(r)||r<=0||r>1||Math.hypot(a.x,a.y)===0||!Number.isFinite(e.startAngle)||!Number.isFinite(e.endAngle))throw Error('타원 좌표가 올바르지 않습니다.');
 const angle=sweep(e.startAngle,e.endAngle,ccw),steps=Math.max(2,Math.ceil(Math.abs(angle)/TAU*80));
 return Array.from({length:steps+1},(_,i)=>{const t=e.startAngle+angle*i/steps;return {x:c.x+a.x*Math.cos(t)-a.y*r*Math.sin(t),y:c.y+a.y*Math.cos(t)+a.x*r*Math.sin(t)};});
}
function arc(c,r,start,end,ccw){return ellipsePoints({center:c,majorAxisEndPoint:{x:r,y:0},axisRatio:1,startAngle:start,endAngle:end},ccw);}
function bulge(a,b,v){
 if(!v)return [a,b];const chord=distance(a,b);if(!chord)return [a];
 const c={x:(a.x+b.x)/2-(b.y-a.y)*(1-v*v)/(4*v),y:(a.y+b.y)/2+(b.x-a.x)*(1-v*v)/(4*v)};
 const start=Math.atan2(a.y-c.y,a.x-c.x);return arc(c,chord*(1+v*v)/(4*Math.abs(v)),start,start+4*Math.atan(v),v>0);
}
export function hatchPaths(e){
 const loops=e.boundaryPaths||[];if(!loops.length||loops.length>2000)throw Error('해치 경계가 없거나 표시 한도를 초과했습니다.');
 return loops.map(loop=>{
  let ps=[];
  if(loop.vertices){
   const vs=loop.vertices;if(!loop.isClosed||vs.length<2||vs.length>10000||vs.some(p=>!point(p)))throw Error('해치 폴리라인 경계가 닫히지 않았습니다.');
   for(let i=0;i<vs.length;i++)ps.push(...bulge(vs[i],vs[(i+1)%vs.length],vs[i].bulge||0).slice(0,-1));
  }else{
   if(!loop.edges?.length||loop.edges.length>10000)throw Error('해치 경계 선분 정보가 없습니다.');
   for(const edge of loop.edges){let segment;
    if(edge.type===1)segment=[edge.start,edge.end];
    else if(edge.type===2)segment=arc(edge.center,edge.radius,edge.startAngle,edge.endAngle,!!edge.isCCW);
    else if(edge.type===3)segment=ellipsePoints({center:edge.center,majorAxisEndPoint:edge.end,axisRatio:edge.lengthOfMinorAxis,startAngle:edge.startAngle,endAngle:edge.endAngle},!!edge.isCCW);
    else if(edge.type===4)segment=splinePoints({...edge,controlPoints:edge.controlPoints?.map(p=>p.point||p),weights:edge.isRational?edge.controlPoints?.map(p=>p.weight??p.w):undefined});
    else throw Error('지원하지 않는 해치 경계 선분입니다.');
    if(segment.some(p=>!point(p))||(ps.length&&distance(ps.at(-1),segment[0])>1e-5))throw Error('해치 경계 선분이 연결되지 않았습니다.');
    ps.push(...(ps.length?segment.slice(1):segment));
   }
   if(distance(ps[0],ps.at(-1))>1e-5)throw Error('해치 경계 선분이 닫히지 않았습니다.');ps.pop();
  }
  if(ps.length<3||ps.length>100000)throw Error('해치 경계 표시 한도를 초과했습니다.');return ps;
 });
}
