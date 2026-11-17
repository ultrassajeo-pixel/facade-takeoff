// User-agreed purchasing and installation rules, 2026-11-15.
// These are not manufacturer specifications or structural design criteria.
export const COMMON_RULES={id:'user-common/2026-11-15',panel:{minMm:3000,maxMm:13000,combineLongAndShort:true,addedCutAllowanceMm:0,remaining:'scrap'},bolt:{perSupportIntersection:1},flashing:{stockMm:3000,lapMinMm:30,lapMaxMm:50},screw:{spacingMm:300,rows:2},sealant:{yieldMmPerCartridge:2500,locations:['panel-joints','opening-contacts','both-flashing-sides']},variable:['product','thickness','color','effective-width','direction','support-spacing']};
export function applyCommonRules(state){
 if(state.scenario||state.commonRules?.id===COMMON_RULES.id)return [];
 const v=state.inputs,changes=[],set=(id,value,evidence)=>{if(v[id]===undefined||v[id]===null||v[id]===''){v[id]=value;changes.push({id,value,source:'합의한 공통 기준',evidence});}};
 for(const [id,value] of Object.entries({commonQuantity:true,panelOrderMode:'combined',minLength:3000,maxLength:13000,trim:0,lengthStep:1,procurement:'custom',openings:'split',reuse:'no',endBolts:1,middleBolts:1,screwSpacing:300,screwRows:2,sealantMethod:'length',sealantYield:2500}))set(id,value,'2026-11-15 대화에서 확정한 발주·체결·소요량 기준');
 // Quantity basis, not a claim that the user's supplier sells one-item packages.
 for(const [id,value] of Object.entries({panelLoss:0,boltLoss:0,screwLoss:0,sealantLoss:0,boltPack:1,screwPack:1}))set(id,value,'예비율·판매 포장 수량을 가정하지 않고 기본 필요량으로 산출');
 state.commonRules={...structuredClone(COMMON_RULES),quantityBasis:'예비분·판매 포장 미반영',lapPolicy:'30~50mm 범위의 상단 50mm로 발주 산정; 실제 겹침 확정값이 있으면 그 값을 우선'};
 for(const kind of ['wallTop','wallBottom','wallLeft','wallRight','windowHead','windowSill','windowJamb','doorHead','doorJamb','doorThreshold']){
  const p=state.profiles[kind]||={};for(const [key,value] of Object.entries({stock:3000,lap:50,loss:0}))if(p[key]===undefined||p[key]===''){p[key]=value;changes.push({id:`profile.${kind}.${key}`,value,source:'합의한 공통 기준',evidence:key==='lap'?state.commonRules.lapPolicy:'후레싱 3m 정척, 예비분 별도 가산 없음'});}
 }
 return changes;
}

export const CLIPPING_POLICY="XCLIP 표시 영역만 산출한다. 판넬·하지 기준점과 실제 외벽·창호 경계는 원본을 유지하고, 잘라낸 가상 경계에는 후레싱·코킹·끝단 보강을 추가하지 않는다. 표시된 판넬 조각의 외접 규격으로 발주하며 사선 절단 잔재를 포함한다.";

export const RECOVERY_POLICY="복원 영역 수는 판넬 장수가 아니다. 같은 출처·평면·역할의 인접 면이 빈틈 없는 직사각형이면 연속 외벽/개구부로 계산하고 내부 표시선에 외곽 후레싱·창호 측면을 중복 생성하지 않는다. 실제 이음은 시공 조건으로 확정하며 비정형 합집합·다른 Z·미연결선·가는 틈이 미해결이면 산출을 보류한다.";
