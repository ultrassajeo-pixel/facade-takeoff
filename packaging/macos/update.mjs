// The installed launcher runs this helper directly. No update API is exposed on localhost.
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,open,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {homedir} from 'node:os';

const repository='ultrassajeo-pixel/facade-takeoff';
const releaseURL='https://github.com/'+repository+'/releases/download/';
const api='https://api.github.com/repos/'+repository+'/releases/latest';
const versionPattern=/^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function selectUpdate(release,installed){
  const tag=release.tag_name||'';
  const version=tag.startsWith('mac-v')?tag.slice(5):'';
  if(!versionPattern.test(installed)||!versionPattern.test(version)||release.draft||release.prerelease)
    throw Error('Mac 정식 배포 버전을 확인하지 못했습니다.');
  const local=installed.split('.').map(Number);
  const delta=version.split('.').map((n,i)=>Number(n)-local[i]).find(n=>n!==0);
  if(!(delta>0))return null;
  const name='Facade-Takeoff-'+version+'-Mac.pkg';
  const asset=release.assets?.find(a=>a.name===name);
  if(!asset||asset.browser_download_url!==releaseURL+tag+'/'+name||
     !Number.isSafeInteger(asset.size)||asset.size<=0||asset.size>2**30||!/^sha256:[0-9a-f]{64}$/.test(asset.digest))
    throw Error('배포 파일의 주소·크기·체크섬을 확인하지 못했습니다.');
  return {version,name,url:asset.browser_download_url,size:asset.size,digest:asset.digest};
}
async function latest(installed){
  const response=await fetch(api,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('GitHub에서 최신 Mac 배포를 확인하지 못했습니다. 잠시 후 다시 시도하세요.');
  return selectUpdate(await response.json(),installed);
}
export async function downloadUpdate(update,cache,request=fetch){
  await mkdir(cache,{recursive:true,mode:0o700});
  const dir=await mkdtemp(join(cache,'release-'));
  let file;
  try{
    const response=await request(update.url,{signal:AbortSignal.timeout(600000)});
    if(!response.ok||!response.body)throw Error('설치 파일을 내려받지 못했습니다.');
    file=await open(join(dir,'partial'),'wx',0o600);
    const hash=createHash('sha256');let total=0;
    for await(const chunk of response.body){
      total+=chunk.length;
      if(total>update.size)throw Error('다운로드 크기가 배포 정보와 다릅니다.');
      hash.update(chunk);await file.writeFile(chunk);
    }
    if(total!==update.size||'sha256:'+hash.digest('hex')!==update.digest)throw Error('파일 검증에 실패했습니다. 다시 시도하세요.');
    await file.close();file=null;
    const destination=join(dir,update.name);
    await rename(join(dir,'partial'),destination);
    return destination;
  }catch(error){await file?.close();await rm(dir,{force:true,recursive:true});throw error;}
}
async function main(){
  const [action,installed,expected]=process.argv.slice(2);
  const update=await latest(installed);
  if(action==='check')return update||{version:installed};
  if(action!=='download'||!update||expected!==update.version)throw Error('배포 버전이 변경되었습니다. 다시 확인하세요.');
  const cache=join(homedir(),'Library','Caches','com.ultrassa.facadetakeoff','updates');
  return {path:await downloadUpdate(update,cache)};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  main().then(value=>console.log(JSON.stringify(value))).catch(error=>{console.log(JSON.stringify({error:error.message}));process.exitCode=1;});
}
