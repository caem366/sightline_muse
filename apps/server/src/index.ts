import express from 'express';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { accept, getRun, launch, runDir } from './run.js';
import { projects } from './projects.js';

const app=express(); app.use(express.json({limit:'12mb'}));
app.get('/api/projects',(_req,res)=>res.json(projects.map(({id,target,protected:checks})=>({id,target,protected:checks}))));
app.post('/api/runs',async(req,res)=>{try {res.status(202).json(await launch(req.body.projectId));}catch(error){res.status(400).json({error:String(error)});}});
app.get('/api/runs/:id',(req,res)=>{try{res.json(getRun(req.params.id));}catch(error){res.status(404).json({error:String(error)});}});
app.get('/api/runs/:id/events',(req,res)=>{
  let run;try{run=getRun(req.params.id);}catch{res.status(404).end();return;}
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');
  let seen=0;const send=()=>{for(const event of run.events.slice(seen)) res.write(`data: ${JSON.stringify(event)}\n\n`);seen=run.events.length;if(run.state!=='running'){clearInterval(timer);res.end();}};
  const timer=setInterval(send,500);send();req.on('close',()=>clearInterval(timer));
});
app.get('/api/runs/:id/artifact',async(req,res)=>{
  try {
    getRun(req.params.id);
    const name=String(req.query.path||'');
    if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.includes('..')||!['.png','.diff','.json'].includes(extname(name))) throw new Error('Invalid artifact');
    const file=resolve(join(runDir,req.params.id),name);
    if(!file.startsWith(resolve(join(runDir,req.params.id))+sep)||!existsSync(file)) throw new Error('Artifact not found');
    res.type(extname(name)==='.png'?'png':'text').send(await readFile(file));
  } catch(error) {res.status(404).json({error:String(error)});}
});
app.get('/api/projects/:id/reference',async(req,res)=>{
  try {const project=projects.find(x=>x.id===req.params.id);if(!project?.target.reference) throw new Error('Reference missing');res.type('png').send(await readFile(project.target.reference));}
  catch(error){res.status(404).json({error:String(error)});}
});
app.post('/api/runs/:id/accept',async(req,res)=>{try{res.json(await accept(req.params.id));}catch(error){res.status(400).json({error:String(error)});}});
app.listen(4177,'127.0.0.1',()=>console.log('SIGHTLINE API on http://127.0.0.1:4177'));
