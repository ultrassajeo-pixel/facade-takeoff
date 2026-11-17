import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readProjectFile,projectDownload} from '../src/project.mjs';

const bytes=await readFile(new URL('../samples/facade_sample_complete.facade.json',import.meta.url));
test('download copies restore drawing, inputs and history without relying on the compound extension',async()=>{
 const expected=JSON.parse(bytes);
 for(const name of ['sample.facade.json','sample.facade (1).json','sample.facade (23).json','SAMPLE.JSON']){
  const restored=await readProjectFile(new File([bytes],name,{type:'application/json'}));
  assert.deepEqual(restored.drawing,expected.drawing);
  assert.deepEqual(restored.takeoff,expected.takeoff);
  assert.deepEqual(restored.history,expected.history);
 }
});
test('unrelated and malformed JSON cannot replace a saved project',async()=>{
 for(const text of ['{}','[]','null','{broken'])
  await assert.rejects(()=>readProjectFile(new File([text],'sample.facade (1).json')));
});
test('invalid drawing coordinates remain rejected after JSON file import broadening',async()=>{
 const value=JSON.parse(bytes);value.drawing.shapes[0].points[0].x='invalid';
 await assert.rejects(()=>readProjectFile(new File([JSON.stringify(value)],'sample (1).json')),/좌표/);
});
test('oversized saved project is rejected before reading its contents',async()=>{
 await assert.rejects(()=>readProjectFile({size:100*1024*1024+1,text(){assert.fail('oversized file was read');}}),/너무 큽니다/);
});
test('compressed projects restore geometry, raw reference bundle and conditions without data loss',async()=>{
 const p=JSON.parse(bytes);p.raw=JSON.stringify({schema:'facade-drawing-bundle/1',sources:[{note:'원본 참조 보존 '.repeat(500)}]});
 const out=await projectDownload(p,1);assert.equal(out.extension,'.facade.json.gz');
 const restored=await readProjectFile(new File([out.blob],'saved (1).facade.json.gz'));
 assert.equal(restored.raw,p.raw);assert.deepEqual(restored.drawing,p.drawing);assert.deepEqual(restored.takeoff,p.takeoff);
 const small=await projectDownload(p,Infinity);assert.equal(small.extension,'.facade.json');
 await assert.rejects(()=>readProjectFile(new File([new Uint8Array([31,139,0,0])],'broken.facade.json.gz')));
});
