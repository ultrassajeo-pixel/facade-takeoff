import {FIELDS,isValid} from './rules.mjs';
const aliases={panelWidth:['유효폭','판넬 유효폭','패널 유효폭'],orderWidth:['발주 원폭','판넬 원폭'],supportSpacing:['하지 간격','하지간격'],supportOffset:['첫 하지 위치'],maxLength:['최대 제작 길이','최대 길이'],screwSpacing:['피스 간격'],screwRows:['피스 줄 수'],cartridgeMl:['실리콘 용량'],beadWidth:['줄눈 폭'],beadDepth:['줄눈 깊이'],panelSpec:['판넬 규격'],boltSpec:['볼트 규격'],screwSpec:['피스 규격'],sealantSpec:['실리콘 제품'],panelLoss:['판넬 할증','판넬 로스'],boltLoss:['볼트 할증'],screwLoss:['피스 할증'],sealantLoss:['실리콘 할증']};
const reEscape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function localProposals(text,source='입력 문장'){
 const out=[];for(const f of FIELDS){const names=[f.label,f.id,...(aliases[f.id]||[])].sort((a,b)=>b.length-a.length);
  const regex=new RegExp('(?:^|[\\n;,])\\s*('+names.map(reEscape).join('|')+')\\s*(?:[:=：]|은|는)?\\s*([^\\n;]+)','gi');let m;
  while((m=regex.exec(text))){let raw=m[2].trim(),value=raw;
   if(f.type==='number'){const num=raw.match(/^([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(mm|cm|mL|ml|m|%|개|줄|통)?\s*(?=,|$)/);if(!num)continue;value=Number(num[1].replaceAll(',',''));if(f.unit==='mm'&&num[2]==='cm')value*=10;if(f.unit==='mm'&&num[2]==='m')value*=1000;if(num[2]&&f.unit!=='mm'&&num[2]!==f.unit&&!(f.unit==='mL'&&num[2].toLowerCase()==='ml'))continue;}
   else if(f.type==='select'){const opt=f.options.find(([v,l])=>raw===v||raw===l);if(!opt)continue;value=opt[0];}
   if(isValid(f,value))out.push({field:f.id,value,evidence:m[0].trim(),source});
  }
 }return out;
}
export function mergeProposals(items){const map=new Map();for(const p of items){const f=FIELDS.find(f=>f.id===p.field);if(!f||!isValid(f,p.value)||!p.evidence)continue;const key=p.field+'|'+String(p.value);if(!map.has(key))map.set(key,{...p,sources:[p.source]});else map.get(key).sources.push(p.source);}const values=[...map.values()];return values.map(p=>({...p,conflict:values.some(q=>q.field===p.field&&String(q.value)!==String(p.value))}));}
export function groundedProposals(proposals,sources){
 return (Array.isArray(proposals)?proposals:[]).filter(p=>{
  const field=FIELDS.find(f=>f.id===p.field);if(!field||!isValid(field,p.value)||typeof p.evidence!=='string'||p.evidence.trim().length<2||!sources.some(s=>s.text.includes(p.evidence)))return false;
  if(field.type==='number'){const nums=[...p.evidence.matchAll(/(-?[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(mm|cm|mL|ml|m|%|개|줄|통)?/g)];return nums.some(m=>{let value=Number(m[1].replaceAll(',',''));if(field.unit==='mm'&&m[2]==='m')value*=1000;if(field.unit==='mm'&&m[2]==='cm')value*=10;return Math.abs(value-Number(p.value))<1e-8;});}return true;
 }).map(p=>({...p,source:sources.find(s=>s.text.includes(p.evidence)).name}));
}
export async function askAssistant({config,message,documents,pending,inputs,signal,drawingInfo,drawingText='',messages=[]}){
 const sources=[{name:'입력 문장',text:message},...(drawingText?[{name:'DWG 추출 문자',text:drawingText.slice(0,12000)}]:[]),...documents.flatMap(d=>d.pages.map(p=>({name:`${d.name} · ${p.page}쪽`,text:p.text})))];
 const local=mergeProposals(sources.flatMap(s=>localProposals(s.text,s.name)));
 if(!config?.provider||config.provider==='local')return {mode:'local',reply:local.length?`문서와 입력에서 ${local.length}개 조건 후보를 찾았습니다. 근거를 보고 계산 전 조건으로 확정해주세요.`:`${pending[0]?.message||'미정 조건을 확인해주세요.'} 항목부터 알려주세요. “하지 간격: 1200 mm”처럼 항목과 값을 함께 적으면 조건 후보로 읽을 수 있습니다.`,proposals:local};
 const response=await fetch('/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider:config.provider,model:config.model,key:config.key,message,documents:sources.slice(1),pending:pending.map(p=>({id:p.id,message:p.message})),inputs,drawing:drawingInfo,messages:messages.slice(-6).map(m=>({role:m.role,text:m.text.slice(0,2000)})),fields:FIELDS.map(({id,label,type,unit,options})=>({id,label,type,unit,options}))}),signal});
 const data=await response.json();if(!response.ok)throw Error(data.error||'AI 요청을 처리하지 못했습니다.');
 return {...data,proposals:mergeProposals([...local,...groundedProposals(data.proposals,sources)])};
}
