import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDrawing,bulgeSegment,polygonArea } from '../src/geometry.mjs';
import {isValid,activeFields,initialTakeoff} from '../src/rules.mjs';
import {inspect} from '../src/takeoff.mjs';
import { validateDwg } from '../src/dwg-reader.mjs';
const parsed=(entities,blocks=[])=>({database:{header:{INSUNITS:4},entities,tables:{LAYER:{entries:[{name:'0'}]},BLOCK_RECORD:{entries:blocks}}},stats:{unknownEntityCount:0},errorCode:0,signature:'AC1032'});
const square={type:'LWPOLYLINE',handle:'A',layer:'WALL',flag:512,vertices:[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:0,y:5}]};
test('DWG signature validation refuses renamed PDF, truncation and oversized data',()=>{
 assert.throws(()=>validateDwg(new TextEncoder().encode('%PDF-1.7')));
 const fake=new Uint8Array(200);fake.set(new TextEncoder().encode('DXF000'));assert.throws(()=>validateDwg(fake));
 fake.set(new TextEncoder().encode('AC1032'));assert.equal(validateDwg(fake),'AC1032');
 assert.throws(()=>validateDwg(new Uint8Array(41*1024*1024)));
});
test('closed geometry keeps area in drawing units and does not label it as a wall',()=>{
 const d=normalizeDrawing(parsed([square]));assert.equal(d.closedCandidates[0].area,50);assert.equal(d.units,4);assert.equal(d.shapes[0].points.length,4);assert.equal(d.closedCandidates[0].role,undefined);
});
test('insert base point, rotation, scale and layer-0 inheritance are applied',()=>{
 const block={name:'BLOCK',basePoint:{x:5,y:0},entities:[{type:'LINE',handle:'B',layer:'0',startPoint:{x:5,y:0},endPoint:{x:15,y:0}}]};
 const insert={type:'INSERT',handle:'I',layer:'WALL',name:'BLOCK',insertionPoint:{x:100,y:200},rotation:Math.PI/2,xScale:2,yScale:1};
 const d=normalizeDrawing(parsed([insert],[block]));assert.deepEqual(d.shapes[0].points[0],{x:100,y:200});assert.ok(Math.abs(d.shapes[0].points[1].y-220)<1e-8);assert.equal(d.shapes[0].layer,'WALL');
});
test('array block spacing rotates but is not multiplied by insert scale',()=>{
 const b={name:'B',basePoint:{x:0,y:0},entities:[{type:'LINE',handle:'L',layer:'0',startPoint:{x:0,y:0},endPoint:{x:1,y:0}}]};
 const i={type:'INSERT',handle:'I',layer:'0',name:'B',insertionPoint:{x:0,y:0},xScale:3,yScale:3,columnCount:2,columnSpacing:10};
 const d=normalizeDrawing(parsed([i],[b]));assert.equal(d.shapes[1].points[0].x,10);assert.equal(d.shapes[1].points[1].x,13);
});
test('nested cycle, missing block and xref create non-overridable blockers',()=>{
 const i={type:'INSERT',handle:'I',layer:'0',name:'B',insertionPoint:{x:0,y:0}};
 const cyclic=normalizeDrawing(parsed([i],[{name:'B',entities:[i]}]));assert.ok(cyclic.issues.some(x=>x.code==='block-cycle'));
 assert.ok(normalizeDrawing(parsed([i])).issues.some(x=>x.code==='missing-block'));
 assert.ok(normalizeDrawing(parsed([i],[{name:'B',flags:4}])).issues.some(x=>x.code==='xref'));
});
test('parser warnings, unknown objects and 3D coordinates block use',()=>{
 const p=parsed([{type:'PROXY_ENTITY',handle:'X',layer:'0'},{type:'LINE',handle:'L',startPoint:{x:0,y:0,z:5},endPoint:{x:1,y:0,z:8}}]);p.errorCode=64;p.stats.unknownEntityCount=2;
 const d=normalizeDrawing(p),codes=d.issues.map(x=>x.code);for(const key of ['parser-warning','unknown-entity','unsupported-PROXY_ENTITY','3d-coordinate'])assert.ok(codes.includes(key));
 assert.equal(inspect(d,initialTakeoff()).canCalculate,false);
});
test('bulged polylines render as curves and are not counted as exact area candidates',()=>{
 const arc=bulgeSegment({x:0,y:0},{x:10,y:0},1);assert.ok(arc.some(p=>p.y<-4.9));assert.ok(Math.abs(arc.at(-1).x-10)<1e-8);
 const d=normalizeDrawing(parsed([{...square,vertices:square.vertices.map((v,i)=>({...v,bulge:i===0?1:0}))}]));assert.equal(d.shapes[0].exact,false);assert.equal(d.closedCandidates.length,0);
});
test('dimension overrides and tilted OCS cannot silently become trusted geometry',()=>{
 const d=normalizeDrawing(parsed([{type:'DIMENSION',handle:'D',text:'9000',measurement:8000},{...square,flag:513,extrusionDirection:{x:0,y:1,z:0}}]));assert.ok(d.issues.some(x=>x.code==='dimension-override'));assert.ok(d.issues.some(x=>x.code==='ocs-plane'));assert.equal(d.shapes.length,0);
});
test('unanswered conditions remain pending and dependent questions appear only when needed',()=>{
 const d=normalizeDrawing(parsed([square])),s=initialTakeoff();assert.equal(inspect(d,s).canCalculate,false);
 assert.equal(isValid(activeFields({}).find(f=>f.id==='panelWidth'),0),false);
 assert.equal(isValid(activeFields({}).find(f=>f.id==='panelSpec'),'미정'),false);
 assert.ok(activeFields({procurement:'fixed'}).some(f=>f.id==='stockPanelLength'));
 assert.ok(!activeFields({procurement:'custom'}).some(f=>f.id==='stockPanelLength'));
});
