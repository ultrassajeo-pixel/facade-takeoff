import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, readdir, readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {makeTrace, cleanReport} from '../src/diagnostics.mjs';
import {acceptReport} from '../feedback-inbox.mjs';

test('reopening preserves stage sequence without carrying drawing text', () => {
  const cache = new Map();
  const storage = {getItem:k => cache.get(k), setItem:(k,v) => cache.set(k,v)};
  const trace = makeTrace(storage);
  trace.mark('parse','start',{files:2, path:'/private/site.dwg'});
  trace.mark('parse','timeout');
  const report = makeTrace(storage).report('error','읽기가 멈췄습니다');
  assert.deepEqual(report.events.map(e=>e.status),['start','timeout']);
  assert.equal(report.events[0].files,2);
  assert.ok(!JSON.stringify(report).includes('site.dwg'));
  assert.throws(()=>cleanReport({...report, raw:'drawing'}));
});

test('receiver gives one durable receipt for simultaneous retries and rejects changed content', async () => {
  const dir = await mkdtemp(path.join(tmpdir(),'facade-feedback-'));
  try {
    const report=makeTrace(null).report('idea','확대 기능 개선');
    const receipts=await Promise.all([acceptReport(dir,report),acceptReport(dir,report)]);
    assert.equal(receipts[0],receipts[1]);
    assert.equal((await readdir(dir)).length,1);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir,report.id+'.json'),'utf8')),report);
    await assert.rejects(acceptReport(dir,{...report,description:'다른 내용'}));
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('replay reports saved project blockers and preserves sample input', async () => {
  const {replay}=await import('../feedback-replay.mjs');
  const path=new URL('../samples/facade_sample_complete.facade.json',import.meta.url);
  const sample=JSON.parse(await readFile(path,'utf8'));
  const before=structuredClone(sample);
  const successful=replay(sample);
  assert.equal(successful.netArea,65.52);
  assert.deepEqual(sample,before);
  const blocked=structuredClone(sample);
  blocked.takeoff.scopeConfirmed=false;
  assert.ok(replay(blocked).blockers.includes('scope-confirm'));
});
