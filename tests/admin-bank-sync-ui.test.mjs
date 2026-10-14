import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
test('only tunc admin sees one automatic sync button; other teachers make no permission read; phone/desktop and double-click are safe',async()=>{
 const js=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{AdminQuestionBank}from'./src/features/AdminQuestionBank';const root=createRoot(document.getElementById('root'));window.renderSession=session=>{window.fixtureSession=session;root.render(<AdminQuestionBank/>)};window.fixtureCalls=[];window.fixtureAllowed=true;window.renderSession({role:'teacher',user:{uid:'other',email:'other@test.com'}});`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixture-data',setup(b){b.onResolve({filter:/app\/Session$/},()=>({path:'session',namespace:'fixture'}));b.onResolve({filter:/data\/firebase$/},()=>({path:'firebase',namespace:'fixture'}));b.onResolve({filter:/ui\/components$/},()=>({path:'components',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='session'?`export function useSession(){return window.fixtureSession}`:args.path==='firebase'?`export async function call(name){window.fixtureCalls.push(name);if(name==='teacherBankPermissions')return{canManage:window.fixtureAllowed};return await new Promise(resolve=>{window.completeSync=()=>resolve({imported:50,unchanged:100,failed:0,conflicts:0,files:[],completedAt:'2026-10-14T09:00:00Z'})})}`:`export const errorMessage=e=>e.message;`,loader:'js'}));}}]});
 const css=await readFile('src/ui/styles.css','utf8')+await readFile('src/ui/admin-question-bank.css','utf8');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><main style="padding:16px;max-width:900px"><div id="root"></div></main><script>${js.outputFiles[0].text}</script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-proxy-server']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);assert.equal(await page.getByRole('button').count(),0);assert.deepEqual(await page.evaluate(()=>window.fixtureCalls),[]);
  await page.evaluate(()=>{window.fixtureAllowed=false;window.renderSession({role:'teacher',user:{uid:'no-admin',email:'tunc@test.com'}});});await page.waitForFunction(()=>window.fixtureCalls.length===1);assert.equal(await page.getByRole('button').count(),0);
  await page.evaluate(()=>{window.fixtureAllowed=true;window.renderSession({role:'teacher',user:{uid:'admin',email:'tunc@test.com'}});});const button=page.getByRole('button',{name:'Soru Bankasını Güncelle',exact:true});await button.waitFor();assert.equal(await page.getByRole('button').count(),1);
  await button.evaluate(el=>{el.click();el.click();});await page.getByRole('button',{name:'Yeni sorular kontrol ediliyor…'}).waitFor();assert.equal(await page.evaluate(()=>window.fixtureCalls.filter(n=>n==='syncQuestionBank').length),1);assert.equal(await page.getByRole('button').first().isEnabled(),false);
  await page.evaluate(()=>window.completeSync());await page.getByText('Soru bankası güncellendi.',{exact:true}).waitFor();assert((await page.getByRole('status').innerText()).includes('50 yeni soru'));
  await mkdir('artifacts/github-bank-sync',{recursive:true});for(const width of [360,1366]){await page.setViewportSize({width,height:850});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`artifacts/github-bank-sync/admin-${width}.png`,fullPage:true});}
  await page.evaluate(()=>window.renderSession({role:'teacher',user:{uid:'changed',email:'other@test.com'}}));await button.waitFor({state:'detached'});assert.deepEqual(errors,[]);
  await writeFile('artifacts/github-bank-sync/ui-tests.json',JSON.stringify({passed:true,widths:[360,1366],otherTeacherPermissionCalls:0,syncCallsOnDoubleClick:1,errors},null,2));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
