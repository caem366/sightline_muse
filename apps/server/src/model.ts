import { readFile } from 'node:fs/promises';
import type { Capture, Proposal, Run } from './types.js';

const schema = {type:'json_schema',json_schema:{name:'css_repair',strict:true,schema:{type:'object',additionalProperties:false,properties:{file:{type:'string'},selector:{type:'string'},property:{type:'string'},expectedValue:{type:'string'},newValue:{type:'string'},reason:{type:'string'},evidenceId:{type:'string'}},required:['file','selector','property','expectedValue','newValue','reason','evidenceId']}}};
export async function propose(run:Run, reference:string, actual:Capture, css:string, allowedCss:string[], feedback?:string):Promise<Proposal> {
  const provider=process.env.MODEL_API_KEY ? 'meta' : process.env.BASETEN_API_KEY ? 'baseten' : '';
  if (!provider) throw new Error('Set MODEL_API_KEY or BASETEN_API_KEY for a real Muse proposal');
  const model=provider==='meta' ? 'muse-spark-1.3' : process.env.BASETEN_MODEL_ID || 'meta-models/muse-spark-open-1026';
  const base=provider==='meta' ? 'https://api.meta.ai/v1' : 'https://inference.baseten.co/v1';
  const key=provider==='meta' ? process.env.MODEL_API_KEY : process.env.BASETEN_API_KEY;
  if (run.model.calls>=4 || run.model.costUsd>=2) throw new Error('Model call or cost budget exhausted');
  const images=await Promise.all([reference,actual.image].map(async path=>`data:image/png;base64,${(await readFile(path)).toString('base64')}`));
  const instructions = feedback
    ? `The prior CSS candidate was rejected: ${feedback}. Propose one narrower, route-scoped CSS declaration edit that fixes the target without changing protected routes.`
    : 'Compare the reference and actual Dashboard screenshots. Find the most important layout discrepancy. If a shared design token is plausibly the cause, propose that token correction first so its application-wide effect can be measured. Otherwise propose one scoped CSS declaration edit.';
  const payload={model,messages:[{role:'system',content:'You are SIGHTLINE, a visual engineering agent. Return exactly one grounded CSS declaration change using the supplied CSS and DOM evidence. Never invent a selector, value, or file. Do not edit JSX or add CSS rules. Keep the change minimal.'},{role:'user',content:[{type:'text',text:`${instructions}\nAllowed CSS: ${allowedCss.join(', ')}\nDOM evidence: ${JSON.stringify(actual.elements)}\nCSS source:\n${css}`},{type:'image_url',image_url:{url:images[0]}},{type:'image_url',image_url:{url:images[1]}}]}],response_format:schema,max_tokens:1800,reasoning_effort:'medium'};
  const start=Date.now();
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),90000);
  let response:Response;
  try {response=await fetch(`${base}/chat/completions`,{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});} finally {clearTimeout(timer);}
  const body=await response.json() as any;
  run.model.provider=provider; run.model.id=model; run.model.calls++; run.model.latencyMs.push(Date.now()-start);
  if (!response.ok) throw new Error(`Muse API ${response.status}: ${String(body.error?.message||'unknown error').slice(0,300)}`);
  run.model.inputTokens+=body.usage?.prompt_tokens||0; run.model.outputTokens+=body.usage?.completion_tokens||0;
  const rates=provider==='meta' ? [1.25,4.25] : [1.25,4.25];
  run.model.costUsd=(run.model.inputTokens*rates[0]+run.model.outputTokens*rates[1])/1e6;
  const content=body.choices?.[0]?.message?.content;
  if (!content) throw new Error('Muse returned no proposal');
  const proposal=JSON.parse(content) as Proposal;
  for (const field of ['file','selector','property','expectedValue','newValue','reason','evidenceId'] as const) if(typeof proposal[field]!=='string'||!proposal[field]) throw new Error(`Invalid proposal field ${field}`);
  if (!actual.elements.some(x=>x.id===proposal.evidenceId)) throw new Error('Proposal cites unknown DOM evidence');
  return proposal;
}
