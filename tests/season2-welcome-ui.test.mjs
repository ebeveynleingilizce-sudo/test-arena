import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

let server,browser,url,writes=0,failNext=false;
const seen=new Set();
before(async()=>{
  const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import {Season2Welcome} from './src/ui/Season2Welcome';import {StudentLayout} from './src/ui/StudentLayout';const root=createRoot(document.getElementById('root'));window.renderSeason=()=>root.render(<BrowserRouter><StudentLayout><h1>Merhaba, Arena oyuncusu.</h1><p>Çöz. XP kazan. Zirveye çık.</p></StudentLayout><Season2Welcome/></BrowserRouter>);window.renderSeason();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,loader:{'.css':'empty'},format:'iife',jsx:'automatic',plugins:[{name:'isolated-session',setup(b){b.onResolve({filter:/(?:app\/Session|data\/firebase|season2-reset-scope|^firebase\/firestore$)/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('Session')?'export const useSession=()=>window.testSession;':a.path.includes('reset-scope')?'export const verifiedSeason2Reset=async()=>window.resetConfirmed;':a.path==='firebase/firestore'?`export const doc=(...v)=>v;export async function updateDoc(ref,value){window.testSession.student.season2WelcomeSeen=true;window.renderSeason();try{await window.saveAck(ref,value);}catch(e){window.testSession.student.season2WelcomeSeen=false;window.renderSeason();throw e;}}`:'export const db={};',loader:'js'}));}}]});
  const css=(await Promise.all(['styles.css','arena.css','season2-welcome.css'].map(f=>readFile('src/ui/'+f,'utf8')))).join('\n');
  server=createServer((req,res)=>{const q=new URL(req.url,'http://localhost').searchParams,id=q.get('id')||'a',role=q.get('role')||'student';const student=role==='student'?{teacherUid:'t',studentId:id,firstName:'Arena',className:'DOSTLAR',gradeLevel:9,status:'active',credentialVersion:1,season2WelcomeSeen:seen.has(id)}:null;res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>window.testSession=${JSON.stringify({role,student,loading:false})};window.resetConfirmed=${q.get('reset')!=='0'};</script><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js'))?.text||bundle.outputFiles[0].text}</script>`);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch();await mkdir('artifacts/season2-welcome',{recursive:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));});
async function pageFor(id,{width=360,role='student',reset=true,path='/ogrenci'}={}){
  const page=await browser.newPage({viewport:{width,height:800}});page.testErrors=[];page.on('pageerror',e=>page.testErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')page.testErrors.push(m.text());});await page.exposeFunction('saveAck',async(ref,value)=>{writes++;assert.deepEqual(value,{season2WelcomeSeen:true});if(failNext){failNext=false;throw Error('offline');}seen.add(id);});await page.goto(`${url}${path}?id=${id}&role=${role}&reset=${reset?'1':'0'}`);await page.waitForFunction(()=>typeof window.renderSeason==='function');return page;
}
test('centered dark welcome, confirmed wording and close without navigation on phone and desktop',async()=>{
  for(const width of [360,1366]){const page=await pageFor('visual-'+width,{width});try{const dialog=page.getByRole('dialog');await dialog.waitFor();assert(await page.getByText('XP puanları ve soru çözüm geçmişi sıfırlandı.').isVisible());const box=await dialog.boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`artifacts/season2-welcome/${width}.png`,fullPage:true});const before=page.url(),count=writes;await page.getByRole('button',{name:'🚀 ARENAYA KATIL!'}).evaluate(button=>{button.click();button.click();});await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(writes,count+1);assert.equal(page.url(),before);assert.equal(await page.evaluate(()=>document.body.style.overflow),'');assert.deepEqual(page.testErrors,[]);}finally{await page.close();}}
});
test('acknowledgment survives reload and a second device; another student sees its own welcome',async()=>{
  const page=await pageFor('shared');try{await page.getByRole('button',{name:'🚀 ARENAYA KATIL!'}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await page.reload();assert.equal(await page.getByRole('dialog').count(),0);const second=await pageFor('shared');try{assert.equal(await second.getByRole('dialog').count(),0);}finally{await second.close();}const other=await pageFor('other');try{await other.getByRole('dialog').waitFor();await other.keyboard.press('Escape');await other.waitForFunction(()=>!document.querySelector('dialog[open]'));assert(seen.has('other'));}finally{await other.close();}}finally{await page.close();}
});
test('teachers, guests and non-home student routes do not see the welcome',async()=>{
  for(const options of [{role:'teacher'},{role:'guest'},{path:'/ogrenci/coz'}]){const page=await pageFor('hidden',options);try{assert.equal(await page.getByRole('dialog').count(),0);}finally{await page.close();}}
});
test('unverified students never see reset or equal-start claims',async()=>{
  const page=await pageFor('unverified',{reset:false});try{await page.getByRole('dialog').waitFor();assert.equal(await page.getByText('XP puanları ve soru çözüm geçmişi sıfırlandı.').count(),0);assert.equal(await page.getByText('Herkes eşit şartlarda yeniden yarışıyor!').count(),0);assert(await page.getByText('Yeni sorular çöz, XP kazan ve sezona güçlü başla.').isVisible());}finally{await page.close();}
});
test('failed persistence keeps the modal open and allows retry without marking it seen',async()=>{
  const page=await pageFor('retry');try{failNext=true;await page.getByRole('button',{name:'🚀 ARENAYA KATIL!'}).click();await page.getByRole('alert').waitFor();assert(await page.getByRole('dialog').isVisible());assert(!seen.has('retry'));await page.getByRole('button',{name:'🚀 ARENAYA KATIL!'}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert(seen.has('retry'));}finally{await page.close();}
});
