import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeDrawing} from '../src/geometry.mjs';
import {splinePoints,ellipsePoints,hatchPaths} from '../src/cad-curves.mjs';
const parsed=entities=>({database:{entities}});
test('a constant nonzero elevation preserves XY dimensions; changing Z remains blocked',()=>{
 const line={type:'LINE',handle:'L',startPoint:{x:0,y:0,z:-632},endPoint:{x:12,y:0,z:-632}};
 const p={type:'LWPOLYLINE',handle:'P',flag:520,elevation:-632,vertices:[{x:0,y:0},{x:12,y:0},{x:12,y:6},{x:0,y:6}]};
 const d=normalizeDrawing(parsed([line,p]));assert.equal(d.issues.filter(i=>i.level==='blocker').length,0);assert.equal(d.closedCandidates[0].area,72);
 assert.ok(normalizeDrawing(parsed([{...line,endPoint:{x:12,y:0,z:5}}])).issues.some(i=>i.code==='3d-coordinate'));
});
test('rational spline sampling follows the curve instead of its control polygon',()=>{
 const e={degree:2,controlPoints:[{x:1,y:0},{x:1,y:1},{x:0,y:1}],knots:[0,0,0,1,1,1],weights:[1,Math.SQRT1_2,1]};
 const ps=splinePoints(e);assert.deepEqual(ps[0],{x:1,y:0});assert.deepEqual(ps.at(-1),{x:0,y:1});
 for(const p of ps)assert.ok(Math.abs(Math.hypot(p.x,p.y)-1)<1e-8);
 assert.throws(()=>splinePoints({...e,knots:[0,1]}));assert.throws(()=>splinePoints({...e,weights:[1,-1,1]}));
});
test('rotated ellipse arcs preserve endpoints and remain approximate display geometry',()=>{
 const e={type:'ELLIPSE',handle:'E',center:{x:10,y:20},majorAxisEndPoint:{x:0,y:4},axisRatio:.5,startAngle:0,endAngle:Math.PI/2};
 const ps=ellipsePoints(e);assert.deepEqual(ps[0],{x:10,y:24});assert.ok(Math.hypot(ps.at(-1).x-8,ps.at(-1).y-20)<1e-8);
 const d=normalizeDrawing(parsed([e]));assert.equal(d.shapes[0].exact,false);assert.equal(d.issues.length,0);
});
test('hatch loops display separately, preserving holes without claiming exact takeoff geometry',()=>{
 const ring=(x,y,w,h)=>({isClosed:1,vertices:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
 const e={type:'HATCH',handle:'H',boundaryPaths:[ring(0,0,12,6),ring(2,2,1,1)]};
 assert.equal(hatchPaths(e).length,2);const d=normalizeDrawing(parsed([e]));assert.equal(d.shapes.length,2);assert.equal(new Set(d.shapes.map(s=>s.id)).size,2);
 assert.ok(d.shapes.every(s=>s.closed&&!s.exact));assert.equal(d.closedCandidates.length,0);assert.ok(d.issues.some(i=>i.code==='hatch-boundaries'&&i.level==='notice'));
});
test('line-edge hatches reject gaps rather than inventing a closing edge',()=>{
 const e={boundaryPaths:[{edges:[{type:1,start:{x:0,y:0},end:{x:1,y:0}},{type:1,start:{x:1,y:0},end:{x:0,y:1}},{type:1,start:{x:0,y:1},end:{x:0,y:0}}]}]};
 assert.equal(hatchPaths(e)[0].length,3);e.boundaryPaths[0].edges[1].start.x=2;assert.throws(()=>hatchPaths(e));
});
test('two bulged hatch vertices can form a closed circular boundary',()=>{
 const [ps]=hatchPaths({boundaryPaths:[{isClosed:1,vertices:[{x:-1,y:0,bulge:1},{x:1,y:0,bulge:1}]}]});
 assert.ok(ps.length>20);for(const p of ps)assert.ok(Math.abs(Math.hypot(p.x,p.y)-1)<1e-8);
 assert.throws(()=>hatchPaths({boundaryPaths:[{isClosed:1,vertices:[{x:-1,y:0},{x:1,y:0}]}]}));
});
test('supported splines and straight leaders do not trigger unsupported-entity blockers',()=>{
 const s={type:'SPLINE',handle:'S',degree:1,knots:[0,0,1,1],controlPoints:[{x:0,y:0},{x:10,y:0}]};
 const l={type:'LEADER',handle:'L',vertices:[{x:0,y:0,z:5},{x:10,y:10,z:5}],isSpline:false};
 const d=normalizeDrawing(parsed([s,l]));assert.equal(d.shapes.length,2);assert.equal(d.issues.filter(i=>i.level==='blocker').length,0);
});
