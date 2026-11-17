const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require(process.env.FACADE_PLAYWRIGHT_MODULE);
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST'&&!r.url().includes('/cdn-cgi/challenge-platform/'))writes.push(r.url());});
 const root=path.resolve(__dirname,'fixtures/xclip'),url=process.env.FACADE_REVIEW_URL||'http://127.0.0.1:8765';await page.goto(url);
 const read=async()=>{await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='이 브라우저에 저장됨');return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('facade-workspace',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').get('current');q.onsuccess=()=>{resolve(q.result);db.close();};};}));};
 const results=[];
 for(const [name,gross,net] of [['rectangle',36,32.04],['triangle',36,31.32],['inverted',64,58.6],['off',72,65.52]]){
  await page.locator('#file-input').setInputFiles([path.join(root,name+'.dwg'),path.join(root,'refs/facade.dwg')]);await page.locator('#main-drawing-dialog').waitFor();await page.locator('#main-drawing-select').selectOption(name+'.dwg');await page.getByRole('button',{name:'도면 열기',exact:true}).click();
  await page.waitForFunction(n=>document.querySelector('#filename').textContent===n+'.dwg',name);let p=await read();assert.deepEqual(p.drawing.issues.filter(i=>i.level==='blocker'),[],name);assert.equal(p.drawing.clipping.length,name==='off'?0:1);
  // Supply known synthetic conditions through the supported project import flow.
  p.takeoff=await page.evaluate(async p=>{const {sampleConditions}=await import('/src/sample.mjs');const {prepareScope}=await import('/src/scope.mjs');const s=sampleConditions(p.drawing);s.roles={};prepareScope(p.drawing,s);return s;},p);
  await page.locator('#file-input').setInputFiles({name:'clip.facade.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(p))});await page.getByText('프로젝트를 불러왔습니다.',{exact:true}).waitFor();await page.locator('#calculate').click();await page.getByText('물량표 발행 완료',{exact:true}).waitFor();p=await read();assert.ok(Math.abs(p.result.grossArea-gross)<1e-6);assert.ok(Math.abs(p.result.netArea-net)<1e-6);results.push({name,gross:p.result.grossArea,net:p.result.netArea});
  if(name==='triangle')await page.screenshot({path:path.resolve(__dirname,'../verification/xclip-triangle.png'),fullPage:true});
  if(name==='inverted'){
   const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);const data=await fs.readFile(await saved.path());const original=p.result.fingerprint;
   await page.locator('#file-input').setInputFiles({name:'clip.facade (1).json',mimeType:'application/json',buffer:data});await page.getByText('물량표 발행 완료',{exact:true}).waitFor();assert.equal((await read()).result.fingerprint,original);
   await page.reload();await page.locator('#restore').click();await page.getByText('물량표 발행 완료',{exact:true}).waitFor();assert.ok(Math.abs((await read()).result.netArea-58.6)<1e-6);
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(JSON.stringify({passed:true,url,results,checks:['native rectangle/triangle/inverted/OFF clipping','calculated visible quantities','saved clipped polygon topology','export/import fingerprint','reload recalculation','no browser exceptions','no application uploads']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
