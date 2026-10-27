import { chromium } from 'playwright';
import { join } from 'node:path';
import { projects, repo } from './projects.js';
import { save } from './util.js';
import { startApp, stopApp } from './capture.js';

const project=projects[0],app=await startApp(project,project.root,5179),browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1,colorScheme:'light'});
  await page.goto('http://127.0.0.1:5179/',{waitUntil:'networkidle'});
  await page.addStyleTag({content:'.dashboard-grid { gap: 24px; }'});
  await save(join(repo,'fixtures/demo-app/reference/dashboard.png'),await page.screenshot({animations:'disabled',scale:'css'}));
  console.log('Saved original dashboard reference');
} finally {await browser.close();stopApp(app);}
