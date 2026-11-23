import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {selectUpdate,downloadUpdate} from '../packaging/macos/update.mjs';

const bytes=Buffer.from('test package');
const tag='mac-v0.6.2.10',name='Facade-Takeoff-0.6.2.10-Mac.pkg';
const asset={name,size:bytes.length,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),browser_download_url:'https://github.com/ultrassajeo-pixel/facade-takeoff/releases/download/'+tag+'/'+name};
const release={tag_name:tag,assets:[asset]};
test('compare numeric Mac build components and require a complete official asset',()=>{
 const u=selectUpdate(release,'0.6.2.2');assert.equal(u.version,'0.6.2.10');
 assert.equal(selectUpdate(release,'0.6.2.10'),null);assert.equal(selectUpdate(release,'0.6.3.1'),null);
 for(const changed of [{digest:null},{browser_download_url:'https://elsewhere.test/pkg'},{size:0}])
  assert.throws(()=>selectUpdate({...release,assets:[{...asset,...changed}]},'0.6.2.2'));
});
test('stage only a complete verified package and discard a partial or corrupt download',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'facade-update-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const update=selectUpdate(release,'0.6.2.1');
 for(const bad of [bytes.subarray(1),Buffer.alloc(bytes.length),Buffer.alloc(bytes.length+1)]){
  await assert.rejects(downloadUpdate(update,dir,async()=>new Response(bad)));assert.deepEqual(await readdir(dir),[]);
 }
 const file=await downloadUpdate(update,dir,async()=>new Response(bytes));assert.deepEqual(await readFile(file),bytes);
});
