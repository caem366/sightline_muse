import assert from 'node:assert/strict';
import { join, relative } from 'node:path';
import { capture, openBrowser, startApp, stopApp } from './capture.js';
import { applyProposal } from './patch.js';
import { projects, repo } from './projects.js';
import { command } from './util.js';
import { difference } from './verify.js';
import type { Proposal } from './types.js';

const project=projects[0], dir=join(repo,'runs','smoke'), browser=await openBrowser();
const target=project.target,protectedView=project.protected[0];
const proposals:Proposal[]=[
  {file:'src/style.css',selector:':root',property:'--surface-gap',expectedValue:'12px',newValue:'24px',reason:'Test shared token',evidenceId:'dashboard-grid'},
  {file:'src/style.css',selector:'.dashboard-grid',property:'gap',expectedValue:'var(--surface-gap)',newValue:'24px',reason:'Test scoped rule',evidenceId:'dashboard-grid'}
];
let baselineApp;
try {
  baselineApp=await startApp(project,project.root,5190);
  const beforeTarget=await capture(browser,5190,target,join(dir,'baseline'));
  const beforeProtected=await capture(browser,5190,protectedView,join(dir,'baseline'));
  stopApp(baselineApp);baselineApp=undefined;
  const beforeDiff=await difference(target.reference!,beforeTarget.image,beforeTarget.landmark);
  const results=[];
  for(let i=0;i<proposals.length;i++) {
    const worktree=join(dir,`candidate-${i}`);
    await command(['git','worktree','add','--detach',worktree,'HEAD'],repo);
    let app;
    try {
      await applyProposal(join(worktree,relative(repo,project.root)),project.allowedCss,proposals[i]);
      app=await startApp(project,join(worktree,relative(repo,project.root)),5191+i);
      const afterTarget=await capture(browser,5191+i,target,join(dir,`candidate-${i}-images`));
      const afterProtected=await capture(browser,5191+i,protectedView,join(dir,`candidate-${i}-images`));
      results.push({target:await difference(target.reference!,afterTarget.image,beforeTarget.landmark),protected:await difference(beforeProtected.image,afterProtected.image)});
    } finally {if(app)stopApp(app);await command(['git','worktree','remove','--force',worktree],repo);}
  }
  assert(results[0].target<beforeDiff*.85,'shared token should improve target');
  assert(results[0].protected>.01,'shared token should regress protected view');
  assert(results[1].target<beforeDiff*.85,'scoped edit should improve target');
  assert(results[1].protected<.01,'scoped edit should preserve protected view');
  console.log(JSON.stringify({baseline:beforeDiff,shared:results[0],scoped:results[1]},null,2));
} finally {if(baselineApp)stopApp(baselineApp);await browser.close();}
