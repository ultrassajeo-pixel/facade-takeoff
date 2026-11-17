import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleReferences,resolveReference} from '../src/xrefs.mjs';
import {normalizeDrawing} from '../src/geometry.mjs';
import {explicitLayerRole} from '../src/scope.mjs';
const line={type:'LINE',handle:'10',layer:'WALL_OUTLINE',startPoint:{x:10,y:20},endPoint:{x:12,y:20}};
const insert=(name,extra={})=>({type:'INSERT',handle:'I'+name,name,layer:'0',insertionPoint:{x:100,y:200},...extra});
const ref=(name,path,flags=4)=>({name,xrefPath:path,flags,basePoint:{x:0,y:0},entities:[]});
const source=(path,entities=[],blocks=[],header={})=>({path,file:{name:path,size:1,sha256:path},parsed:{database:{entities,header:{INSUNITS:4,...header},tables:{BLOCK_RECORD:{entries:blocks},LAYER:{entries:[]}}},errorCode:0,stats:{unknownEntityCount:0}}});
const draw=sources=>normalizeDrawing(assembleReferences({mainPath:sources[0].path,sources}));
test('host-relative paths, Windows paths and unique relocated basename resolve without guessing duplicates',()=>{
 const paths=['set/main.dwg','set/refs/a.dwg','other/a.dwg'];
 assert.equal(resolveReference('set/main.dwg','refs\\A.dwg',paths).path,'set/refs/a.dwg');
 assert.equal(resolveReference('set/main.dwg','C:\\old\\a.dwg',paths).status,'ambiguous');
 assert.equal(resolveReference('set/main.dwg','C:\\old\\a.dwg',[paths[1]]).path,paths[1]);
 assert.equal(resolveReference('set/main.dwg','missing.dwg',paths).status,'missing');
});
test('reference model space uses source base point, insert scale and rotation, preserving provenance',()=>{
 const d=draw([source('main.dwg',[insert('face',{rotation:Math.PI/2,xScale:2,yScale:3})],[ref('face','a.dwg')]),source('a.dwg',[line],[],{INSBASE:{x:10,y:20}})]);
 assert.equal(d.issues.length,0);assert.deepEqual(d.shapes[0].points,[{x:100,y:200},{x:100,y:204}]);
 assert.equal(d.shapes[0].sourceFile,'a.dwg');assert.equal(d.shapes[0].sourceHandle,'10');assert.equal(explicitLayerRole(d.shapes[0].layer),'wall');
 assert.equal(d.references[0].status,'resolved');
});
test('nested attachments render, nested overlays do not, direct overlays do',()=>{
 const root=source('set/main.dwg',[insert('a')],[ref('a','refs/a.dwg',8)]);
 const a=source('set/refs/a.dwg',[line,insert('b'),insert('c')],[ref('b','../b.dwg'),ref('c','c.dwg',8)]);
 const d=draw([root,a,source('set/b.dwg',[line])]);
 assert.equal(d.shapes.length,2);assert.equal(d.issues.length,0);assert.ok(d.references.some(r=>r.status==='overlay-skipped'));
});
test('missing, cyclic, ambiguous and malformed clip references block instead of silently omitting geometry',()=>{
 const main=source('main.dwg',[insert('a')],[ref('a','a.dwg')]);
 assert.ok(draw([main]).issues.some(i=>i.code==='xref-missing'));
 assert.ok(draw([main,source('one/a.dwg'),source('two/a.dwg')]).issues.some(i=>i.code==='xref-ambiguous'));
 assert.ok(draw([main,source('a.dwg',[insert('main')],[ref('main','main.dwg')])]).issues.some(i=>i.code==='xref-cycle'));
 const clipped=source('a.dwg',[line]);clipped.parsed.database.objects={SPATIAL_FILTER:[{vertices:[{x:0,y:0}]}]};
 assert.ok(draw([main,clipped]).issues.some(i=>i.code==='xref-clip'));
});
test('foreign warnings propagate; unused drawings and unused definitions do not affect main drawing',()=>{
 const main=source('main.dwg',[insert('a')],[ref('a','a.dwg'),ref('unused','missing.dwg')]);
 const a=source('a.dwg',[line]);a.parsed.stats.unknownEntityCount=2;a.parsed.errorCode=1;
 const d=draw([main,a,source('unrelated.dwg',[line])]);assert.equal(d.shapes.length,1);
 assert.ok(d.issues.some(i=>i.code==='xref-parser-warning'));assert.ok(d.issues.some(i=>i.code==='xref-unknown-entity'));assert.equal(d.references.length,1);
});
test('repeated references keep distinct IDs and independent nested blocks and dimension handles',()=>{
 const ordinary={name:'local',flags:0,basePoint:{x:0,y:0},entities:[line]};
 const d=draw([source('main.dwg',[insert('a'),insert('b')],[ref('a','a.dwg'),ref('b','b.dwg')]),source('a.dwg',[insert('local')],[ordinary]),source('b.dwg',[insert('local')],[ordinary])]);
 assert.equal(d.shapes.length,2);assert.equal(new Set(d.shapes.map(s=>s.id)).size,2);assert.equal(new Set(d.shapes.map(s=>s.handle)).size,2);
});

