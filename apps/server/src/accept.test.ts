import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSourceUnchanged } from './run.js';
import { command } from './util.js';

test('review survives unrelated commits but rejects a changed CSS file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'sightline-review-'));
  await command(['git','init'],root);
  await command(['git','config','user.email','test@example.invalid'],root);
  await command(['git','config','user.name','Sightline Test'],root);
  await writeFile(join(root,'style.css'),'.card { gap: 12px; }\n');
  await command(['git','add','style.css'],root);
  await command(['git','commit','-m','base'],root);
  const base=await command(['git','rev-parse','HEAD'],root);
  await writeFile(join(root,'README.md'),'unrelated\n');
  await command(['git','add','README.md'],root);
  await command(['git','commit','-m','docs'],root);
  await assertSourceUnchanged(root,base,'style.css');
  await writeFile(join(root,'style.css'),'.card { gap: 24px; }\n');
  await command(['git','add','style.css'],root);
  await command(['git','commit','-m','css'],root);
  await assert.rejects(assertSourceUnchanged(root,base,'style.css'),/Reviewed CSS file changed/);
});
