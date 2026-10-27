import { spawn, type ChildProcess } from 'node:child_process';
import { chromium, type Browser } from 'playwright';
import { join } from 'node:path';
import { save } from './util.js';
import { repo } from './projects.js';
import type { Capture, Project, View } from './types.js';

export async function startApp(project: Project, root: string, port: number): Promise<ChildProcess> {
  const args = project.dev.map(x => x === '5179' ? String(port) : x.replace('{port}',String(port)));
  const isVite = project.id==='northstar';
  const child = isVite
    ? spawn(process.execPath,[join(repo,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,windowsHide:true,stdio:'ignore'})
    : spawn(args[0],args.slice(1),{cwd:root,shell:process.platform==='win32',windowsHide:true,stdio:'ignore'});
  const url = `http://127.0.0.1:${port}`;
  for (let i=0;i<60;i++) {
    if (child.exitCode !== null) throw new Error('App process exited before readiness');
    try { const response = await fetch(url); if (response.ok) return child; } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  child.kill(); throw new Error('App readiness timeout');
}
export function stopApp(child: ChildProcess) { child.kill(); }
export async function capture(browser: Browser, port:number, view:View, artifactDir:string): Promise<Capture> {
  const context = await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1,colorScheme:'light',locale:'en-US', reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors:string[] = [];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('response', r=>{if(r.status()>=400 && new URL(r.url()).origin===`http://127.0.0.1:${port}`) errors.push(`${r.status()} ${r.url()}`);});
  try {
    const response = await page.goto(`http://127.0.0.1:${port}${view.path}`,{waitUntil:'networkidle',timeout:15000});
    if (!response || response.status()>=400) throw new Error(`Navigation failed: ${response?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    const landmark = await page.locator(`[data-sightline="${view.landmark}"]`).boundingBox() ?? undefined;
    if (!landmark) throw new Error(`Missing landmark ${view.landmark}`);
    const elements = await page.locator('[data-sightline]').evaluateAll(nodes=>nodes.map(node=>{
      const el=node as HTMLElement, style=getComputedStyle(el), box=el.getBoundingClientRect();
      return {id:el.dataset.sightline||'',tag:el.tagName.toLowerCase(),text:(el.innerText||'').slice(0,120),classes:el.className,box:{x:box.x,y:box.y,width:box.width,height:box.height},css:{display:style.display,gap:style.gap,padding:style.padding,fontSize:style.fontSize,lineHeight:style.lineHeight,color:style.color,backgroundColor:style.backgroundColor}};
    }));
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    const image=join(artifactDir,`${view.id}.png`);
    await save(image,await page.screenshot({animations:'disabled',caret:'hide',scale:'css'}));
    return {image,elements,errors,overflow,landmark};
  } finally { await context.close(); }
}
export async function openBrowser() { return chromium.launch({headless:true}); }
export async function checkInteractions(browser:Browser,port:number):Promise<boolean> {
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'View all'}).click();
    if(!await page.getByRole('button',{name:'Showing all'}).isVisible()) return false;
    await page.getByRole('link',{name:/Settings/}).click();
    await page.getByRole('button',{name:'Save changes'}).click();
    if(!await page.getByRole('button',{name:'Saved'}).isVisible()) return false;
    await page.getByRole('link',{name:/Reports/}).click();
    return await page.getByRole('heading',{name:'Monthly performance'}).isVisible();
  } catch {return false;} finally {await context.close();}
}
