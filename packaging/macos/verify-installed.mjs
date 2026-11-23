// Verify the actual extracted or installed app, using disposable user state.
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, readdir} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createInterface} from 'node:readline';
import {setTimeout as delay} from 'node:timers/promises';

const app = resolve(process.argv[2]);
const root = fileURLToPath(new URL('../../', import.meta.url));
const resources = join(app,'Contents/Resources');
const workspace = join(resources,'workspace');
const directory = await mkdtemp(join(tmpdir(),'facade-verify-'));
const env = {HOME:directory, CODEX_HOME:join(directory,'codex'), PATH:'/usr/bin:/bin',
  FACADE_CODEX_PATH:join(resources,'runtime/codex'), FACADE_PROJECT_DIRECTORY:join(directory,'projects')};
const node = join(resources,'runtime/node');
await mkdir(env.CODEX_HOME);
let server;
try {
  for (const name of ['server.mjs','server-api.mjs','docx-reader.mjs','docx-text.xsl','project-store.mjs','index.html',
      ...((await readdir(join(root,'src'))).map(file => 'src/'+file))]) {
    assert.deepEqual(await readFile(join(workspace,name)), await readFile(join(root,name)), name);
  }
  for (const name of [node, env.FACADE_CODEX_PATH, join(app,'Contents/MacOS/FacadeTakeoff')]) {
    const arch = execFileSync('/usr/bin/lipo',['-archs',name],{encoding:'utf8'});
    assert.ok(arch.includes('x86_64') && arch.includes('arm64'), arch);
    const deps = execFileSync('/usr/bin/otool',['-L',name],{encoding:'utf8'});
    assert.doesNotMatch(deps.split('\n').filter(line => line.startsWith('\t')).join('\n'), /\/opt\/homebrew|\/usr\/local|\/Users\//);
  }
  assert.match(execFileSync(node,['--version'],{env,encoding:'utf8'}),/v24\.22\.3/);
  assert.match(execFileSync(env.FACADE_CODEX_PATH,['--version'],{env,encoding:'utf8'}),/0\.171\.0/);
  server = spawn(node,[join(workspace,'workspace-server.mjs'),'0'],{env,stdio:['pipe','pipe','inherit']});
  const done = once(server,'exit');
  const lines = createInterface({input:server.stdout});
  const line = await Promise.race([once(lines,'line').then(([line]) => line), done.then(() => {throw Error('Server exited before binding');})]);
  assert.match(line,/^http:\/\/127\.0\.0\.1:\d+\/$/);
  const origin = new URL(line).origin;
  const health = await (await fetch(origin+'/_health')).json();
  assert.equal(health.application,'facade-workspace');
  const headers = {origin, 'content-type':'application/json'};
  for (const path of ['/','/src/feedback-delivery.mjs','/vendor/libredwg/wasm/libredwg-web.wasm','/samples/facade_sample_12m_6m.dwg']) {
    const result = await fetch(origin+path);
    assert.equal(result.status,200,path);
    assert.ok((await result.arrayBuffer()).byteLength > 0);
  }
  const account = (await fetch(origin+'/api/status').then(r=>r.json())).chatgpt;
  assert.ok(account.available); assert.equal(account.authenticated,false);
  assert.match(account.reason,/앱 창에서 ChatGPT 로그인/);
  const fixture = await readFile(join(root,'tests/fixtures/sample-spec.docx'));
  const doc = await fetch(origin+'/api/document',{method:'POST',headers,body:JSON.stringify({data:fixture.toString('base64')})});
  assert.equal(doc.status,200); assert.match((await doc.json()).text,/판넬 유효폭: 1000 mm/);
  const sample = JSON.parse(await readFile(join(root,'samples/facade_sample_complete.facade.json')));
  const shared = await fetch(origin+'/api/project/share',{method:'POST',headers,body:JSON.stringify(sample)});
  assert.equal(shared.status,200); assert.equal((await shared.json()).file,sample.file.name);
  const latest = await fetch(origin+'/api/project/latest').then(r=>r.json());
  assert.equal(latest.project.file.name,sample.file.name);
  assert.ok((await readFile(join(env.FACADE_PROJECT_DIRECTORY,'current-project.json'))).length);
  server.stdin.end();
  const [exit] = await Promise.race([done,delay(4000,undefined,{ref:false}).then(()=>{throw Error('Orphaned server');})]);
  assert.equal(exit,0);
  console.log(JSON.stringify({health,architectures:['arm64','x86_64'],testedRuntime:process.arch,
    bundledNode:'24.22.3',bundledCodex:'0.171.0',newUserAuthenticated:false,docx:true,
    sharedProject:true,childExitedOnLauncherClose:true,sourceEquality:true}));
} finally {
  if (server && server.exitCode === null) server.kill();
  await rm(directory,{recursive:true,force:true});
}
