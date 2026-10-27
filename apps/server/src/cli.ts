import { launch, getRun } from './run.js';
const run=await launch('northstar');
console.log(`Run ${run.id}`);
while(getRun(run.id).state==='running') await new Promise(resolve=>setTimeout(resolve,1000));
console.log(JSON.stringify(getRun(run.id),null,2));
