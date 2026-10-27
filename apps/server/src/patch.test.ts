import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { applyProposal, validateProposal } from './patch.js';

test('CSS edits require an exact, allowed declaration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sightline-patch-'));
  await mkdir(join(root,'src'));const file=join(root,'src','style.css');
  await writeFile(file,':root { --gap: 12px; }\n.card { gap: var(--gap); }\n');
  const proposal={file:'src/style.css',selector:':root',property:'--gap',expectedValue:'12px',newValue:'24px',reason:'test',evidenceId:'card'};
  await assert.rejects(validateProposal(root,['src/style.css'],{...proposal,expectedValue:'24px'}),/current values: 12px/);
  assert.match(await readFile(file,'utf8'),/--gap: 12px/);
  await applyProposal(root,['src/style.css'],proposal);
  assert.match(await readFile(file,'utf8'),/--gap: 24px/);
  await assert.rejects(applyProposal(root,['src/style.css'],proposal),/Expected exactly one/);
  await assert.rejects(applyProposal(root,['src/style.css'],{...proposal,file:'../escape.css'}),/Invalid relative path/);
});
