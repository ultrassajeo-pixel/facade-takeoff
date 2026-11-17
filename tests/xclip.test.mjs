import test from 'node:test';import assert from 'node:assert/strict';
import {clipForInsert,clipPolygons,polygonArea,rectanglePolygon,clipLine} from '../src/clipping.mjs';
import {normalizeDrawing} from '../src/geometry.mjs';import {assembleReferences} from '../src/xrefs.mjs';
import {calculate} from '../src/takeoff.mjs';import {sampleConditions} from '../src/sample.mjs';import {prepareScope} from '../src/scope.mjs';
const matrix=[1,0,0,0,0,1,0,0,0,0,1,0];
const filter=(vertices=[{x:0,y:0},{x:6000,y:6000}],extra={})=>({handle:'F',ownerHandle:'D2',vertices,clipBoundaryVisible:true,invertBlockMatrix:matrix,matrix,extrusionDirection:{x:0,y:0,z:1},origin:{x:0,y:0,z:0},...extra});
const rect=(x,y,w,h,layer='WALL_OUTLINE',handle='W')=>({type:'LWPOLYLINE',handle,layer,flag:512,vertices:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
function fixture(f=filter(),entities=[rect(0,0,12000,6000)],extra={}){
 const objects={DICTIONARY:[{handle:'D1',entries:{ACAD_FILTER:'D2'}},{handle:'D2',entries:{SPATIAL:'F'}}],SPATIAL_FILTER:[f]};
 const insert={type:'INSERT',handle:'I',name:'face',ownerDictionaryHardId:'D1',layer:'0',insertionPoint:{x:1000,y:2000},...extra};
 const main={path:'host.dwg',file:{size:1},parsed:{database:{entities:[insert],tables:{BLOCK_RECORD:{entries:[{name:'face',flags:4,xrefPath:'face.dwg'}]}},header:{INSUNITS:4},objects}}};
 const source={path:'face.dwg',file:{size:1},parsed:{database:{entities,tables:{},header:{INSUNITS:4}}}};
 return {mainPath:main.path,sources:[main,source]};
}
const draw=b=>normalizeDrawing(assembleReferences(b));
test('XCLIP is owned by its INSERT; OFF ignores boundary, missing linkage fails closed',()=>{
 const b=fixture();const db=b.sources[0].parsed.database;
 assert.equal(clipForInsert(db,db.entities[0]).polygon.length,4);
 db.objects.SPATIAL_FILTER[0].clipBoundaryVisible=false;assert.equal(clipForInsert(db,db.entities[0]),null);
 db.objects.DICTIONARY[1].entries.SPATIAL='missing';assert.throws(()=>clipForInsert(db,db.entities[0]),/SPATIAL/);
});
test('polygon intersection, inverse hole and concave split retain exact area and segment lengths',()=>{
 const square=rectanglePolygon({x0:0,y0:0,x1:10,y1:10});
 const triangle={polygon:[{x:0,y:0},{x:10,y:0},{x:0,y:10}]};
 assert.equal(polygonArea(clipPolygons(square,[triangle])),50);
 assert.equal(polygonArea(clipPolygons(square,[{polygon:[{x:2,y:2},{x:8,y:2},{x:8,y:8},{x:2,y:8}],inverted:true}])),64);
 assert.deepEqual(clipLine({x:0,y:5},{x:10,y:5},[{...triangle}]),[[{x:0,y:5},{x:5,y:5}]]);
});
test('native matrix order, insert translation and rotation apply to each clip instance',()=>{
 const f=filter([{x:100,y:200},{x:3100,y:6200}],{invertBlockMatrix:[1,0,0,-100,0,1,0,-200,0,0,1,0]});
 const d=draw(fixture(f,undefined,{rotation:Math.PI/2,xScale:2,yScale:1}));
 assert.equal(d.issues.filter(i=>i.level==='blocker').length,0);assert.ok(Math.abs(polygonArea(d.shapes[0].polygons)-36000000)<1e-4);
 assert.equal(d.shapes[0].originalPoints.length,4);assert.ok(d.shapes[0].points.every(p=>p.x>=-5000-1e-7&&p.x<=1000+1e-7));
});
test('visible region quantities use original panel grid and no artificial flashing at clip edge',()=>{
 const d=draw(fixture());const state=sampleConditions(d);state.roles={};prepareScope(d,state);
 state.inputs.panelLoss=0;state.inputs.boltPack=1;state.inputs.endBolts=1;
 const result=calculate(d,state);assert.equal(result.grossArea,36);assert.equal(result.netArea,36);assert.equal(result.panels.length,6);assert.equal(result.bolts.main,36);
 assert.equal(result.flashing.some(s=>s.kind==='wallRight'),false);assert.equal(result.flashing.reduce((n,s)=>n+s.length,0),18000);
});
test('diagonal clip calculates visible polygon area without treating it as a rectangular wall',()=>{
 const d=draw(fixture(filter([{x:0,y:0},{x:12000,y:0},{x:0,y:6000}]))),state=sampleConditions(d);state.roles={};prepareScope(d,state);
 state.inputs.panelLoss=0;state.inputs.boltPack=1;state.inputs.endBolts=1;
 const r=calculate(d,state);assert.equal(r.netArea,36);assert.ok(Math.abs(r.panels.reduce((n,p)=>n+p.netArea,0)-36)<1e-8);
 assert.ok(r.flashing.every(s=>s.kind==='wallBottom'||s.kind==='wallLeft'));assert.ok(r.panels.some(p=>p.polygons));
});
test('clip removes hidden openings and clips partial openings without inventing jambs',()=>{
 const d=draw(fixture(filter(),[rect(0,0,12000,6000),rect(5000,2000,2000,2000,'WINDOW_OPENINGS','A'),rect(8000,1000,1000,1000,'WINDOW_OPENINGS','B')]));
 assert.equal(d.shapes.length,2);const state=sampleConditions(d);state.roles={};prepareScope(d,state);const r=calculate(d,state);
 assert.equal(r.openingArea,2);assert.equal(r.netArea,34);assert.equal(r.flashing.filter(s=>s.kind==='windowJamb').length,1);
});
test('front/back 3D clipping or unsupported matrices cannot silently issue quantities',()=>{
 for(const extra of [{frontClippingPlaneFlag:true},{extrusionDirection:{x:1,y:0,z:0}},{matrix:matrix.map((x,i)=>i===3?100:x)}]){
 const d=draw(fixture(filter(undefined,extra)));assert.ok(d.issues.some(i=>i.level==='blocker'&&i.code.startsWith('xclip')));
 }
});

test('actual DWG SPATIAL_FILTER and inverted roundtrip metadata reach the visible quantity engine',async()=>{
 const {readFile}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');const {readDwg}=await import('../src/dwg-reader.mjs');
 const wasm=fileURLToPath(new URL('../vendor/libredwg/wasm',import.meta.url));
 const ref={path:'refs/facade.dwg',file:{size:1},parsed:await readDwg(new Uint8Array(await readFile(new URL('./fixtures/xclip/refs/facade.dwg',import.meta.url))),wasm)};
 for(const [name,gross,net] of [['rectangle',36,32.04],['triangle',36,31.32],['off',72,65.52],['inverted',64,58.6]]){
  const parsed=await readDwg(new Uint8Array(await readFile(new URL(`./fixtures/xclip/${name}.dwg`,import.meta.url))),wasm);assert.equal(parsed.errorCode,0,name);
  assert.equal(parsed.database.objects.SPATIAL_FILTER.length,1,name);
  const main={path:name+'.dwg',file:{size:1},parsed},d=draw({mainPath:main.path,sources:[main,ref]});assert.deepEqual(d.issues.filter(i=>i.level==='blocker'),[],name);
  const state=sampleConditions(d);state.roles={};prepareScope(d,state);const result=calculate(d,state);assert.ok(Math.abs(result.grossArea-gross)<1e-6,name+' gross');assert.ok(Math.abs(result.netArea-net)<1e-6,name+' net');
 }
});
test('insertion instances have independent boundaries and nested clips intersect',()=>{
 const bundle=fixture();const db=bundle.sources[0].parsed.database;
 db.entities.push({...db.entities[0],handle:'I2',insertionPoint:{x:20000,y:0},ownerDictionaryHardId:'0'});
 const d=draw(bundle);assert.equal(d.shapes.length,2);assert.equal(d.shapes[0].closed,true);assert.equal(d.shapes[1].polygons,undefined);
 assert.equal(polygonArea(d.shapes[0].polygons),36000000);
 const nested=fixture();const source=nested.sources[1].parsed.database;
 source.tables={BLOCK_RECORD:{entries:[{name:'inner',entities:source.entities}]}};
 source.objects=structuredClone(nested.sources[0].parsed.database.objects);
 source.objects.SPATIAL_FILTER[0].vertices=[{x:3000,y:0},{x:9000,y:3000}];
 source.entities=[{...nested.sources[0].parsed.database.entities[0],name:'inner',insertionPoint:{x:0,y:0}}];
 const n=draw(nested);assert.equal(polygonArea(n.shapes[0].polygons),9000000);
});
test('clip cut through panel height does not create end supports, joints or flashing',()=>{
 const d=draw(fixture(filter([{x:500,y:500},{x:6500,y:3500}]))),state=sampleConditions(d);state.roles={};prepareScope(d,state);
 Object.assign(state.inputs,{panelLoss:0,boltPack:1,endBolts:1,sealantMethod:'length',sealantYield:2500,sealantLoss:0});
 const r=calculate(d,state);assert.match(r.formulas.clipping,/가상 경계/);assert.equal(r.netArea,18);assert.equal(r.panels.length,7);assert.equal(r.bolts.main,14);assert.equal(r.flashing.length,0);
 assert.equal(r.sealant.lengthMm,18000);assert.ok(r.panels.every(p=>p.orderLength===3000));
});
test('horizontal panel and support grids retain their original datum after clipping',()=>{
 const d=draw(fixture(filter([{x:500,y:500},{x:6500,y:3500}]))),state=sampleConditions(d);state.roles={};prepareScope(d,state);
 Object.assign(state.inputs,{direction:'horizontal',panelLoss:0,boltPack:1,endBolts:1,sealantMethod:'length',sealantYield:2500,sealantLoss:0});
 const r=calculate(d,state);assert.equal(r.netArea,18);assert.equal(r.panels.length,4);assert.equal(r.bolts.main,20);assert.equal(r.flashing.length,0);assert.equal(r.sealant.lengthMm,18000);
});
test('concave clipping can split a source into disjoint visible regions without merging across the gap',()=>{
 const mask={polygon:[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:7,y:10},{x:7,y:3},{x:3,y:3},{x:3,y:10},{x:0,y:10}]};
 const p=clipPolygons(rectanglePolygon({x0:0,y0:5,x1:10,y1:10}),[mask]);assert.equal(p.length,2);assert.equal(polygonArea(p),30);
});
test('inverted metadata uses contour containment and refuses inconsistent records',()=>{
 const b=fixture(),db=b.sources[0].parsed.database;db.objects.SPATIAL_FILTER[0].extensionDictionary='XD';
 db.objects.DICTIONARY.push({handle:'XD',entries:{ACAD_XREC_ROUNDTRIP:'XR'}});
 const record={handle:'XR',data:[{code:102,value:'ACAD_INVERTEDCLIP_ROUNDTRIP'},...[{x:-100,y:-100},{x:13000,y:-100},{x:13000,y:7000},{x:-100,y:7000}].map(value=>({code:10,value}))]};
 db.objects.XRECORD=[record];const clip=clipForInsert(db,db.entities[0]);assert.equal(clip.inverted,true);assert.equal(polygonArea([[clip.polygon.map(p=>[p.x,p.y])]]),36000000);
 record.data=record.data.map(t=>t.code===10?{...t,value:{x:t.value.x+5000,y:t.value.y}}:t);assert.throws(()=>clipForInsert(db,db.entities[0]),/관계/);
});
