import test from 'node:test';
import assert from 'node:assert/strict';
import {assembleReferences} from '../src/xrefs.mjs';
import {normalizeDrawing} from '../src/geometry.mjs';
import {validateProject} from '../src/project.mjs';

function fixture(count){
 const line={type:'LINE',layer:'KEYMAP',startPoint:{x:0,y:0},endPoint:{x:1,y:1}};
 const tail={type:'LWPOLYLINE',handle:'TAIL',layer:'WALL_OUTLINE',flag:512,vertices:[{x:0,y:0},{x:12000,y:0},{x:12000,y:6000},{x:0,y:6000}]};
 const parsed={database:{entities:[{type:'INSERT',handle:'I',name:'keymap',insertionPoint:{x:0,y:0}},tail],tables:{BLOCK_RECORD:{entries:[{name:'keymap',flags:0,entities:Array.from({length:count},(_,i)=>({...line,handle:String(i)}))}]}}}};
 return {mainPath:'large.dwg',sources:[{path:'large.dwg',file:{name:'large.dwg',size:1},parsed}]};
}
test('large internal keymap does not reject the file or omit the later facade; project roundtrip remains valid',()=>{
 const bundle=fixture(172368);
 const d=normalizeDrawing(assembleReferences(bundle));
 assert.equal(d.shapes.length,172369);
 assert.ok(d.closedCandidates.some(s=>s.handle==='TAIL'&&s.area===72000000));
 assert.ok(!d.issues.some(i=>i.code==='entity-limit'));
 const project={schema:'facade-workspace/0.2',file:{name:'large.dwg'},drawing:d};
 const restored=validateProject(JSON.parse(JSON.stringify(project)));
 assert.equal(restored.drawing.shapes.at(-1).handle,'TAIL');
});
test('oversized block definitions and repeated insert expansion still have a finite safety limit',()=>{
 assert.throws(()=>assembleReferences(fixture(500001)),/처리 한도/);
 const bundle=fixture(100001),db=bundle.sources[0].parsed.database;
 db.entities=Array.from({length:6},(_,i)=>({...db.entities[0],handle:'I'+i}));
 const d=normalizeDrawing(assembleReferences(bundle));
 assert.equal(d.issues.filter(i=>i.code==='entity-limit').length,1);
 assert.ok(d.shapes.length<=500000);
 assert.throws(()=>validateProject({schema:'facade-workspace/0.2',file:{name:'large.dwg'},drawing:{...d,shapes:Array(500001).fill(d.shapes[0])}}),/좌표 범위/);
});
