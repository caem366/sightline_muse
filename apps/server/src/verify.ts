import { readFile } from 'node:fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Box, Capture } from './types.js';

export async function difference(aPath:string,bPath:string,box?:Box):Promise<number> {
  const [a,b]=await Promise.all([aPath,bPath].map(async p=>PNG.sync.read(await readFile(p))));
  if(a.width!==b.width||a.height!==b.height) throw new Error('Screenshot dimensions differ');
  const x0=box?Math.max(0,Math.floor(box.x)):0,y0=box?Math.max(0,Math.floor(box.y)):0;
  const x1=box?Math.min(a.width,Math.ceil(box.x+box.width)):a.width,y1=box?Math.min(a.height,Math.ceil(box.y+box.height)):a.height;
  if(x1<=x0||y1<=y0) throw new Error('Empty comparison region');
  const width=x1-x0,height=y1-y0;
  const crop=(image:PNG)=>{const out=new PNG({width,height});for(let y=0;y<height;y++) image.data.copy(out.data,y*width*4,((y+y0)*image.width+x0)*4,((y+y0)*image.width+x1)*4);return out;};
  return pixelmatch(crop(a).data,crop(b).data,undefined,width,height,{threshold:.12})/(width*height);
}
export function boxDelta(a?:Box,b?:Box) { if(!a||!b) return Infinity;return Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y),Math.abs(a.width-b.width),Math.abs(a.height-b.height)); }
export function checkCandidate(before:Capture,after:Capture,reference:string,baseTargetDiff:number,targetDiff:number,protectedChecks:{changedRatio:number;landmarkDelta:number;overflow:boolean;errors:string[]}[],build:boolean,typecheck:boolean) {
  const reasons:string[]=[];
  if(!Number.isFinite(baseTargetDiff)||baseTargetDiff<=0) reasons.push('Target baseline has no measurable defect');
  else if(targetDiff>baseTargetDiff*.85) reasons.push('Target did not improve by 15%');
  if(after.errors.length>before.errors.length) reasons.push('New runtime errors');
  if(after.overflow&&!before.overflow) reasons.push('New target overflow');
  if(!build) reasons.push('Build failed'); if(!typecheck) reasons.push('Typecheck failed');
  for(const check of protectedChecks) if(check.changedRatio>.01||check.landmarkDelta>4||check.overflow||check.errors.length) reasons.push('Protected view regressed');
  return [...new Set(reasons)];
}