test('reference contents and primary identity affect the drawing fingerprint; saved bundles survive restore',async()=>{
 const {drawingFingerprint,savedBundle}=await import('../src/drawing-intake.mjs');
 const {BUNDLE_SCHEMA}=await import('../src/xrefs.mjs');
 const a={schema:BUNDLE_SCHEMA,mainPath:'main.dwg',sources:[source('main.dwg'),source('a.dwg')]};
 const first=await drawingFingerprint(a),restored=savedBundle({raw:JSON.stringify(a)});
 assert.equal(await drawingFingerprint(restored),first);
 restored.sources[1].file.sha256='changed';assert.notEqual(await drawingFingerprint(restored),first);
 restored.sources=a.sources;restored.mainPath='a.dwg';assert.notEqual(await drawingFingerprint(restored),first);
 assert.throws(()=>savedBundle({raw:'{}'}),/이전 형식/);
});
test('native DWG XREF pathname, source geometry, scope and calculated quantities survive attachment',async()=>{
 const {readDwg}=await import('../src/dwg-reader.mjs');const {readFile}=await import('node:fs/promises');const {fileURLToPath}=await import('node:url');
 const {sampleConditions}=await import('../src/sample.mjs');const {calculate}=await import('../src/takeoff.mjs');const {prepareScope}=await import('../src/scope.mjs');
 const sources=[];for(const path of ['host.dwg','refs/facade.dwg'])sources.push({path,file:{size:1,sha256:path},parsed:await readDwg(new Uint8Array(await readFile(new URL('./fixtures/xrefs/'+path,import.meta.url))),fileURLToPath(new URL('../vendor/libredwg/wasm',import.meta.url)))});
 assert.equal(sources[0].parsed.database.tables.BLOCK_RECORD.entries.find(b=>b.flags&4).xrefPath,'refs/facade.dwg');
 const missing=draw([sources[0]]);assert.ok(missing.issues.some(i=>i.code==='xref-missing'));
 const d=draw(sources);assert.deepEqual(d.issues.filter(i=>i.level==='blocker'),[]);
 const wall=d.shapes.find(s=>s.layer==='facade|WALL_OUTLINE');assert.deepEqual(wall.points,[{x:1000,y:2000},{x:13000,y:2000},{x:13000,y:8000},{x:1000,y:8000}]);
 const state=sampleConditions(d);state.roles={};prepareScope(d,state);assert.equal(state.roles[wall.id],'wall');assert.equal(state.scopeConfirmed,true);
 const q=calculate(d,state);assert.equal(q.panelGroups[0].order,13);assert.equal(q.bolts.order,100);assert.equal(q.screws.order,300);assert.equal(q.sealant.order,14);
});
