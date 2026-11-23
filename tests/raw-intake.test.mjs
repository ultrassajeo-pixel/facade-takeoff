import test from 'node:test';
import assert from 'node:assert/strict';
import {rawPayload} from '../src/drawing-intake.mjs';
import {projectDownload} from '../src/project.mjs';
test('large raw payload moves as a Blob and exports all original values including wide handles',async()=>{
 const bundle={schema:'facade-drawing-bundle/1',sources:[{handle:2n**66n,note:'외벽'}]};
 const expected=JSON.stringify(bundle,(_,v)=>typeof v==='bigint'?v.toString():v);
 const raw=rawPayload(bundle,1);assert.ok(raw instanceof Blob);assert.equal(await raw.text(),expected);
 assert.equal(rawPayload(bundle,1000),expected);
 const output=await projectDownload({drawing:{},raw});assert.deepEqual(JSON.parse(await output.blob.text()),{drawing:{},raw:expected});
});
