import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { Project } from './types.js';
import { assertLocalPath } from './util.js';

export const repo = resolve(import.meta.dirname, '../../..');
const demo: Project = {
  id: 'northstar',
  root: resolve(repo, 'fixtures/demo-app'),
  dev: ['npm','run','dev','--','--port','5179','--strictPort'],
  build: ['npm','run','build'],
  typecheck: ['npm','run','typecheck'],
  allowedCss: ['src/style.css'],
  target: {id:'dashboard-desktop',path:'/',width:1440,height:900,landmark:'dashboard-grid',reference:resolve(repo,'fixtures/demo-app/reference/dashboard.png')},
  protected: [
    {id:'settings-desktop',path:'/settings',width:1440,height:900,landmark:'settings-form'},
    {id:'reports-desktop',path:'/reports',width:1440,height:900,landmark:'report-bars'},
    {id:'dashboard-mobile',path:'/',width:390,height:844,landmark:'dashboard-grid'}
  ]
};
export const projects: Project[] = [demo];
if(process.env.SIGHTLINE_PROJECTS_FILE) {
  const configs=JSON.parse(readFileSync(process.env.SIGHTLINE_PROJECTS_FILE,'utf8')) as Project[];
  if(!Array.isArray(configs)) throw new Error('Project config must be an array');
  for(const config of configs) {
    if(!config.id||projects.some(p=>p.id===config.id)||!isAbsolute(config.root)) throw new Error('Project ID and absolute root are required');
    if(!config.target?.reference||!isAbsolute(config.target.reference)||!config.allowedCss?.length||!config.dev?.length||!config.install?.length||!config.build?.length||!config.typecheck?.length||!config.functional?.length) throw new Error(`Incomplete project ${config.id}`);
    if(!config.target.path.startsWith('/')||config.protected?.some(v=>!v.path.startsWith('/'))) throw new Error('Routes must be local paths');
    for(const file of config.allowedCss) {assertLocalPath(file);if(!file.endsWith('.css')) throw new Error('Only CSS paths are allowed');}
    projects.push(config);
  }
}
