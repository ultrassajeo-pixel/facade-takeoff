import {cleanReport} from './diagnostics.mjs';

const inbox='https://facade-takeoff-feedback.ultrassa.chatgpt.site/feedback';
export async function deliverFeedback(input,config={},request=fetch) {
  const report=cleanReport(input);
  const address=new URL(config.FACADE_FEEDBACK_URL || inbox);
  if(address.protocol!=='https:' && !(address.protocol==='http:' && address.hostname==='127.0.0.1')) {
    throw Error('접수 주소를 확인해주세요.');
  }
  const headers={'Content-Type':'application/json'};
  if(config.FACADE_FEEDBACK_URL && config.FACADE_INBOX_TOKEN) headers.Authorization='Bearer '+config.FACADE_INBOX_TOKEN;
  const response=await request(address,{method:'POST',headers,body:JSON.stringify(report),
    redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!response.ok || (await response.json()).id!==report.id)throw Error('담당자 접수함에서 접수를 확인하지 못했습니다.');
  return {id:report.id};
}
