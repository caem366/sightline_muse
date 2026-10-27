import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { applyProposal } from './patch.js';

test('CSS edits require an exact, allowed declaration',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sightline-patch-'));
  await mkdir(join(root,'src'));const file=join(root,'src','style.css');
  await writeFile(file,':root { --gap: 12px; }\n.card { gap: var(--gap); }\n');
  const proposal={file:'src/style.css',selector:':root',property:'--gap',expectedValue:'12px',newValue:'24px',reason:'test',evidenceId:'card'};
  await applyProposal(root,['src/style.css'],proposal);
  assert.match(await readFile(file,'utf8'),/--gap: 24px/);
  await assert.rejects(applyProposal(root,['src/style.css'],proposal),/Expected value mismatch/);
  await assert.rejects(applyProposal(root,['src/style.css'],{...proposal,file:'../escape.css'}),/Invalid relative path/);
});
