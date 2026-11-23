import {openAsBlob} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateProject,readProjectFile} from './src/project.mjs';
import {inspect,calculate} from './src/takeoff.mjs';

function run(project) {
  const gate=inspect(project.drawing,project.takeoff);
  if(!gate.canCalculate) return {stage:'validate',blockers:gate.blockers.map(issue=>issue.id),
    pending:gate.pending.map(q=>q.id)};
  const result=calculate(project.drawing,project.takeoff);
  return {stage:'calculate',engine:result.engine,netArea:result.netArea,
    panels:result.panelGroups.reduce((n,g)=>n+g.order,0)};
}

export function replay(data) {return run(validateProject(structuredClone(data)));}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(!process.argv[2]) throw Error('저장 프로젝트 파일 경로가 필요합니다.');
  const project=await readProjectFile(await openAsBlob(process.argv[2]));
  console.log(JSON.stringify(run(project),null,2));
}
