import { readDwg } from './dwg-reader.mjs';
import { normalizeDrawing } from './geometry.mjs';
import {assembleReferences,BUNDLE_SCHEMA} from './xrefs.mjs';
import {drawingFingerprint} from './drawing-intake.mjs';
self.onmessage = async ({data}) => {
  try {
    const sources=[];
    for(const [index,source] of data.sources.entries()){
      self.postMessage({type:'progress',message:`DWG 읽기 ${index+1}/${data.sources.length} · ${source.path}`});
      const parsed=source.parsed||await readDwg(new Uint8Array(source.bytes),new URL('../vendor/libredwg/wasm',import.meta.url).href);
      sources.push({path:source.path,file:source.file,parsed});
    }
    const bundle={schema:BUNDLE_SCHEMA,mainPath:data.mainPath,sources};
    self.postMessage({type:'progress',message:'참조 연결·배치 좌표·누락 여부를 검사하고 있습니다.'});
    const drawing=normalizeDrawing(assembleReferences(bundle));
    const raw=JSON.stringify(bundle,(_,v)=>typeof v==='bigint'?v.toString():v);
    const main=sources.find(s=>s.path===data.mainPath);
    self.postMessage({type:'result',drawing,raw,file:{...main.file,mainSha256:main.file.sha256,sha256:await drawingFingerprint(bundle)}});
  } catch(error) { self.postMessage({type:'error',message:error.message||String(error)}); }
};
