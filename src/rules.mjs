const n=(id,label,unit,min=0,extra={})=>({id,label,unit,type:'number',min,max:10000000,...extra});
const s=(id,label,options,extra={})=>({id,label,type:'select',options,...extra});
const t=(id,label,extra={})=>({id,label,type:'text',...extra});
export const GROUPS=['도면 기준','판넬 주문','하지·볼트','후레싱 피스','실리콘'];
export const FIELDS=[
 s('units','도면 좌표 1의 실제 길이',[['mm','1 mm'],['cm','1 cm'],['m','1 m'],['inch','1 inch'],['feet','1 foot']],{group:0}),
 t('scope','동·입면·층 등 산출 범위',{group:0}),
 s('uniform','선택한 외벽에 동일한 공법·자재·배치 기준을 적용하나요?',[['yes','네, 동일 기준'],['no','구간별로 다릅니다']],{group:0,note:'다르면 구간을 나눠 프로젝트별로 산출합니다.'}),
 s('edgeOwnership','다른 입면과 공유하는 코너 후레싱을 중복 없이 배분했나요?',[['allocated','네, 이 범위에서 담당하는 부위만 설치로 지정'],['unresolved','아직 배분하지 않았음']],{group:0,note:'같은 코너를 양쪽 입면에서 두 번 산출하지 않도록 부위별 설치/미설치를 결정합니다.'}),
 t('panelSpec','판넬 제조사·제품명·두께',{group:1}),
 s('direction','판넬 길이 방향',[['vertical','세로'],['horizontal','가로']],{group:1}),
 s('startSide','폭 분할을 시작할 쪽',[['low','왼쪽 / 아래쪽'],['high','오른쪽 / 위쪽']],{group:1}),
 n('panelWidth','판넬 유효폭','mm',0,{group:1,positive:true}),
 n('orderWidth','판넬 발주 원폭','mm',0,{group:1,positive:true,note:'마지막 좁은 판넬도 원폭 1장으로 주문합니다.'}),
 s('panelOrderMode','판넬 발주 구성',[['single','조각별 개별 발주'],['combined','같은 규격 조각 합산 발주']],{group:1,when:v=>v.panelOrderMode==='combined'}),
 n('minLength','공장 최소 제작 길이','mm',0,{group:1,positive:true,when:v=>v.panelOrderMode==='combined'}),
 n('maxLength','최대 제작·운반 가능 길이','mm',0,{group:1,positive:true}),
 t('seams','길이 방향 이음 위치',{group:1}),
 n('panelLap','길이 방향 이음 겹침','mm',0,{group:1,note:'이음선의 낮은 좌표 쪽 판넬을 이 값만큼 연장합니다. 맞댐이면 0.'}),
 n('trim','판넬 1장당 길이 절단 여유 합계','mm',0,{group:1}),
 n('lengthStep','주문 길이 올림 단위','mm',0,{group:1,positive:true}),
 s('procurement','판넬 주문 방식',[['custom','길이별 주문 제작'],['fixed','정척 주문 후 절단']],{group:1}),
 n('stockPanelLength','판넬 정척 길이','mm',0,{group:1,positive:true,when:v=>v.procurement==='fixed'}),
 s('openings','개구부 제작 방식',[['cut','전체 판넬 주문 후 개구부 현장 절단'],['split','개구부 차감 후 연결된 조각별 주문']],{group:1,note:'부분적으로 걸친 개구부는 절단 형상으로 남습니다.'}),
 s('reuse','절단 잔재를 다른 판넬에 재사용하나요?',[['no','재사용하지 않음'],['yes','재사용 필요']],{group:1,note:'재사용 최적화가 필요한 공법은 별도 절단 계획이 필요해 산출을 차단합니다.'}),
 n('panelLoss','규격별 예비 판넬 할증','%',0,{group:1,max:100}),
 s('supportMode','하지 위치 입력 방식',[['spacing','등간격 배치'],['positions','실제 위치 목록']],{group:2}),
 n('supportSpacing','판넬 길이 방향을 따라 만나는 하지 간격','mm',0,{group:2,positive:true,when:v=>v.supportMode==='spacing'}),
 n('supportOffset','첫 하지 위치 · 외벽 시작점 기준','mm',0,{group:2,when:v=>v.supportMode==='spacing'}),
 t('supportPositions','하지 위치 목록 · 외벽 시작점 기준',{group:2,when:v=>v.supportMode==='positions',placeholder:'0, 1200, 2400, 3600, 4800, 6000'}),
 s('endSupport','모든 판넬 조각의 끝단·이음부에 보강하지가 있나요?',[['yes','모든 끝단에 있음'],['no','기입한 하지 위치만 있음']],{group:2}),
 t('boltSpec','판넬 고정 볼트 규격',{group:2}),
 n('endBolts','끝단 하지의 연속 고정구간당 볼트','개',0,{group:2,integer:true,positive:true}),
 n('middleBolts','중간 하지의 연속 고정구간당 볼트','개',0,{group:2,integer:true,positive:true}),
 s('openingExtra','주고정 외에 개구부 둘레의 추가 볼트가 있나요?',[['none','추가 볼트 없음 · 주고정 수에 모두 포함'],['perEdge','개구부 각 변에 별도로 추가']],{group:2,note:'추가분만 계산합니다. 주고정과 같은 볼트를 중복 입력하지 마세요.'}),
 n('openingBoltSpacing','개구부 추가 볼트 최대 간격','mm',0,{group:2,positive:true,when:v=>v.openingExtra==='perEdge'}),
 n('openingBoltRows','개구부 추가 볼트 줄 수','줄',0,{group:2,positive:true,integer:true,when:v=>v.openingExtra==='perEdge'}),
 n('openingBoltInset','개구부 각 변 양끝 볼트 이격','mm',0,{group:2,when:v=>v.openingExtra==='perEdge'}),
 s('doorBottomBolts','출입구 하부에도 볼트를 추가하나요?',[['yes','하부 포함'],['no','하부 제외']],{group:2,when:v=>v.openingExtra==='perEdge'}),
 n('boltLoss','볼트 할증','%',0,{group:2,max:100}),
 n('boltPack','볼트 포장당 수량','개',0,{group:2,positive:true,integer:true}),
 t('screwSpec','후레싱용 피스 규격',{group:3}),
 n('screwSpacing','후레싱 피스 최대 간격','mm',0,{group:3,positive:true}),
 n('screwRows','후레싱 피스 줄 수','줄',0,{group:3,positive:true,integer:true}),
 n('screwInset','피스의 후레싱 양끝 이격','mm',0,{group:3}),
 n('lapScrews','후레싱 겹침 1곳당 추가 피스','개',0,{group:3,integer:true}),
 n('screwLoss','피스 할증','%',0,{group:3,max:100}),
 n('screwPack','피스 포장당 수량','개',0,{group:3,positive:true,integer:true}),
 s('sealantMethod','실리콘 소요량 기준',[['volume','줄눈 체적'],['length','통당 시공 길이']],{group:4,when:v=>v.sealantMethod==='length'}),
 n('sealantYield','실리콘 한 통당 시공 길이','mm',0,{group:4,positive:true,when:v=>v.sealantMethod==='length'}),
 s('caulkJunction','창호 접합 코킹과 후레싱 측면 코킹의 관계',[['shared','같은 코킹선은 한 번만 계산'],['separate','서로 다른 면의 별도 코킹선']],{group:4,when:v=>v.sealantMethod==='length'&&v.openingFlashing,note:'상세도에 같은 물리적 접합선으로 표시되었는지 확인합니다. 다른 면의 코킹선을 합치지 않습니다.'}),
 t('sealantSpec','실리콘 제품·규격',{group:4}),
 n('beadWidth','실리콘 줄눈 폭','mm',0,{group:4,positive:true}),
 n('beadDepth','실리콘 줄눈 깊이','mm',0,{group:4,positive:true}),
 s('beadShape','실리콘 줄눈 단면',[['rectangle','직사각형'],['triangle','삼각형']],{group:4}),
 n('sealantLines','후레싱 길이 방향 도포 줄 수','줄',0,{group:4,integer:true}),
 s('sealantBasis','길이 방향 도포 기준',[['net','설치 순길이'],['pieces','겹침을 포함한 제작 길이']],{group:4}),
 n('lapBeads','후레싱 겹침부 전개폭 방향 도포 줄 수','줄',0,{group:4,integer:true}),
 n('fillPercent','줄눈 충진율','%',0,{group:4,positive:true,max:100}),
 n('cartridgeMl','실리콘 1통 용량','mL',0,{group:4,positive:true}),
 n('sealantLoss','실리콘 할증','%',0,{group:4,max:100})
];
// Explicit positioning avoids an unverified automatic seam at the maximum length.
Object.assign(FIELDS.find(f=>f.id==='seams'),{group:1,placeholder:'없음 또는 3000, 6000',note:'외벽의 아래/왼쪽 시작점으로부터 거리(mm). 이음이 없으면 “없음”.'});
export const PROFILE_KINDS={wallTop:'외벽 상부',wallBottom:'외벽 하부',wallLeft:'외벽 좌측',wallRight:'외벽 우측',windowHead:'창문 상부',windowSill:'창문 하부',windowJamb:'창문 양옆',doorHead:'출입구 상부',doorJamb:'출입구 양옆',doorThreshold:'출입구 하부'};
export const PROFILE_FIELDS=[s('mode','적용 여부',[['apply','설치'],['none','미설치']]),t('spec','후레싱 형상·재질·두께'),n('stock','정척 길이','mm',0,{positive:true}),n('lap','겹침 길이','mm'),n('developed','전개폭','mm',0,{positive:true}),n('loss','예비 정척 할증','%',0,{max:100}),s('reuse','절단 잔재',[['no','구간 간 재사용 없음'],['yes','재사용 계획 필요']])];
export const SCALE={mm:1,cm:10,m:1000,inch:25.4,feet:304.8};
export function isValid(f,value){
 if(value===undefined||value===null||String(value).trim()==='')return false;
 if(f.type==='number'){const n=Number(value);return Number.isFinite(n)&&n>=(f.min??0)&&(!f.positive||n>0)&&(f.max===undefined||n<=f.max)&&(!f.integer||Number.isInteger(n));}
 if(f.type==='select')return f.options.some(([v])=>v===value);
 return !/^(미정|모름|unknown|tbd|나중)$/i.test(String(value).trim());
}
const VOLUME_ONLY=new Set(['beadWidth','beadDepth','beadShape','sealantLines','sealantBasis','lapBeads','fillPercent','cartridgeMl']);
export const activeFields=v=>FIELDS.filter(f=>(!f.when||f.when(v))&&(!(f.group===3)||v.flashingActive!==false)&&(f.group!==4||v.flashingActive!==false||v.sealantMethod==='length')&&!(v.sealantMethod==='length'&&VOLUME_ONLY.has(f.id))&&!(v.commonQuantity&&['boltSpec','screwSpec','sealantSpec','screwInset','lapScrews'].includes(f.id)));
export function listNumbers(value){if(String(value).trim()==='없음')return [];const parts=String(value??'').split(/[,;\s]+/).filter(Boolean);if(!parts.length)return null;const a=parts.map(Number);return a.every(n=>Number.isFinite(n)&&n>=0)&&new Set(a).size===a.length?a.sort((a,b)=>a-b):null;}
export function initialTakeoff(){return {roles:{},inputs:{},profiles:{},scopeConfirmed:false};}
export function suggestedRole(layer){if(/wall[_ -]?outline|외벽.*외곽/i.test(layer))return 'wall';if(/window[_ -]?opening|창문.*개구/i.test(layer))return 'window';if(/door[_ -]?opening|출입.*개구/i.test(layer))return 'door';return '';}
