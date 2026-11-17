const EPS=1e-6;
const total=xs=>xs.reduce((a,x)=>a+x,0);
const cost=(bins,min,step)=>total(bins.map(b=>Math.ceil((Math.max(min,b.sum)-1e-9)/step)*step));
export function combineCuts(pieces,{min=3000,max=13000,step=1,nodeLimit=250000}={}){
 if(!(min>0&&max>=min&&step>0&&[min,max,step].every(Number.isFinite)))throw Error('판넬 최소·최대 제작 길이가 올바르지 않습니다.');
 if(pieces.length>10000)throw Error('합산 절단 계획은 규격당 10,000조각까지 지원합니다.');
 const seen=new Set();for(const p of pieces){if(seen.has(p.id)||!Number.isFinite(p.length)||p.length<=0||Math.ceil((p.length-1e-9)/step)*step>max+EPS)throw Error('중복 조각 또는 제작 한도를 넘는 길이입니다.');seen.add(p.id);}
 const sorted=[...pieces].sort((a,b)=>b.length-a.length||String(a.id).localeCompare(String(b.id)));
 const packed=(order)=>{const bins=[];for(const p of order){const candidates=bins.filter(b=>Math.ceil((b.sum+p.length-1e-9)/step)*step<=max+EPS).sort((a,b)=>b.sum-a.sum);const b=candidates[0]||{sum:0,cuts:[]};if(!candidates.length)bins.push(b);b.sum+=p.length;b.cuts.push(p);}return bins;};
 let best=packed(sorted);const ascending=packed([...sorted].reverse());if(cost(ascending,min,step)<cost(best,min,step))best=ascending;
 // A valid plan matching total required length proves the material-length optimum.
 const required=total(pieces.map(p=>p.length));let bestCost=cost(best,min,step),nodes=0,exhausted=false,materialOptimal=Math.abs(bestCost-required)<EPS;
 if(!materialOptimal&&pieces.length<=24){const bins=[];
  const search=i=>{if(++nodes>nodeLimit){exhausted=true;return;}if(materialOptimal)return;
   if(i===sorted.length){const value=cost(bins,min,step);if(value<bestCost-EPS||(Math.abs(value-bestCost)<EPS&&bins.length<best.length)){best=bins.map(b=>({sum:b.sum,cuts:[...b.cuts]}));bestCost=value;}if(Math.abs(bestCost-required)<EPS)materialOptimal=true;return;}
   const p=sorted[i],tried=new Set();for(const b of bins){const key=b.sum.toFixed(6);if(tried.has(key)||Math.ceil((b.sum+p.length-1e-9)/step)*step>max+EPS)continue;tried.add(key);b.sum+=p.length;b.cuts.push(p);if(cost(bins,min,step)<=bestCost+EPS)search(i+1);b.cuts.pop();b.sum-=p.length;if(exhausted||materialOptimal)return;}
   bins.push({sum:p.length,cuts:[p]});if(cost(bins,min,step)<=bestCost+EPS)search(i+1);bins.pop();
  };search(0);if(!exhausted)materialOptimal=true;
 }
 if(!pieces.length)materialOptimal=true;
 if(!materialOptimal)throw Error('합산 발주의 잔재 최소 조합을 처리 한도 내에서 확정하지 못했습니다. 확정 수량을 발행하지 않았습니다.');
 const orders=best.map((b,i)=>{const length=Math.ceil((Math.max(min,b.sum)-1e-9)/step)*step;let offset=0;return {id:`B${String(i+1).padStart(4,'0')}`,length,used:b.sum,remnant:Math.max(0,length-b.sum),cuts:b.cuts.map(p=>{const cut={...p,offset};offset+=p.length;return cut;})};});
 const ids=orders.flatMap(o=>o.cuts.map(c=>c.id));if(ids.length!==pieces.length||new Set(ids).size!==pieces.length||orders.some(o=>o.length<min-EPS||o.length>max+EPS||o.used>o.length+EPS))throw Error('절단 계획의 조각·길이 보존 검증 실패');
 return {orders,required,ordered:total(orders.map(o=>o.length)),remnant:total(orders.map(o=>o.remnant)),materialOptimal:true,blankCountOptimal:false,method:'길이 보존 하한 또는 완전 탐색으로 재료 길이 최소 검증',nodes};
}
