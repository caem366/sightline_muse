import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getRun, launch } from './run.js';
import { projects } from './projects.js';

test('rejects a shared regression and accepts a scoped repair without editing source', {timeout:180000}, async()=>{
  const originalFetch=global.fetch,originalKey=process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY='test-only';
  const cssPath=join(projects[0].root,'src/style.css'),source=await readFile(cssPath,'utf8');
  const proposals=[
    {file:'src/style.css',selector:':root',property:'--surface-gap',expectedValue:'12px',newValue:'24px',reason:'Shared spacing appears too tight',evidenceId:'dashboard-grid'},
    {file:'src/style.css',selector:'.dashboard-grid',property:'gap',expectedValue:'var(--surface-gap)',newValue:'24px',reason:'Scope spacing to Dashboard',evidenceId:'dashboard-grid'}
  ];
  let calls=0;
  global.fetch=(input,init)=>String(input).startsWith('https://api.meta.ai/')
    ? Promise.resolve(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(proposals[calls++])}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200,headers:{'Content-Type':'application/json'}}))
    : originalFetch(input,init);
  try {
    const run=await launch('northstar');
    for(let i=0;i<180&&getRun(run.id).state==='running';i++) await new Promise(resolve=>setTimeout(resolve,1000));
    const result=getRun(run.id);
    assert.equal(result.state,'review',result.error||result.events.at(-1)?.message);
    assert.equal(calls,2);
    assert.equal(result.candidates[0].verdict,'rejected');
    assert(result.candidates[0].protected.some(x=>x.landmarkDelta>4));
    assert.equal(result.candidates[1].verdict,'accepted');
    assert.equal(result.candidates[1].checks.functional,true);
    assert.equal(await readFile(cssPath,'utf8'),source);
  } finally {global.fetch=originalFetch;if(originalKey===undefined) delete process.env.MODEL_API_KEY;else process.env.MODEL_API_KEY=originalKey;}
});
