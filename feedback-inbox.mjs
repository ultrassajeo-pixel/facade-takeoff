import {mkdir, writeFile, readFile, link, unlink, readdir} from 'node:fs/promises';
import {randomUUID, timingSafeEqual, createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {homedir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cleanReport} from './src/diagnostics.mjs';

export async function acceptReport(directory,input) {
  const report = cleanReport(input);
  await mkdir(directory,{recursive:true,mode:0o700});
  const final = path.join(directory,report.id+'.json');
  const temp = path.join(directory,randomUUID()+'.tmp');
  const data = JSON.stringify(report);
  await writeFile(temp,data,{flag:'wx',mode:0o600,flush:true});
  try {
    try {await link(temp,final);}
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (await readFile(final,'utf8') !== data) throw Error('같은 번호의 다른 내용이 있습니다.');
    }
  } finally {await unlink(temp);}
  return report.id;
}

export function receiver(directory,token) {
  if (!token || token.length<32) throw Error('접수용 토큰은 32자 이상이어야 합니다.');
  const hash = value => createHash('sha256').update(value).digest();
  return createServer(async (req,res)=>{
    const send=(status,value)=>res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(value));
    if (req.method!=='POST' || req.url!=='/feedback') return send(404,{});
    if (!timingSafeEqual(hash(req.headers.authorization||''),hash('Bearer '+token))) return send(403,{});
    try {
      const parts=[]; let size=0;
      for await (const chunk of req) {
        size+=chunk.length;
        if(size>65536) return send(413,{});
        parts.push(chunk);
      }
      const id=await acceptReport(directory,JSON.parse(Buffer.concat(parts).toString()));
      send(201,{id});
    } catch {send(400,{error:'접수 내용을 저장할 수 없습니다.'});}
  });
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const dir=process.env.FACADE_INBOX_DIR || path.join(homedir(),'.facade-feedback');
  const [command,arg]=process.argv.slice(2);
  if(command==='serve') receiver(dir,process.env.FACADE_INBOX_TOKEN).listen(8791,'127.0.0.1');
  else if(command==='import') console.log(await acceptReport(dir,JSON.parse(await readFile(arg,'utf8'))));
  else if(command==='list') {
    await mkdir(dir,{recursive:true,mode:0o700});
    for(const name of (await readdir(dir)).filter(n=>n.endsWith('.json'))) {
      const r=cleanReport(JSON.parse(await readFile(path.join(dir,name),'utf8')));
      console.log(JSON.stringify({id:r.id,kind:r.kind,description:r.description}));
    }
  } else throw Error('사용법: node feedback-inbox.mjs serve | import <파일> | list');
}
