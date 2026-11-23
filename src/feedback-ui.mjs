export function connectFeedback(trace,download) {
  const byId=id=>document.getElementById(id);
  const dialog=byId('feedback-dialog'), description=byId('feedback-text'), kind=byId('feedback-kind');
  const preview=byId('feedback-preview'), status=byId('feedback-status');
  const send=byId('feedback-send'), save=byId('feedback-file');
  const key='facade-feedback-draft-v1';
  let report=null;
  function preserve() {
    try {localStorage.setItem(key,JSON.stringify({kind:kind.value,text:description.value,report}));}
    catch {status.textContent='이 기기에 초안을 저장할 수 없습니다. 파일로 보관해주세요.';}
  }
  function showPreview() {
    preview.textContent=report?JSON.stringify(report,null,2):'';
    send.disabled=save.disabled=!report;
  }
  function edit() {
    report=null;
    status.textContent='';
    showPreview();
    preserve();
  }
  try {
    const draft=JSON.parse(localStorage.getItem(key));
    if(draft){description.value=draft.text;kind.value=draft.kind;report=draft.report;}
  } catch {}
  showPreview();
  description.oninput=kind.onchange=edit;
  byId('open-feedback').onclick=()=>dialog.showModal();
  byId('feedback-close').onclick=()=>dialog.close();
  byId('feedback-review').onclick=()=>{
    if(!description.value.trim()){description.focus();return;}
    report ||= trace.report(kind.value,description.value.trim());
    showPreview();preserve();
  };
  save.onclick=()=>download(JSON.stringify(report,null,2),'facade-feedback-'+report.id+'.json');
  send.onclick=async()=>{
    const outgoing=report;
    send.disabled=true;status.textContent='보내는 중…';
    try {
      const res=await fetch('/api/feedback',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(outgoing),signal:AbortSignal.timeout(15000)});
      if(res.status===503) throw Error('접수처가 연결되지 않았습니다. 진단 파일을 저장해 담당자에게 전달해주세요.');
      if(!res.ok || (await res.json()).id!==outgoing.id) throw Error();
      if(report===outgoing){description.value='';edit();status.textContent='접수번호 '+outgoing.id;}
    } catch(error) {
      if(report===outgoing)status.textContent=error.message.startsWith('접수처')?error.message:'접수 확인에 실패했습니다. 다시 보내거나 파일로 전달해주세요.';
    } finally {send.disabled=!report;}
  };
}
