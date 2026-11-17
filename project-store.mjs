import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProject} from './src/project.mjs';
const defaultDirectory=fileURLToPath(new URL('./.runtime',import.meta.url));
let queue=Promise.resolve();
export function saveSharedProject(project,directory=defaultDirectory){
 const validated=validateProject(structuredClone(project));delete validated.raw;
 const receipt={savedAt:new Date().toISOString(),project:validated};
 const write=queue.catch(()=>{}).then(async()=>{await mkdir(directory,{recursive:true,mode:0o700});const temporary=path.join(directory,'project.next.json');await writeFile(temporary,JSON.stringify(receipt),{mode:0o600});await rename(temporary,path.join(directory,'current-project.json'));return {savedAt:receipt.savedAt,file:validated.file.name,sha256:validated.file.sha256};});queue=write;return write;
}
export async function readSharedProject(directory=defaultDirectory){try{return JSON.parse(await readFile(path.join(directory,'current-project.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
