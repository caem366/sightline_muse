import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Browser } from 'playwright';
import { capture, checkInteractions, openBrowser, startApp, stopApp } from './capture.js';
import { propose } from './model.js';
import { applyProposal, validateProposal } from './patch.js';
import { projects, repo } from './projects.js';
import type { Candidate, Capture, Project, Run, View } from './types.js';
import { command, save } from './util.js';
import { boxDelta, checkCandidate, difference } from './verify.js';

export const runs = new Map<string,Run>();
export const runDir = resolve(repo,'runs');
export function getRun(id:string) { const run=runs.get(id); if(!run) throw new Error('Run not found'); return run; }
export async function loadRuns() {
  for(const id of await readdir(runDir).catch(()=>[])) {
    try {const run=JSON.parse(await readFile(join(runDir,id,'run.json'),'utf8')) as Run;
      if(run.state==='running'){run.state='failed';run.error='Server restarted during run';run.endedAt=new Date().toISOString();await save(join(runDir,id,'run.json'),JSON.stringify(run,null,2));}
      runs.set(id,run);
    } catch {}
  }
}
async function record(run:Run,message:string) { run.events.push({at:new Date().toISOString(),message}); await save(join(runDir,run.id,'run.json'),JSON.stringify(run,null,2)); }
function projectFor(id:string) {const project=projects.find(x=>x.id===id); if(!project) throw new Error('Unknown project');return project;}
async function repositoryFor(project:Project) {
  const repository=resolve(await command(['git','rev-parse','--show-toplevel'],project.root));
  const appPath=relative(repository,project.root);
  if(appPath.startsWith('..')||resolve(repository,appPath)!==resolve(project.root)) throw new Error('App root is outside its Git repository');
  return repository;
}
async function captureMatrix(browser:Browser,port:number,views:View[],dir:string) {
  const results=new Map<string,Capture>();
  for(const view of views) results.set(view.id,await capture(browser,port,view,dir));
  return results;
}
async function checkScript(args:string[],root:string):Promise<boolean> {try {await command(args,root);return true;}catch{return false;}}
async function checkFunctional(project:Project,browser:Browser,root:string,port:number) {
  return project.id==='northstar' ? checkInteractions(browser,port) : checkScript(project.functional!.map(x=>x.replace('{port}',String(port))),root);
}

export async function launch(projectId:string):Promise<Run> {
  const project=projectFor(projectId);
  const repository=await repositoryFor(project);
  const status=await command(['git','status','--porcelain','--untracked-files=no'],repository);
  if(status) throw new Error('Repository must be clean before a run');
  for(const css of project.allowedCss) await command(['git','ls-files','--error-unmatch',relative(repository,join(project.root,css))],repository);
  const baseCommit=await command(['git','rev-parse','HEAD'],repository);
  const run:Run={id:randomUUID(),projectId,repository,origin:process.env.SIGHTLINE_TEST_RUN?'test':'live',state:'running',startedAt:new Date().toISOString(),baseCommit,events:[],candidates:[],model:{provider:'',id:'',calls:0,inputTokens:0,outputTokens:0,costUsd:0,latencyMs:[]}};
  runs.set(run.id,run);
  void execute(run,project).catch(async error=>{run.state='failed';run.error=error instanceof Error?error.message:String(error);run.endedAt=new Date().toISOString();await record(run,`Failed: ${run.error}`);});
  return run;
}

