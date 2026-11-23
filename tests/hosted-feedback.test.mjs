import test from 'node:test';
import assert from 'node:assert/strict';
import {makeTrace} from '../src/diagnostics.mjs';
import {deliverFeedback} from '../src/feedback-delivery.mjs';

test('new installations submit to deployed inbox and verify its receipt',async()=>{
 const report=makeTrace(null).report('idea','시험');
 const receipt=await deliverFeedback(report,{},async(url,options)=>{
   assert.equal(String(url),'https://facade-takeoff-feedback.ultrassa.chatgpt.site/feedback');
   assert.equal(options.headers.Authorization,undefined);
   assert.deepEqual(JSON.parse(options.body),report);
   return Response.json({id:report.id},{status:201});
 });
 assert.deepEqual(receipt,{id:report.id});
 await assert.rejects(deliverFeedback(report,{},async()=>Response.json({id:'other'})));
});
