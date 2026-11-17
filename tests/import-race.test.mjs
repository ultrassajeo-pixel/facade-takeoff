import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
const source=await readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
// Exercise the actual UI readFiles function with deferred file decoding and a small DOM stub.
const body=source.slice(source.indexOf('async function readFiles('),source.indexOf('\nfunction download(')).replaceAll('import.meta.url',"'http://localhost/src/app.mjs'");
function setup(){
 const fields=new Map(),context=vm.createContext({token:0,project:{name:'original'},Array,URL,clearTimeout,setTimeout,
  $:id=>{if(!fields.has(id))fields.set(id,{hidden:true});return fields.get(id);},toast(){},
  readProjectFile:file=>file.value});
 context.cancelRead=()=>{context.token++;};context.setProject=p=>{context.project=p;};vm.runInContext(body,context);return context;
}
test('late compressed project import cannot overwrite a newer project import',async()=>{
 const c=setup();let complete;const earlier=c.readFiles([{name:'earlier.json.gz',value:new Promise(r=>complete=r)}]);
 await c.readFiles([{name:'latest.json',value:Promise.resolve({name:'latest'})}]);complete({name:'earlier'});await earlier;
 assert.equal(c.project.name,'latest');
});
test('cancelled compressed import cannot replace the existing drawing',async()=>{
 const c=setup();let complete;const pending=c.readFiles([{name:'earlier.json.gz',value:new Promise(r=>complete=r)}]);
 c.cancelRead();complete({name:'earlier'});await pending;assert.equal(c.project.name,'original');
});
