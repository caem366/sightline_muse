import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { Browser } from 'playwright';
import { capture, openBrowser, startApp, stopApp } from './capture.js';
import { propose } from './model.js';
import { applyProposal } from './patch.js';
import { projects, repo } from './projects.js';
import type { Candidate, Capture, Project, Run, View } from './types.js';
import { command, save } from './util.js';
import { boxDelta, checkCandidate, difference } from './verify.js';

export const runs = new Map<string,Run>();
export const runDir = resolve(repo,'runs');
export function getRun(id:string) { const run=runs.get(id); if(!run) throw new Error('Run not found'); return run; }
async function record(run:Run,message:string) { run.events.push({at:new Date().toISOString(),message}); await save(join(runDir,run.id,'run.json'),JSON.stringify(run,null,2)); }
function projectFor(id:string) {const project=projects.find(x=>x.id===id); if(!project) throw new Error('Unknown project');return project;}
async function captureMatrix(browser:Browser,port:number,views:View[],dir:string) {
  const results=new Map<string,Capture>();
  for(const view of views) results.set(view.id,await capture(browser,port,view,dir));
  return results;
}
async function checkScript(args:string[],root:string):Promise<boolean> {try {await command(args,root);return true;}catch{return false;}}

export async function launch(projectId:string):Promise<Run> {
  const project=projectFor(projectId);
  const status=await command(['git','status','--porcelain'],repo);
  if(status) throw new Error('Repository must be clean before a run');
  const baseCommit=await command(['git','rev-parse','HEAD'],repo);
  const run:Run={id:randomUUID(),projectId,state:'running',startedAt:new Date().toISOString(),baseCommit,events:[],candidates:[],model:{provider:'',id:'',calls:0,inputTokens:0,outputTokens:0,costUsd:0,latencyMs:[]}};
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
    if(!project.target.reference) throw new Error('Target reference missing');
    const reference=project.target.reference;
    await readFile(reference);
    const baseTarget=before.get(project.target.id)!;
    const baseTargetDiff=await difference(reference,baseTarget.image,baseTarget.landmark);
    await record(run,`Baseline stable; target difference ${(baseTargetDiff*100).toFixed(2)}%`);
    stopApp(app); app=undefined;
    let feedback='';
    for(let attempt=0;attempt<2;attempt++) {
      const css=await readFile(join(project.root,project.allowedCss[0]),'utf8');
      const proposal=await propose(run,reference,baseTarget,css,project.allowedCss,feedback||undefined);
      await record(run,`Muse proposed ${proposal.selector} ${proposal.property}: ${proposal.expectedValue} → ${proposal.newValue}`);
      const worktree=join(dir,`candidate-${attempt+1}`);
      await command(['git','worktree','add','--detach',worktree,run.baseCommit],repo);
      let candidateApp:ChildProcess|undefined;
      try {
        const appRoot=join(worktree,relative(repo,project.root));
        await applyProposal(appRoot,project.allowedCss,proposal);
        const changed=(await command(['git','diff','--name-only'],worktree)).split(/\r?\n/).filter(Boolean);
        const allowed=project.allowedCss.map(x=>relative(repo,join(project.root,x)).replaceAll('\\','/'));
        if(changed.length!==1 || !allowed.includes(changed[0].replaceAll('\\','/'))) throw new Error('Changed files exceed allowlist');
        const diff=await command(['git','diff','--',...changed],worktree);
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
        const reasons=checkCandidate(baseTarget,targetAfter,reference,baseTargetDiff,targetDiff,protectedChecks,build,typecheck);
        const candidate:Candidate={proposal,diff,targetBefore:baseTargetDiff,targetAfter:targetDiff,protected:protectedChecks,checks:{build,typecheck},verdict:reasons.length?'rejected':'accepted',reasons,artifacts:{reference:relative(dir,reference),before:relative(dir,baseTarget.image),after:relative(dir,targetAfter.image)}};
        run.candidates.push(candidate); await save(join(dir,`candidate-${attempt+1}.diff`),diff); await record(run,`Candidate ${attempt+1} ${candidate.verdict}: ${reasons.join(', ')||'all gates passed'}`);
        if(!reasons.length) {run.state='review';run.endedAt=new Date().toISOString();await record(run,'Ready for human review');return;}
        feedback=`${reasons.join('; ')}. Protected matrix: ${JSON.stringify(protectedChecks)}. Prior proposal: ${JSON.stringify(proposal)}`;
      } finally {
        if(candidateApp) stopApp(candidateApp);
        await command(['git','worktree','remove','--force',worktree],repo).catch(()=>{});
      }
    }
    run.state='failed';run.endedAt=new Date().toISOString();await record(run,'No candidate passed verification');
  } finally {if(app) stopApp(app);if(browser) await browser.close();}
}

export async function accept(id:string) {
  const run=getRun(id);
  if(run.state!=='review') throw new Error('Run has no accepted candidate');
  if(await command(['git','rev-parse','HEAD'],repo)!==run.baseCommit) throw new Error('Repository HEAD changed since run');
  if(await command(['git','status','--porcelain'],repo)) throw new Error('Repository is no longer clean');
  const patch=join(runDir,id,`candidate-${run.candidates.length}.diff`);
  await command(['git','apply','--check',patch],repo);
  await command(['git','apply',patch],repo);
  run.state='applied'; await record(run,'Patch applied to source checkout');return run;
}
