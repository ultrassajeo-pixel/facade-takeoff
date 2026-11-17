const assert=require('node:assert/strict');
const fs=require('node:fs/promises');const path=require('node:path');
const {chromium}=require(process.env.FACADE_PLAYWRIGHT_MODULE);
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'fixtures/xrefs');
 await page.goto(process.env.FACADE_REVIEW_URL||'http://127.0.0.1:8765');
 const stored=async()=>{await page.locator('#loading').waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='이 브라우저에 저장됨');return page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('facade-workspace',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').get('current');q.onsuccess=()=>{resolve(q.result);db.close();};};}));};
 await page.locator('#file-input').setInputFiles(path.join(root,'host.dwg'));
 await page.waitForFunction(()=>document.querySelector('#reference-status').textContent.includes('파일 필요'));
 let p=await stored();assert.ok(p.drawing.issues.some(i=>i.code==='xref-missing'));assert.equal(await page.locator('#calculate').isDisabled(),true);
 await page.locator('#reference-input').setInputFiles(path.join(root,'refs/facade.dwg'));
 await page.waitForFunction(()=>document.querySelector('#reference-status').textContent.includes('연결됨'));await page.locator('.scope-ready').waitFor();p=await stored();assert.deepEqual(p.drawing.issues.filter(i=>i.level==='blocker'),[]);assert.equal(p.drawing.closedCandidates.length,4);assert.match(await page.locator('#reference-status').innerText(),/연결됨/);
 assert.deepEqual(p.drawing.shapes.find(s=>s.layer==='facade|WALL_OUTLINE').points[0],{x:1000,y:2000});
 const fingerprint=p.file.sha256;
 const [saved]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
 const contents=await fs.readFile(await saved.path());
 await page.locator('#file-input').setInputFiles({name:'xref.facade (1).json',mimeType:'application/json',buffer:contents});
 await page.getByText('프로젝트를 불러왔습니다.',{exact:true}).waitFor();assert.equal((await stored()).file.sha256,fingerprint);
 await page.reload();await page.locator('#restore').click();await page.locator('.scope-ready').waitFor();assert.equal((await stored()).drawing.closedCandidates.length,4);
 // Invalid added DWG must leave the existing project intact.
 await page.locator('#reference-input').setInputFiles({name:'bad.dwg',mimeType:'application/octet-stream',buffer:Buffer.from('invalid')});
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('읽기 실패'));
 assert.equal((await stored()).file.sha256,fingerprint);
 // Multiple selection requires an explicit primary drawing, independent of order.
 await page.locator('#file-input').setInputFiles([path.join(root,'refs/facade.dwg'),path.join(root,'host.dwg')]);
 await page.locator('#main-drawing-dialog').waitFor();await page.locator('#main-drawing-select').selectOption('host.dwg');await page.getByRole('button',{name:'도면 열기',exact:true}).click();await page.locator('.scope-ready').waitFor();assert.equal((await stored()).file.name,'host.dwg');
 // Folder selection preserves paths and uses host-relative reference resolution.
 await page.locator('#folder-input').setInputFiles(root);await page.locator('#main-drawing-dialog').waitFor();
 const hostValue=await page.locator('#main-drawing-select option').evaluateAll(es=>es.find(e=>e.value.endsWith('/host.dwg')).value);
 await page.locator('#main-drawing-select').selectOption(hostValue);await page.getByRole('button',{name:'도면 열기',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#reference-status').textContent.includes('xrefs/refs/facade.dwg'));await page.locator('.scope-ready').waitFor();p=await stored();assert.equal(p.drawing.references[0].resolvedPath,'xrefs/refs/facade.dwg');
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.resolve(__dirname,'../verification/xrefs-browser.png'),fullPage:true});
 console.log(JSON.stringify({passed:true,url:page.url(),checks:['missing reference blocks calculation','add reference resolves native DWG','native insertion position','automatic external layer roles','bundle export/import','browser reload restore','invalid added file preserves current work','multiple files explicit primary','folder relative paths','no page exceptions']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
