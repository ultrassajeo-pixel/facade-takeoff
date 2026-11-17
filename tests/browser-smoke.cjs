const assert=require('node:assert/strict');
const {chromium}=require(process.env.FACADE_PLAYWRIGHT_MODULE||'playwright-core');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.FACADE_BROWSER_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/');await page.locator('#demo').click();await page.locator('.scope-ready').waitFor({timeout:20000});
 assert.equal(await page.locator('.scope-row select:visible').count(),0);assert.match(await page.locator('.scope-summary').innerText(),/외벽\s+1/);assert.equal(await page.locator('.scope-question').count(),0);
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='이 브라우저에 저장됨');
 const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('facade-workspace',1);r.onsuccess=()=>{const q=r.result.transaction('projects','readonly').objectStore('projects').get('current');q.onsuccess=()=>resolve(q.result);q.onerror=reject;};r.onerror=reject;}));
 assert.equal(saved.takeoff.scopeConfirmed,true);assert.equal(saved.takeoff.inputs.units,'mm');
 await page.locator('#file-input').setInputFiles({name:'saved.facade (1).json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.getByText('프로젝트를 불러왔습니다.',{exact:true}).waitFor();
 await page.locator('.scope-ready').waitFor();
 const noisy=structuredClone(saved);noisy.name='반복 기호 회귀 검증';noisy.file.name='symbols-test.dwg';noisy.file.sha256='test-synthetic-pattern';noisy.takeoff={roles:{},inputs:{panelWidth:1000,supportSpacing:1500},profiles:{},scopeConfirmed:false};noisy.result=null;
 const rect=(id,layer,x,y,w,h)=>({id,handle:id,layer,type:'LWPOLYLINE',closed:true,exact:true,points:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]});
 noisy.drawing.shapes.push(rect('BORDER_TEST','BORDER2',-300,-300,12600,6600),...Array.from({length:2000},(_,i)=>rect('SYMBOL_'+i,'P-SYM',(i%100)*120,Math.floor(i/100)*300,20+i%3,20)));
 noisy.drawing.layers.push({name:'BORDER2',count:1},{name:'P-SYM',count:2000});noisy.drawing.sourceCount+=2001;
 await page.locator('#file-input').setInputFiles({name:'symbols.facade.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(noisy))});
 await page.locator('.scope-question').waitFor();assert.equal(await page.locator('.scope-question').count(),1);assert.equal(await page.locator('.scope-row select:visible').count(),0);assert.match(await page.locator('.scope-question').innerText(),/2,?000개/);
 const metrics=await page.locator('#right-content').evaluate(e=>({height:e.clientHeight,scroll:e.scrollHeight,visibleQuestions:e.querySelectorAll('.scope-question').length}));
 if(process.env.FACADE_SCREENSHOT_PATH)await page.screenshot({path:process.env.FACADE_SCREENSHOT_PATH});
 await page.locator('.scope-details summary').click();await page.locator('.scope-row select').first().waitFor();assert.equal(await page.locator('.scope-row select:visible').count(),8);await page.locator('.scope-pager').getByRole('button',{name:'다음'}).click();assert.equal(await page.locator('.scope-row select:visible').count(),8);await page.locator('.scope-details summary').click();
 await page.locator('.scope-question').getByRole('button',{name:'도곽·기호 등 제외',exact:true}).click();await page.locator('.scope-ready').waitFor();assert.equal(await page.locator('.scope-question').count(),0);
 await page.getByRole('button',{name:'시공 패턴 알려주기 →'}).click();assert.match(await page.locator('#right-content').innerText(),/시공 패턴을 알려주세요/);assert.equal(await page.locator('.question-card').count(),1);
 await page.waitForFunction(()=>document.querySelector('#save-status').textContent==='이 브라우저에 저장됨');
 await page.reload();await page.locator('#restore').click();await page.locator('.scope-ready').waitFor();assert.equal(await page.locator('.scope-question').count(),0);
 let request;
 await page.route('**/api/assistant',async route=>{request=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mode:'chatgpt',reply:'판넬은 세로로 시공하나요, 가로로 시공하나요?',proposals:[]})});});
 await page.locator('#tab-assistant').click();await page.locator('#chat-message').fill('패턴부터 물어봐 주세요');await page.locator('.chat-form button').click();await page.locator('.chat-message.assistant').waitFor();
 assert.equal(request.inputs.minLength,3000);assert.equal(request.inputs.sealantYield,2500);assert.equal(request.inputs.screwRows,2);assert.equal(request.inputs.panelWidth,1000);assert.equal(request.inputs.supportSpacing,1500);assert.equal(request.drawing.scopeComplete,true);assert.equal(request.drawing.roles.exclude,2001);assert.match(request.drawing.purpose,/실리콘/);assert.ok(request.documents.some(d=>d.name==='DWG 추출 문자'));
 let shared;await page.route('**/api/project/share',async route=>{shared=route.request().postDataJSON();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({file:shared.file.name})});});await page.locator('#share-current').click();await page.waitForFunction(()=>document.querySelector('#share-current').textContent==='현재 작업 전달');assert.equal(shared.file.name,'symbols-test.dwg');assert.equal(shared.raw,undefined);assert.equal(shared.takeoff.inputs.minLength,3000);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['real DWG browser decode','automatic scope','2000 symbols one question','8-row details pagination','one answer per pattern','saved inputs retained','reload restoration','drawing context sent to AI','agreed common defaults','current-project handoff request','no browser exceptions'],metrics},null,2));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
