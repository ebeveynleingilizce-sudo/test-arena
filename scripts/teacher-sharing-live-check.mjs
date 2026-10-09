import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const url='https://test-arena-20261008.web.app';
const local=await readFile('dist/index.html','utf8'),response=await fetch(`${url}/?sharing-check=${Date.now()}`),html=await response.text();assert.equal(response.status,200);const asset=local.match(/src="([^"]+\.js)"/)[1];assert(html.includes(asset),'Canlı giriş paketi son derlemeyle uyuşmuyor.');
const denied=await fetch('https://firestore.googleapis.com/v1/projects/test-arena-20261008/databases/(default)/documents/teacherClassAccess/unauthenticated-probe/classes');assert.equal(denied.status,403);
const browser=await chromium.launch();await mkdir('test-results/teacher-sharing/live',{recursive:true});
try{for(const [width,height]of [[360,800],[1366,900]]){const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(`${url}/ogretmen-giris`,{waitUntil:'networkidle',timeout:60000});await page.getByLabel('E-posta',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:`test-results/teacher-sharing/live/teacher-login-${width}.png`,fullPage:true});await page.close();}}finally{await browser.close();}
console.log(JSON.stringify({hostingMatchesBuild:true,unauthenticatedAccessDenied:true,mobileDesktop:true,consoleErrors:0}));
