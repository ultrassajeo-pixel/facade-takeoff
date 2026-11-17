// Drawing interpretation is separate from material quantities. Uncertain geometry
// remains blocking, but a repeated pattern is one question, not one per CAD handle.
export const MATERIAL_PURPOSE='외벽 판넬·고정 볼트·후레싱·후레싱용 피스·실리콘 물량 산출 (노무비·장비비 제외)';
export const ROLE_LABELS={wall:'외벽 외곽',window:'창문 개구부',door:'출입구 개구부',exclude:'도곽·기호 등 제외'};
const ROLES=new Set(Object.keys(ROLE_LABELS));
export const isScopeCandidate=s=>s.closed&&!s.scopeSourceOnly;
const UNIT_CODES={1:'inch',2:'feet',4:'mm',5:'cm',6:'m'};
const annotationLayer=name=>/(?:^|[-_ ])(?:P[-_ ]?)?(?:SYM(?:BOL)?S?|ANNO(?:TATION)?|TEXT|DIMS?)(?:[-_ ]|\d|$)|주석|기호|치수/i.test((name||'').split('|').at(-1));
export function explicitLayerRole(layer=''){
 const name=layer.split('|').at(-1).trim();
 if(/^(?:A[-_ ])?(?:WALL[-_ ]?OUTLINES?|외벽[-_ ]?외곽)(?:[-_ ]?\d+)?$/i.test(name))return 'wall';
 if(/^(?:A[-_ ])?(?:WINDOW[-_ ]?OPENINGS?|창문[-_ ]?개구부?)(?:[-_ ]?\d+)?$/i.test(name))return 'window';
 if(/^(?:A[-_ ])?(?:DOOR[-_ ]?OPENINGS?|출입구?[-_ ]?개구부?)(?:[-_ ]?\d+)?$/i.test(name))return 'door';
 if(/^(?:A[-_ ])?(?:BORDER|TITLE[-_ ]?BLOCK|DRAWING[-_ ]?FRAME|도곽|표제란)(?:[-_ ]?\d+)?$/i.test(name))return 'exclude';
 return '';
}
function dimensionsOf(shape){let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;for(const p of shape.points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y);}return {x0,y0,x1,y1,width:x1-x0,height:y1-y0};}
function pattern(shape){
 const b=dimensionsOf(shape),number=x=>Number(x.toPrecision(8));
 // Translation is removed; dimensions, rotations and actual vertices are retained.
 const points=shape.points.map(p=>[number(p.x-b.x0),number(p.y-b.y0)]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 return JSON.stringify([shape.type,!!shape.exact,points]);
}
export function pendingScopeGroups(drawing,state){
 const groups=new Map();
 for(const shape of drawing.shapes||[]){
  if(!isScopeCandidate(shape)||ROLES.has(state.roles?.[shape.id]))continue;
  const annotation=annotationLayer(shape.layer),approximate=shape.exact===false,single=state.separateScope?.includes(shape.id);
  const recovered=!!shape.reconstruction;
  const key=JSON.stringify([shape.layer,single?shape.id:recovered?shape.reconstruction.groupId:annotation?'annotation-layer':approximate?'display-curves':pattern(shape)]);
  if(!groups.has(key))groups.set(key,{id:shape.id,layer:shape.layer||'이름 없는 레이어',shapes:[],annotation,approximate,recovered,byLayer:(annotation||approximate||recovered)&&!single,bounds:dimensionsOf(shape)});
  groups.get(key).shapes.push(shape);
 }
 return [...groups.values()].sort((a,b)=>Number(a.annotation)-Number(b.annotation)||(b.bounds.width*b.bounds.height-a.bounds.width*a.bounds.height));
}
export function scopeCounts(drawing,state){
 const counts={wall:0,window:0,door:0,exclude:0,unresolved:0};
 for(const s of drawing.shapes||[])if(isScopeCandidate(s))counts[ROLES.has(state.roles?.[s.id])?state.roles[s.id]:'unresolved']++;
 return counts;
}
export function settleScope(drawing,state){
 const counts=scopeCounts(drawing,state);state.scopeConfirmed=counts.wall>0&&counts.unresolved===0;return state.scopeConfirmed;
}
export function prepareScope(drawing,state,name='현재 도면'){
 state.roles||={};state.inputs||={};state.roleEvidence||={};const updates=[];
 const dimHandles=new Set((drawing.dimensions||[]).map(d=>d.handle));
 for(const s of drawing.shapes||[]){
  if(!isScopeCandidate(s)||ROLES.has(state.roles[s.id]))continue;
  const dimension=s.id.split('/').slice(0,-1).some(parent=>dimHandles.has(parent));
  const role=dimension?'exclude':explicitLayerRole(s.layer);if(!role)continue;
  const evidence=dimension?'DWG 치수 객체에 속하는 표시 도형':`명시된 레이어: ${s.layer}`;
  state.roles[s.id]=role;state.roleEvidence[s.id]={role,source:'도면 자동 해석',evidence};updates.push({id:s.id,role,evidence});
 }
 const inputs=[];
 if(!state.inputs.units&&UNIT_CODES[drawing.units]){state.inputs.units=UNIT_CODES[drawing.units];inputs.push({id:'units',value:state.inputs.units,evidence:`DWG INSUNITS=${drawing.units}`});}
 // The product's scope is fixed by the user's purpose; no repeated material-scope question.
 if(!state.inputs.scope){state.inputs.scope=`${name} · 도면에서 식별한 외벽 전체`;inputs.push({id:'scope',value:state.inputs.scope,evidence:MATERIAL_PURPOSE});}
 settleScope(drawing,state);state.scopeAnalysisVersion=1;return {updates,inputs};
}
export function applyScopeRole(drawing,state,ids,role){
 if(!ROLES.has(role))throw Error('지원하지 않는 도형 용도입니다.');
 const chosen=new Set(ids);state.roleEvidence||={};
 for(const s of drawing.shapes||[])if(isScopeCandidate(s)&&chosen.has(s.id)){state.roles[s.id]=role;state.roleEvidence[s.id]={role,source:'사용자 패턴 답변',evidence:`${s.layer} · ${ids.length}개 표시의 용도 답변`};}
 settleScope(drawing,state);
}
export function drawingContext(drawing,state){
 return {purpose:MATERIAL_PURPOSE,units:state.inputs.units||'미정',scope:state.inputs.scope||'',roles:scopeCounts(drawing,state),
  unresolvedGroups:pendingScopeGroups(drawing,state).slice(0,12).map(g=>({layer:g.layer,count:g.shapes.length,grouping:g.byLayer?'기호 레이어':'같은 모양·크기'})),
  scopeComplete:!!state.scopeConfirmed,geometryBlockers:(drawing.issues||[]).filter(i=>i.level==='blocker').slice(0,8).map(i=>i.message)};
}
