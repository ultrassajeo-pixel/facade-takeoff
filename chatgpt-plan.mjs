import {spawn,execFile} from 'node:child_process';
import {access,mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const parentEnv=typeof process==='undefined'?{}:process.env;
const loginInstruction = parentEnv.FACADE_PROJECT_DIRECTORY
 ? '외벽산출 앱 창에서 ChatGPT 로그인을 눌러주세요.'
 : 'connect-chatgpt.command를 실행해주세요.';
export const REPLY_SCHEMA={type:'object',properties:{reply:{type:'string'},proposals:{type:'array',items:{type:'object',properties:{field:{type:'string'},value:{anyOf:[{type:'string'},{type:'number'}]},evidence:{type:'string'}},required:['field','value','evidence'],additionalProperties:false}}},required:['reply','proposals'],additionalProperties:false};
// Authentication stays inside the official CLI. Never read, copy, or export its token store.
// API credentials and provider overrides are not inherited by the subscription process.
export function subscriptionEnvironment(source=parentEnv){return Object.fromEntries(['PATH','HOME','USER','LOGNAME','SHELL','TMPDIR','LANG','LC_ALL','CODEX_HOME','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','NO_PROXY'].filter(k=>typeof source[k]==='string').map(k=>[k,source[k]]));}
export async function findCodex(source=parentEnv){
 const candidates=[source.FACADE_CODEX_PATH,'/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex','/Applications/Codex.app/Contents/Resources/codex',...(source.PATH||'').split(path.delimiter).filter(Boolean).map(p=>path.join(p,'codex'))];
 for(const p of candidates.filter(p=>typeof p==='string'&&path.isAbsolute(p))){try{await access(p,constants.X_OK);return p;}catch{}}
 return null;
}
export function loginKind(output){if(/logged in using chatgpt/i.test(output))return 'chatgpt';if(/api.?key/i.test(output))return 'api-key';return 'signed-out';}
export async function chatgptStatus({binary,env=subscriptionEnvironment()}={}){
 binary||=await findCodex();if(!binary)return {available:false,authenticated:false,reason:'Codex 실행 파일을 찾지 못했습니다. ChatGPT 앱 또는 공식 Codex CLI가 필요합니다.'};
 return new Promise(resolve=>{execFile(binary,['login','status'],{env,timeout:10000,maxBuffer:65536,windowsHide:true},(error,stdout,stderr)=>{const kind=loginKind(stdout+'\n'+stderr),authenticated=!error&&kind==='chatgpt';resolve({available:true,authenticated,authType:kind,reason:authenticated?'이 Mac의 ChatGPT 로그인으로 연결되어 있습니다.':kind==='api-key'?'현재 Codex가 API 키로 로그인되어 있습니다. 구독 사용을 위해 ChatGPT 로그인이 필요합니다.':'ChatGPT 로그인이 필요합니다. '+loginInstruction});});});
}
export function sessionArgs(directory,model=''){
 const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--color','never','--json','--output-schema',path.join(directory,'schema.json'),'--output-last-message',path.join(directory,'reply.json'),'-C',directory,'-c','approval_policy="never"','-c','web_search="disabled"','-c','project_doc_max_bytes=0'];
 // This integration only needs a language response; coding, browsing, connectors and delegation are disabled.
 for(const feature of ['shell_tool','apps','plugins','browser_use','computer_use','view_image','memories','multi_agent','multi_agent_v2','skill_search'])args.push('--disable',feature);
 if(model)args.push('--model',model);args.push('-');return args;
}
export function safeFailure(text){
 if(/usage.?limit|rate.?limit|quota|429|usage.?unavailable/i.test(text))return 'ChatGPT 구독 사용 한도에 도달했거나 현재 사용할 수 없습니다. 한도와 초기화 시간을 확인해주세요. 유료 API로 자동 전환하지 않습니다.';
 if(/401|unauthorized|not logged in|authentication|token.*expired/i.test(text))return 'ChatGPT 로그인이 만료되었거나 사용할 수 없습니다. '+loginInstruction;
 if(/unrecognized|unexpected argument|unknown feature|not.*supported/i.test(text))return '설치된 Codex 버전이 이 연결 방식 또는 선택 모델을 지원하지 않습니다. ChatGPT/Codex를 업데이트하거나 모델명을 확인해주세요.';
 return 'ChatGPT 구독 연결에서 응답을 완료하지 못했습니다. 로그인·네트워크·사용 한도를 확인해주세요. 유료 API로 자동 전환하지 않습니다.';
}
export async function askChatGPT(prompt,{model='',signal,binary,timeout=120000,env=subscriptionEnvironment()}={}){
 if(typeof prompt!=='string'||prompt.length>150000)throw Error('AI에 보낼 내용이 너무 큽니다. 필요한 자료만 남겨주세요.');
 if(model&&(!/^[a-zA-Z0-9._:/-]+$/.test(model)||model.length>120))throw Error('모델명 형식이 올바르지 않습니다. 자동 선택은 비워두세요.');
 binary||=await findCodex();const status=await chatgptStatus({binary,env});if(!status.authenticated)throw Error(status.reason);
 if(signal?.aborted)throw Error('대화 요청을 취소했습니다.');
 const directory=await mkdtemp(path.join(tmpdir(),'facade-chatgpt-'));
 try{
  await writeFile(path.join(directory,'schema.json'),JSON.stringify(REPLY_SCHEMA),{mode:0o600});
  await new Promise((resolve,reject)=>{
   const child=spawn(binary,sessionArgs(directory,model),{cwd:directory,env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
   let settled=false,buffer='',diagnostics='',completed=false,outputBytes=0;
   const stop=()=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM');}catch{}};
   const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);if(error){stop();reject(error);}else resolve();};
   const abort=()=>finish(Error('대화 요청을 취소했습니다.'));
   const timer=setTimeout(()=>finish(Error('ChatGPT 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')),timeout);signal?.addEventListener('abort',abort,{once:true});
   const inspectLine=line=>{let event;try{event=JSON.parse(line);}catch{return;}
    if(event.type==='turn.completed')completed=true;
    if(event.type==='turn.failed'||event.type==='error')diagnostics+=JSON.stringify(event);
    if(['command_execution','mcp_tool_call','file_change','web_search','collab_agent_tool_call'].includes(event.item?.type))finish(Error('대화 전용 연결에서 도구 실행을 요청해 응답을 중단했습니다.'));
   };
   child.stdout.on('data',bytes=>{outputBytes+=bytes.length;if(outputBytes>2*1024*1024){finish(Error('AI 응답이 처리 용량을 넘었습니다.'));return;}buffer+=bytes;let end;while((end=buffer.indexOf('\n'))>=0){inspectLine(buffer.slice(0,end));buffer=buffer.slice(end+1);}});
   child.stderr.on('data',bytes=>{diagnostics=(diagnostics+bytes).slice(-16000);});
   child.on('error',()=>finish(Error('Codex 실행 파일을 시작하지 못했습니다.')));
   child.on('close',code=>{if(buffer.trim())inspectLine(buffer);finish(code===0&&completed?null:Error(safeFailure(diagnostics)));});
   child.stdin.on('error',()=>{});if(signal?.aborted){abort();return;}child.stdin.end(prompt);
  });
  const text=await readFile(path.join(directory,'reply.json'),'utf8');if(text.length>100000)throw Error('AI 응답이 너무 깁니다.');
  let reply;try{reply=JSON.parse(text);}catch{throw Error('ChatGPT가 구조화된 조건을 반환하지 않았습니다.');}
  if(typeof reply.reply!=='string'||!Array.isArray(reply.proposals))throw Error('ChatGPT 응답의 필수 항목이 없습니다.');
  return {mode:'chatgpt',reply:reply.reply,proposals:reply.proposals.slice(0,100),billing:'chatgpt-subscription'};
 }finally{await rm(directory,{recursive:true,force:true});}
}
