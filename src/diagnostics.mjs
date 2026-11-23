const traceKey = 'facade-diagnostic-events-v1';
const stages = new Set(['select','parse','references','geometry','validate','restore','answer','save','calculate','screen']);
const statuses = new Set(['start','ok','failed','timeout','cancelled','blocked','applied','invalid']);
const counters = ['files','bytes','objects','blockers','pending','mainIndex','fieldIndex','parserCode','missingRefs','ambiguousRefs','windows','walls'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const integer = n => Number.isSafeInteger(n) && n >= 0;
function validEvent(e) {
  return e && stages.has(e.stage) && statuses.has(e.status) && integer(e.at) && typeof e.run==='string' && uuid.test(e.run)
    && Object.keys(e).every(k=>['stage','status','at','run'].includes(k) || counters.includes(k) && integer(e[k]));
}

export function cleanReport(r) {
  if (!r || r.schema !== 1 || r.build !== '0.6.2-diag.1' || typeof r.id!=='string' || !uuid.test(r.id)
    || !['error','idea','quantity'].includes(r.kind) || typeof r.description !== 'string'
    || !r.description.trim() || r.description.length > 2000 || !Array.isArray(r.events)
    || r.events.length > 64 || !r.events.every(validEvent)
    || Object.keys(r).some(k=>!['schema','build','id','kind','description','events'].includes(k))) {
    throw Error('진단 파일의 항목과 형식을 확인해주세요.');
  }
  return r;
}

export function makeTrace(storage) {
  let run = crypto.randomUUID();
  let events = [];
  try {
    const saved = JSON.parse(storage?.getItem(traceKey) || '[]');
    if (Array.isArray(saved)) events = saved.slice(-64).filter(validEvent);
  } catch {}
  function mark(stage,status,details={},operation=run) {
    const entry = {run:operation, at:Date.now(),stage,status};
    for (const k of counters) if (integer(details[k])) entry[k]=details[k];
    if (!validEvent(entry)) return;
    events.push(entry);
    if (events.length > 64) events.shift();
    try {storage?.setItem(traceKey,JSON.stringify(events));} catch {}
  }
  return {
    mark,
    bind() {const operation=run;return (stage,status,details)=>mark(stage,status,details,operation);},
    begin() {run = crypto.randomUUID();},
    report(kind,description) {
      return cleanReport({schema:1,build:'0.6.2-diag.1',id:crypto.randomUUID(),kind,description,events:structuredClone(events)});
    }
  };
}
