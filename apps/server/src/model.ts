import { readFile } from 'node:fs/promises';
import type { Capture, Proposal, Run } from './types.js';

const schema = {type:'json_schema',json_schema:{name:'css_repair',strict:true,schema:{type:'object',additionalProperties:false,properties:{file:{type:'string'},selector:{type:'string'},property:{type:'string'},expectedValue:{type:'string'},newValue:{type:'string'},reason:{type:'string'},evidenceId:{type:'string'}},required:['file','selector','property','expectedValue','newValue','reason','evidenceId']}}};
export async function propose(run:Run, reference:string, actual:Capture, css:string, allowedCss:string[], feedback?:string):Promise<Proposal> {
  const provider=process.env.SIGHTLINE_PROVIDER==='baseten' ? (process.env.BASETEN_API_KEY?'baseten':'') : process.env.MODEL_API_KEY ? 'meta' : process.env.BASETEN_API_KEY ? 'baseten' : '';
  if (!provider) throw new Error('Set MODEL_API_KEY or BASETEN_API_KEY for a real Muse proposal');
  const model=provider==='meta' ? 'muse-spark-1.3' : process.env.BASETEN_MODEL_ID || 'meta-models/muse-spark-open-1026';
  const base=provider==='meta' ? 'https://api.meta.ai/v1' : 'https://inference.baseten.co/v1';
  const key=provider==='meta' ? process.env.MODEL_API_KEY : process.env.BASETEN_API_KEY;
  if (run.model.calls>=4 || run.model.costUsd>=2) throw new Error('Model call or cost budget exhausted');
  const images=await Promise.all([reference,actual.image].map(async path=>`data:image/png;base64,${(await readFile(path)).toString('base64')}`));
  const instructions = feedback
    ? `The prior CSS candidate was rejected: ${feedback}. Correct the exact source-value mismatch if validation failed. If protected views regressed, propose a route-scoped declaration. Return one valid edit.`
    : 'Compare the reference and actual screenshots. Find the most important layout discrepancy and propose one grounded CSS declaration edit.';
  const payload={model,messages:[{role:'system',content:'You are SIGHTLINE, a visual engineering agent. Return exactly one grounded CSS declaration change using the supplied CSS and DOM evidence. The file, selector, property, and expectedValue must exactly match one declaration in the supplied CSS source. expectedValue is the current source value, never the desired value or a computed value. newValue must differ. Never invent a selector or file. Do not edit JSX or add CSS rules.'},{role:'user',content:[{type:'text',text:`${instructions}\nAllowed CSS: ${allowedCss.join(', ')}\nDOM evidence: ${JSON.stringify(actual.elements)}\nCSS source:\n${css}\nFirst image: design reference.`},{type:'image_url',image_url:{url:images[0]}},{type:'text',text:'Second image: current app render.'},{type:'image_url',image_url:{url:images[1]}}]}],response_format:schema,max_tokens:3000,reasoning_effort:'low'};
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
  if (!content) throw new Error(`Muse returned no proposal (finish_reason: ${body.choices?.[0]?.finish_reason||'unknown'})`);
  const proposal=JSON.parse(content) as Proposal;
  for (const field of ['file','selector','property','expectedValue','newValue','reason','evidenceId'] as const) if(typeof proposal[field]!=='string'||!proposal[field]) throw new Error(`Invalid proposal field ${field}`);
  if (!actual.elements.some(x=>x.id===proposal.evidenceId)) throw new Error('Proposal cites unknown DOM evidence');
  return proposal;
}
