import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {handleApi} from './server-api.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
export function startServer(port=8765){
  const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.dwg':'application/octet-stream'};
  const server=http.createServer(async(req,res)=>{
    if(!['127.0.0.1','localhost'].includes((req.headers.host||'').split(':')[0])){res.writeHead(403).end();return;}
    const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-cache','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"};
    try{
      let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if(pathname.startsWith('/api/')){await handleApi(req,res,pathname,headers);return;}
      if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
      // Emscripten's embind wrapper generates functions inside the isolated parser worker.
      // Keep eval disallowed on the page; permit it only for this worker entry response.
      if(pathname==='/src/dwg-worker.mjs')headers['Content-Security-Policy']=headers['Content-Security-Policy'].replace("script-src 'self' 'wasm-unsafe-eval'", "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'");
      if(pathname==='/_health'){res.writeHead(200,{...headers,'Content-Type':'application/json'}).end(JSON.stringify({application:'facade-workspace',version:'0.6.2'}));return;}
      if(pathname==='/' )pathname='/index.html';
      if(pathname.split('/').some(p=>p.startsWith('.')))throw Error('Invalid path');
      const filename=path.resolve(root,'.'+pathname);
      if(!filename.startsWith(root))throw Error('Invalid path');
      const info=await stat(filename);if(!info.isFile())throw Error('Not a file');
      const bytes=await readFile(filename);res.writeHead(200,{...headers,'Content-Type':types[path.extname(filename)]||'application/octet-stream','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
    }catch{res.writeHead(404,headers).end('Not found');}
  });
  return new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>resolve(server));});
}
if(typeof process!=='undefined'&&process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await startServer();console.log('Facade Workspace: http://127.0.0.1:8765');
}
