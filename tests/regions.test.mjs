import test from 'node:test';
import assert from 'node:assert/strict';
import {recoverFaces,reconstructRegions} from '../src/regions.mjs';
import {prepareScope,pendingScopeGroups,applyScopeRole} from '../src/scope.mjs';
import {initialTakeoff} from '../src/rules.mjs';
import {extractScope} from '../src/takeoff.mjs';
import {normalizeDrawing} from '../src/geometry.mjs';
import {validateProject} from '../src/project.mjs';
import fs from 'node:fs';
import {RECOVERY_POLICY} from '../src/common-rules.mjs';
const line=(id,a,b,extra={})=>({id,handle:id,layer:'PANEL',type:'LINE',exact:true,closed:false,points:[a,b].map(([x,y])=>({x,y})),...extra});
const frame=(x=0,y=0,w=6000,h=3000,p='')=>[line(p+'a',[x,y],[x+w,y]),line(p+'b',[x+w,y],[x+w,y+h]),line(p+'c',[x+w,y+h],[x,y+h]),line(p+'d',[x,y+h],[x,y])];
const drawing=shapes=>({shapes,units:4,dimensions:[],texts:[],issues:[],closedCandidates:[]});
test('recovery policy in calculation code matches the shared rule configuration',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('../config/common-rules.json',import.meta.url)));
 assert.equal(config.implementationPolicies.reconstructedRegions,RECOVERY_POLICY);
});
test('four separate lines become one exact face with stable provenance, independent of input order',()=>{
 const ss=frame(),a=recoverFaces(ss),b=recoverFaces([...ss].reverse());
 assert.equal(a.faces.length,1);assert.equal(a.faces[0].area,18000000);assert.deepEqual(a.faces,b.faces);
 assert.deepEqual(a.faces[0].sourceIds,['a','b','c','d']);assert.equal(a.unusedSourceIds.length,0);
});
test('crossings, T junctions, overlaps and duplicate lines produce disjoint bounded faces',()=>{
 const ss=[...frame(),line('v',[3000,-500],[3000,3500]),line('h',[0,1500],[6000,1500]),line('dup',[6000,0],[0,0]),line('part',[1000,0],[5000,0])];
 const r=recoverFaces(ss);assert.equal(r.faces.length,4);assert.equal(r.faces.reduce((n,f)=>n+f.area,0),18000000);
 assert.ok(r.faces.every(f=>f.sourceIds.includes('v')&&f.sourceIds.includes('h')));
});
test('real-sized gaps are not snapped closed, and dangling lines do not create material',()=>{
 const ss=frame();ss[3].points[1].y=5;
 assert.equal(recoverFaces(ss).faces.length,0);
 assert.equal(recoverFaces([...frame(),line('tail',[6000,1500],[9000,1500])]).faces.length,1);
});
test('a missing polyline closed flag is accepted only if its endpoint actually returns to its start',()=>{
 const s={...line('p',[0,0],[1,0]),type:'LWPOLYLINE',points:[[0,0],[6000,0],[6000,3000],[0,3000],[0,0]].map(([x,y])=>({x,y}))};
 assert.equal(recoverFaces([s]).faces.length,1);s.points.pop();assert.equal(recoverFaces([s]).faces.length,0);
});
test('nested disconnected rings are deferred rather than filling a potential opening',()=>{
 const r=recoverFaces([...frame(),...frame(1000,1000,1000,1000,'hole')]);
 assert.equal(r.faces.length,0);assert.ok(r.diagnostics.some(d=>d.code==='nested-boundaries'));
});
test('sloping straight edges can recover a face without pretending it is a rectangle',()=>{
 const r=recoverFaces([line('a',[0,0],[6000,0]),line('b',[6000,0],[3000,3000]),line('c',[3000,3000],[0,0])]);
 assert.equal(r.faces.length,1);assert.equal(r.faces[0].area,9000000);
});
test('numerical tolerance does not lose precision at DWG survey coordinates',()=>{
 const ss=frame(500000,80000);ss[0].points[1].x+=1e-8;
 const r=recoverFaces(ss);assert.equal(r.faces.length,1);assert.ok(Math.abs(r.faces[0].area-18000000)<.01);
});
test('unsupported curves, nonplanar geometry and clipped fragments do not silently close faces',()=>{
 for(const extra of [{exact:false},{planar:false},{clips:[{polygon:[{x:0,y:0},{x:1,y:0},{x:0,y:1}]}]}]){
  const ss=frame();Object.assign(ss[3],extra);assert.equal(recoverFaces(ss).faces.length,0);
 }
});
test('reconstruction is bounded before quadratic work',()=>{
 assert.throws(()=>recoverFaces(Array.from({length:2001},(_,i)=>line('s'+i,[i,0],[i,1]))),/한도/);
});
test('material regions become one explicit scope question, preserve originals and never become automatic panel counts',()=>{
 const d=drawing([...frame(),line('joint',[3000,0],[3000,3000])]);reconstructRegions(d);
 const s=initialTakeoff();prepareScope(d,s);const groups=pendingScopeGroups(d,s);
 assert.equal(d.reconstruction.faceCount,2);assert.equal(d.shapes.filter(s=>s.type==='LINE').length,5);
 assert.equal(groups.length,1);assert.equal(groups[0].shapes.length,2);assert.equal(s.scopeConfirmed,false);
 applyScopeRole(d,s,groups[0].shapes.map(x=>x.id),'wall');assert.equal(extractScope(d,s).walls.length,1);
 assert.equal(extractScope(d,s).errors.length,0);
 reconstructRegions(d);assert.equal(d.shapes.filter(s=>s.type==='RECOVERED_FACE').length,2);
});
test('internal recovered lines do not create extra outer flashing edges or separate panel origins',()=>{
 const d=drawing([...frame().map(s=>({...s,layer:'WALL_OUTLINE'})),line('internal',[3000,0],[3000,3000],{layer:'WALL_OUTLINE'})]);
 reconstructRegions(d);const s=initialTakeoff();prepareScope(d,s);const scope=extractScope(d,s);
 assert.equal(scope.walls.length,1);assert.equal(scope.segments.length,4);
 assert.equal(scope.segments.reduce((n,s)=>n+s.length,0),18000);
});
test('internal window drafting lines do not double-count jamb flashing',()=>{
 const d=drawing([...frame().map(s=>({...s,layer:'WALL_OUTLINE'})),...frame(1000,500,2000,1000,'o').map(s=>({...s,layer:'WINDOW_OPENING'})),line('internal',[2000,500],[2000,1500],{layer:'WINDOW_OPENING'})]);
 reconstructRegions(d);const s=initialTakeoff();prepareScope(d,s);const scope=extractScope(d,s);
 assert.equal(scope.openings.length,1);assert.equal(scope.errors.length,0);
 assert.equal(scope.segments.filter(s=>s.kind.startsWith('window')).reduce((n,s)=>n+s.length,0),6000);
});
test('an L-shaped recovered material union remains blocked instead of taking its bounding rectangle',()=>{
 const d=drawing([...frame(),line('v',[3000,0],[3000,3000]),line('h',[0,1500],[6000,1500])]);
 reconstructRegions(d);const s=initialTakeoff();prepareScope(d,s);
 const faces=d.shapes.filter(s=>s.reconstruction);applyScopeRole(d,s,faces.slice(0,3).map(s=>s.id),'wall');
 assert.ok(extractScope(d,s).errors.some(e=>e.id.startsWith('region-union')));
});
test('known outlines and openings made of lines enter the existing calculation scope without duplicate parent shapes',()=>{
 const d=drawing([...frame().map(s=>({...s,layer:'WALL_OUTLINE'})),...frame(1000,500,1000,1000,'o').map(s=>({...s,layer:'WINDOW_OPENING'}))]);
 reconstructRegions(d);const s=initialTakeoff();prepareScope(d,s);const scope=extractScope(d,s);
 assert.equal(scope.walls.length,1);assert.equal(scope.openings.length,1);assert.equal(scope.errors.length,0);assert.equal(s.scopeConfirmed,true);
});
test('source-file, block-instance and elevation boundaries cannot manufacture a composite face',()=>{
 for(const field of ['sourceFile','instance','planeZ']){
  const ss=frame();ss[0][field]=field==='planeZ'?5:'other';
  const d=drawing(ss);reconstructRegions(d);assert.equal(d.reconstruction.faceCount,0,field);
 }
});
test('subdivided closed parents are retained for provenance but excluded from duplicate scope candidates',()=>{
 const ss=frame(),p={...ss[0],type:'LWPOLYLINE',closed:true,points:ss.map(s=>s.points[0])};
 const d=drawing([p,line('j',[3000,0],[3000,3000])]);reconstructRegions(d);
 assert.equal(d.reconstruction.faceCount,2);assert.equal(p.scopeSourceOnly,true);
 const s=initialTakeoff();prepareScope(d,s);assert.equal(pendingScopeGroups(d,s)[0].shapes.length,2);
});
test('DWG polyline elevation and INSERT Z transforms stay separate during face reconstruction',()=>{
 const entities=frame().map(s=>({type:'LINE',handle:s.id,layer:'PANEL',startPoint:{...s.points[0],z:0},endPoint:{...s.points[1],z:0}}));
 entities[0]={type:'LWPOLYLINE',handle:'a',layer:'PANEL',vertices:frame()[0].points,elevation:10,flag:0};
 const d=normalizeDrawing({database:{entities,tables:{},header:{INSUNITS:4}}});assert.equal(d.reconstruction.faceCount,0);
 assert.equal(d.shapes.find(s=>s.handle==='a').planeZ,10);
 const b=normalizeDrawing({database:{entities:[{type:'INSERT',handle:'I',layer:'0',name:'B',insertionPoint:{x:0,y:0,z:5},zScale:2}],tables:{BLOCK_RECORD:{entries:[{name:'B',basePoint:{x:0,y:0,z:1},entities}]}},header:{INSUNITS:4}}});
 assert.equal(b.shapes.find(s=>s.handle==='a').planeZ,23);assert.equal(b.reconstruction.faceCount,0);
});
test('2D polyline OCS elevation takes precedence over zero-valued vertex Z',()=>{
 for(const type of ['POLYLINE2D','LWPOLYLINE']){
  const entities=frame().map((s,i)=>({type,handle:s.id,layer:'WALL_OUTLINE',vertices:s.points.map(p=>({...p,z:0})),elevation:i===0?500:0,flag:0}));
  const d=normalizeDrawing({database:{entities,tables:{},header:{INSUNITS:4}}});
  assert.equal(d.shapes.find(s=>s.handle==='a').planeZ,500,type);assert.equal(d.reconstruction.faceCount,0,type);
 }
});
test('saved recovered geometry must match its original sources and survives validation without losing provenance',()=>{
 const d=drawing(frame());d.layers=[];d.bounds={minX:0,minY:0,maxX:6000,maxY:3000};reconstructRegions(d);
 const p={schema:'facade-workspace/0.2',file:{name:'test.dwg'},drawing:d,takeoff:initialTakeoff()};
 assert.equal(validateProject(structuredClone(p)).drawing.reconstruction.faceCount,1);
 const wrong=structuredClone(p);wrong.drawing.shapes.at(-1).points[0].x+=10;assert.throws(()=>validateProject(wrong),/복원/);
 const hidden=structuredClone(p);hidden.drawing.shapes[0].scopeSourceOnly=true;assert.throws(()=>validateProject(hidden),/복원/);
});
test('off layers do not produce recovered material and extremely thin regions remain flagged',()=>{
 const d=drawing(frame(0,0,5,38000));reconstructRegions(d);assert.equal(d.shapes.at(-1).reconstruction.caution,'thin-region');
 const off=drawing(frame());off.layers=[{name:'PANEL',off:true}];reconstructRegions(off);assert.equal(off.reconstruction.faceCount,0);
});
