import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import postcss from 'postcss';
import type { Proposal } from './types.js';
import { assertLocalPath } from './util.js';

export async function applyProposal(root:string, allowedCss:string[], proposal:Proposal) {
  assertLocalPath(proposal.file);
  if (!proposal.file.endsWith('.css') || !allowedCss.includes(proposal.file)) throw new Error('CSS path is not allowed');
  const absolute=resolve(root,proposal.file);
  if(!absolute.startsWith(resolve(root)+sep)) throw new Error('CSS path escapes project');
  const source=await readFile(absolute,'utf8');
  if(source.length>100000) throw new Error('CSS file too large');
  const css=postcss.parse(source,{from:absolute});
  const matches:postcss.Declaration[]=[];
  css.walkRules(rule=>{if(rule.selector===proposal.selector) rule.walkDecls(proposal.property,decl=>{matches.push(decl);});});
  if(matches.length!==1) throw new Error(`Expected exactly one ${proposal.selector} ${proposal.property} declaration, found ${matches.length}`);
  if(matches[0].value!==proposal.expectedValue || proposal.newValue===proposal.expectedValue) throw new Error('Expected value mismatch or no-op');
  if(proposal.newValue.length>80 || /[{};]/.test(proposal.newValue)) throw new Error('Invalid CSS value');
  matches[0].value=proposal.newValue;
  const updated=css.toString();
  postcss.parse(updated);
  await writeFile(absolute,updated);
}
