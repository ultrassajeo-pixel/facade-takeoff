import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {readDwg} from '../src/dwg-reader.mjs';
import {normalizeDrawing} from '../src/geometry.mjs';
import {calculate} from '../src/takeoff.mjs';
import {sampleConditions} from '../src/sample.mjs';
const wasm=fileURLToPath(new URL('../vendor/libredwg/wasm',import.meta.url));
const fixture=async name=>new Uint8Array(await readFile(new URL('./fixtures/'+name,import.meta.url)));
test('2018 binary DWG is read directly with original line coordinates',async()=>{
 const result=await readDwg(await fixture('2018-Line.dwg'),wasm);assert.equal(result.signature,'AC1032');assert.equal(result.errorCode,0);assert.equal(result.database.entities.length,1);
 const line=result.database.entities[0];assert.equal(line.type,'LINE');assert.equal(line.handle,'1CA');assert.ok(Math.abs(line.startPoint.x-21.607766723020987)<1e-10);assert.ok(Math.abs(line.endPoint.y-16.637544737991476)<1e-10);
});
test('read warnings survive conversion and block downstream calculation',async()=>{
 const result=await readDwg(await fixture('2004-Line.dwg'),wasm);assert.ok(result.errorCode!==0);const drawing=normalizeDrawing(result);assert.ok(drawing.issues.some(i=>i.code==='parser-warning'));assert.equal(drawing.sourceCount,1);
});
test('2000 and 2018 DWG data preserve heterogeneous objects and text',async()=>{
 const old=await readDwg(await fixture('2000-entities-2d.dwg'),wasm);assert.equal(old.database.entities.length,14);assert.equal(old.signature,'AC1015');
 const modern=await readDwg(await fixture('2018-Text.dwg'),wasm);assert.ok(modern.database.entities.some(e=>e.type==='MTEXT'&&e.text));
 assert.equal(normalizeDrawing(modern).texts[0].text,'This a multiline text to check if libredwg is able to read this in the current file format version');
});
test('synthetic facade DWG matches all independently specified geometry and dimension values',async()=>{
 const bytes=new Uint8Array(await readFile(new URL('../samples/facade_sample_12m_6m.dwg',import.meta.url)));
 const r=await readDwg(bytes,wasm),d=normalizeDrawing(r);
 assert.equal(r.errorCode,0);assert.equal(d.units,4);assert.equal(d.sourceCount,31);assert.equal(d.unknownCount,0);
 assert.equal(d.closedCandidates.length,4);
 assert.equal(d.closedCandidates.find(s=>s.layer==='WALL_OUTLINE').area,72000000);
 assert.deepEqual(d.closedCandidates.filter(s=>s.layer==='WINDOW_OPENINGS').map(s=>s.area),[1800000,1800000]);
 assert.equal(d.closedCandidates.find(s=>s.layer==='DOOR_OPENING').area,2880000);
 assert.deepEqual(d.dimensions.map(s=>s.measurement),[12000,6000]);
 const axes=d.shapes.filter(s=>s.layer==='SUPPORT_AXES');assert.equal(axes.length,6);assert.deepEqual(axes.map(s=>s.points[0].y),[0,1200,2400,3600,4800,6000]);
 const wall=d.shapes.find(s=>s.layer==='WALL_OUTLINE');assert.equal(wall.closed,true);assert.deepEqual(wall.points,[{x:0,y:0},{x:12000,y:0},{x:12000,y:6000},{x:0,y:6000}]);
 assert.equal(d.issues.filter(i=>i.level==='blocker').length,0);
 const q=calculate(d,sampleConditions(d));assert.equal(q.panelGroups[0].order,13);assert.equal(q.flashingGroups[0].order,28);assert.equal(q.bolts.order,100);assert.equal(q.screws.order,300);assert.equal(q.sealant.order,14);
});
