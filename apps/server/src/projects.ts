import { resolve } from 'node:path';
import type { Project } from './types.js';

export const repo = resolve(import.meta.dirname, '../../..');
export const projects: Project[] = [{
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
}];