async function execute(run:Run,project:Project) {
  const dir=join(runDir,run.id), views=[project.target,...project.protected];
  let browser:Browser|undefined,app:ChildProcess|undefined;
  await record(run,'Capturing baseline');
  try {
    browser=await openBrowser(); app=await startApp(project,project.root,5179);
    const before=await captureMatrix(browser,5179,views,join(dir,'baseline'));
    const repeat=await captureMatrix(browser,5179,views,join(dir,'baseline-repeat'));
    for(const view of views) {
      const a=before.get(view.id)!,b=repeat.get(view.id)!;
      const drift=await difference(a.image,b.image);
      if(drift>.001 || boxDelta(a.landmark,b.landmark)>1) throw new Error(`Unstable baseline ${view.id}: ${(drift*100).toFixed(2)}% changed`);
      if(a.errors.length) throw new Error(`Baseline errors on ${view.id}: ${a.errors.join('; ')}`);
    }
    if(!await checkFunctional(project,browser,project.root,5179)) throw new Error('Baseline functional interactions failed');
    if(!project.target.reference) throw new Error('Target reference missing');
    const reference=project.target.reference;
    await readFile(reference);
    const baseTarget=before.get(project.target.id)!;
    const baseTargetDiff=await difference(reference,baseTarget.image,baseTarget.landmark);
    await record(run,`Baseline stable; target difference ${(baseTargetDiff*100).toFixed(2)}%`);
    stopApp(app); app=undefined;
    let feedback='';
    for(let attempt=0;attempt<2;attempt++) {
      const css=(await Promise.all(project.allowedCss.map(async file=>`${file}\n${await readFile(join(project.root,file),'utf8')}`))).join('\n\n');
      const proposal=await propose(run,reference,baseTarget,css,project.allowedCss,feedback||undefined);
      await record(run,`Muse proposed ${proposal.selector} ${proposal.property}: ${proposal.expectedValue} → ${proposal.newValue}`);
      const worktree=join(dir,`candidate-${attempt+1}`);
      let candidateApp:ChildProcess|undefined,diff='';
      let worktreeAdded=false;
      try {
        await validateProposal(project.root,project.allowedCss,proposal);
        await command(['git','worktree','add','--detach',worktree,run.baseCommit],run.repository);
        worktreeAdded=true;
        const appRoot=join(worktree,relative(run.repository,project.root));
        if(project.install) await command(project.install,appRoot,180000);
        await applyProposal(appRoot,project.allowedCss,proposal);
        const changed=(await command(['git','diff','--name-only'],worktree)).split(/\r?\n/).filter(Boolean);
        const allowed=project.allowedCss.map(x=>relative(run.repository,join(project.root,x)).replaceAll('\\','/'));
        if(changed.length!==1 || !allowed.includes(changed[0].replaceAll('\\','/'))) throw new Error('Changed files exceed allowlist');
        diff=await command(['git','diff','--',...changed],worktree);
        if(diff.length>10000) throw new Error('Patch exceeds diff size limit');
        const build=await checkScript(project.build,appRoot),typecheck=await checkScript(project.typecheck,appRoot);
        if(!build||!typecheck) await record(run,'Candidate failed build or typecheck');
        candidateApp=await startApp(project,appRoot,5180+attempt);
        const after=await captureMatrix(browser,5180+attempt,views,join(dir,`candidate-${attempt+1}-images`));
        const targetAfter=after.get(project.target.id)!;
        const targetDiff=await difference(reference,targetAfter.image,baseTarget.landmark);
        const protectedChecks=[];
        for(const view of project.protected) {
          const original=before.get(view.id)!,current=after.get(view.id)!;
          protectedChecks.push({id:view.id,changedRatio:await difference(original.image,current.image),landmarkDelta:boxDelta(original.landmark,current.landmark),overflow:current.overflow&&!original.overflow,errors:current.errors.slice(original.errors.length)});
        }
        const functional=await checkFunctional(project,browser,appRoot,5180+attempt);
        const reasons=checkCandidate(baseTarget,targetAfter,baseTargetDiff,targetDiff,protectedChecks,build,typecheck,functional);
        const candidate:Candidate={proposal,diff,targetBefore:baseTargetDiff,targetAfter:targetDiff,protected:protectedChecks,checks:{build,typecheck,functional},verdict:reasons.length?'rejected':'accepted',reasons,artifacts:{reference:relative(dir,reference),before:relative(dir,baseTarget.image),after:relative(dir,targetAfter.image)}};
        run.candidates.push(candidate); await save(join(dir,`candidate-${attempt+1}.diff`),diff); await record(run,`Candidate ${attempt+1} ${candidate.verdict}: ${reasons.join(', ')||'all gates passed'}`);
        if(!reasons.length) {run.state='review';run.endedAt=new Date().toISOString();await record(run,'Ready for human review');return;}
        feedback=`${reasons.join('; ')}. Protected matrix: ${JSON.stringify(protectedChecks)}. Prior proposal: ${JSON.stringify(proposal)}`;
      } catch(error) {
        const reason=error instanceof Error?error.message:String(error);
        run.candidates.push({proposal,diff,targetBefore:baseTargetDiff,targetAfter:baseTargetDiff,protected:[],checks:{},verdict:'rejected',reasons:[reason],artifacts:{}});
        await record(run,`Candidate ${attempt+1} rejected: ${reason}`);
        feedback=`The previous proposal failed validation or execution: ${reason}. Use the exact current declaration value shown in the CSS source.`;
      } finally {
        if(candidateApp) stopApp(candidateApp);
        if(worktreeAdded) await command(['git','worktree','remove','--force',worktree],run.repository).catch(()=>{});
      }
    }
    run.state='failed';run.endedAt=new Date().toISOString();await record(run,'No candidate passed verification');
  } finally {if(app) stopApp(app);if(browser) await browser.close();}
}

export async function accept(id:string) {
  const run=getRun(id);
  if(run.state!=='review') throw new Error('Run has no accepted candidate');
  const repository=run.repository||await repositoryFor(projectFor(run.projectId));
  if(await command(['git','status','--porcelain','--untracked-files=no'],repository)) throw new Error('Repository is no longer clean');
  const project=projectFor(run.projectId),proposal=run.candidates.at(-1)?.proposal;
  if(!proposal||!project.allowedCss.includes(proposal.file)) throw new Error('Accepted CSS file is not allowed');
  const file=relative(repository,join(project.root,proposal.file)).replaceAll('\\','/');
  await assertSourceUnchanged(repository,run.baseCommit,file);
  const patch=join(runDir,id,`candidate-${run.candidates.length}.diff`);
  await command(['git','apply','--check',patch],repository);
  await command(['git','apply',patch],repository);
  run.state='applied'; await record(run,'Patch applied to source checkout');return run;
}
export async function assertSourceUnchanged(repository:string,baseCommit:string,file:string) {
  await command(['git','merge-base','--is-ancestor',baseCommit,'HEAD'],repository).catch(()=>{throw new Error('Repository history changed since run');});
  if(await command(['git','rev-parse',`${baseCommit}:${file}`],repository)!==await command(['git','rev-parse',`HEAD:${file}`],repository)) throw new Error('Reviewed CSS file changed since run');
}
