import test from 'node:test';
import assert from 'node:assert/strict';
import {initialTakeoff} from '../src/rules.mjs';
import {prepareScope,pendingScopeGroups,scopeCounts,applyScopeRole,drawingContext} from '../src/scope.mjs';
import {inspect,calculate} from '../src/takeoff.mjs';
import {sampleConditions} from '../src/sample.mjs';
import {assistant} from '../server-api.mjs';
const rect=(id,layer,x=0,y=0,w=12000,h=6000)=>({id,handle:id,layer,type:'LWPOLYLINE',closed:true,exact:true,points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
const drawing=shapes=>({units:4,shapes,issues:[],texts:[],dimensions:[]});
test('approximate curves and hatch boundaries are grouped by layer without silently assigning material roles',()=>{
 const d=drawing([rect('W','WALL_OUTLINE'),...Array.from({length:50},(_,i)=>({...rect('H'+i,'FINISH',i,0,i+1,6),type:'HATCH',exact:false}))]),s=initialTakeoff();prepareScope(d,s);
 const groups=pendingScopeGroups(d,s);assert.equal(groups.length,1);assert.equal(groups[0].shapes.length,50);assert.equal(groups[0].approximate,true);assert.equal(s.roles.H0,undefined);
 s.separateScope=['H0'];assert.equal(pendingScopeGroups(d,s).length,2);
});
test('explicit geometry roles and header units require no object-by-object confirmation',()=>{
 const d=drawing([rect('W','WALL_OUTLINE'),rect('A','WINDOW_OPENINGS',1500,2400,1500,1200),rect('D','DOOR_OPENING',5100,0,1200,2400),rect('B','BORDER2',-1000,-1000,15000,8000)]),s=initialTakeoff();
 const change=prepareScope(d,s,'입면.dwg');assert.equal(change.updates.length,4);assert.deepEqual(s.roles,{W:'wall',A:'window',D:'door',B:'exclude'});assert.equal(s.inputs.units,'mm');assert.equal(s.scopeConfirmed,true);assert.equal(pendingScopeGroups(d,s).length,0);assert.equal(s.roleEvidence.B.source,'도면 자동 해석');
});
test('two thousand P-SYM symbols stay unresolved as one compact question, without implicit exclusion',()=>{
 const d=drawing([rect('W','WALL_OUTLINE'),rect('B','BORDER2'),...Array.from({length:2000},(_,i)=>rect('S'+i,'P-SYM',i*50,0,10+i%4,10))]),s=initialTakeoff();prepareScope(d,s);
 const groups=pendingScopeGroups(d,s);assert.equal(groups.length,1);assert.equal(groups[0].shapes.length,2000);assert.equal(s.roles.S0,undefined);assert.equal(s.scopeConfirmed,false);assert.equal(inspect(d,s).blockers.filter(b=>b.id.startsWith('role-group-')).length,1);
 applyScopeRole(d,s,groups[0].shapes.map(x=>x.id),'exclude');assert.equal(s.scopeConfirmed,true);assert.equal(pendingScopeGroups(d,s).length,0);assert.equal(scopeCounts(d,s).exclude,2001);
});
test('unlabelled largest boundary is not guessed to be a wall and unknown units remain pending',()=>{
 const d=drawing([rect('X','0')]),s=initialTakeoff();d.units=0;prepareScope(d,s);assert.equal(s.roles.X,undefined);assert.equal(s.inputs.units,undefined);assert.equal(s.scopeConfirmed,false);assert.equal(inspect(d,s).canCalculate,false);
});
test('a mixed label that mentions walls is not sufficient for automatic assignment',()=>{const d=drawing([rect('X','DETAIL_WALL_OUTLINE')]),s=initialTakeoff();prepareScope(d,s);assert.equal(s.roles.X,undefined);});
test('dimension graphic ownership excludes arrow polygons even on an ordinary layer',()=>{const d=drawing([rect('W','WALL_OUTLINE'),rect('/insert:0,0/DIM1/arrow','0',0,0,10,10)]),s=initialTakeoff();d.dimensions=[{handle:'DIM1'}];prepareScope(d,s);assert.equal(s.roles['/insert:0,0/DIM1/arrow'],'exclude');assert.equal(s.scopeConfirmed,true);});
test('ordinary layers group only equal translated geometry, and mixed-purpose patterns can be separated',()=>{
 const d=drawing([rect('W','WALL_OUTLINE'),rect('A','OPENINGS',1500,2400,1500,1200),rect('B','OPENINGS',7500,2400,1500,1200),rect('C','OPENINGS',4500,1000,2000,1200)]),s=initialTakeoff();prepareScope(d,s);assert.equal(pendingScopeGroups(d,s).length,2);
 s.separateScope=['A','B'];assert.equal(pendingScopeGroups(d,s).length,3);applyScopeRole(d,s,['A'],'window');applyScopeRole(d,s,['B'],'exclude');assert.equal(s.roles.A,'window');assert.equal(s.roles.B,'exclude');assert.equal(s.roles.C,undefined);assert.equal(s.scopeConfirmed,false);
});
test('restoration preserves user roles, unit overrides and completed inputs',()=>{const d=drawing([rect('W','WALL_OUTLINE')]),s=initialTakeoff();s.roles.W='exclude';s.inputs.units='m';s.inputs.scope='남측만';s.inputs.panelWidth=1000;prepareScope(d,s);assert.equal(s.roles.W,'exclude');assert.equal(s.inputs.units,'m');assert.equal(s.inputs.scope,'남측만');assert.equal(s.inputs.panelWidth,1000);assert.equal(prepareScope(d,s).updates.length,0);});
test('recognised labels do not bypass geometry limitations or missing construction conditions',()=>{
 const d=drawing([rect('W','WALL_OUTLINE')]),s=initialTakeoff();d.shapes[0].exact=false;prepareScope(d,s);assert.equal(s.roles.W,'wall');assert.equal(inspect(d,s).canCalculate,false);assert.ok(inspect(d,s).scope.errors.length);assert.throws(()=>calculate(d,s));
});
test('automatic scope keeps deterministic sample material quantities unchanged',()=>{
 const d=drawing([rect('W','WALL_OUTLINE'),rect('A','WINDOW_OPENINGS',1500,2400,1500,1200),rect('B','WINDOW_OPENINGS',7500,2400,1500,1200),rect('D','DOOR_OPENING',5100,0,1200,2400)]),s=sampleConditions(d);s.roles={};s.scopeConfirmed=false;prepareScope(d,s);const r=calculate(d,s);assert.equal(r.netArea,65.52);assert.equal(r.panelGroups[0].order,13);assert.equal(r.flashingGroups[0].order,28);assert.equal(r.bolts.order,100);assert.equal(r.screws.order,300);assert.equal(r.sealant.order,14);
});
test('AI receives the fixed material purpose, drawing summary and prior dialogue',async()=>{
 const d=drawing([rect('W','WALL_OUTLINE')]),s=initialTakeoff();prepareScope(d,s);let prompt;
 await assistant({provider:'chatgpt',message:'패턴부터 물어봐 주세요',documents:[],pending:[],inputs:s.inputs,fields:[],drawing:drawingContext(d,s),messages:[{role:'user',text:'세로로 시공합니다.'}]},()=>{throw Error('Unexpected API');},{chatgpt:async p=>{prompt=p;return {reply:'판넬 유효폭은 얼마인가요?',proposals:[]};}});
 assert.match(prompt,/노무비·장비비 제외/);assert.match(prompt,/"wall":1/);assert.match(prompt,/세로로 시공합니다/);assert.match(prompt,/한 번에 한 주제/);
});
