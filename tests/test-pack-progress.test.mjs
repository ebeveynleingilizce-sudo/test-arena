import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizePackProgress} from '../src/data/test-pack-progress.mjs';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

test('completion is preserved across partial repeats; unrelated and duel tests are excluded',()=>{
 assert.deepEqual(summarizePackProgress([{templateId:'done',status:'completed'},{templateId:'done',status:'active'},{templateId:'partial',status:'active'},{status:'completed'},{templateId:'duel',duelId:'d',status:'completed'}]),{done:'completed',partial:'active'});
 assert.deepEqual(summarizePackProgress([{templateId:'done',status:'active'},{templateId:'done',status:'completed'}]),{done:'completed'});
});

test('student pack indicators on phone and desktop, without extra reads on rerender',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import{QuizSelection}from'./src/features/Quiz';window.calls=[];createRoot(document.getElementById('root')).render(<MemoryRouter><QuizSelection/></MemoryRouter>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},loader:{'.css':'empty'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/app\/Session$/},()=>({path:'session',namespace:'mock'}));b.onResolve({filter:/data\/firebase$/},()=>({path:'data',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='session'?`export const useSession=()=>({role:'student',student:{gradeLevel:6}});`:`export async function call(name,data){window.calls.push({name,data});if(name==='testPackProgress')return{done:'completed',partial:'active'};if(name==='quizCatalog')return{allowedGrades:[6],entries:[],curricula:[{grade:6,subjects:[{id:'turkce',name:'Türkçe',count:30,navigationModel:'theme-test',units:[{id:'tema',displayName:'Uzun tema adı',count:30,topics:[],packs:[{id:'a',templateId:'done',name:'Test 1',count:10},{id:'b',templateId:'partial',name:'Test 2',count:10},{id:'c',templateId:'new',name:'Test 3',count:10}]}]}]}]};throw Error('Unexpected call '+name);}` }));}}]});
 const css=(await Promise.all(['arena','quiz','styles','polish','desktop'].map(name=>readFile(`src/ui/${name}.css`,'utf8')))).join('\n');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch();await mkdir('artifacts/test-pack-progress',{recursive:true});
  for(const width of [360,1366]){
   const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.getByRole('button',{name:/Türkçe/}).click();await page.getByRole('button',{name:/Uzun tema adı/}).click();
   await page.locator('.test-pack-status.completed').waitFor();
   assert.equal(await page.locator('.test-pack-status.completed').innerText(),'Tamamlandı');
   assert.equal(await page.locator('.test-pack-status.active').innerText(),'Yarım kaldı');
   assert.equal(await page.locator('.test-pack-list button').nth(2).locator('.test-pack-status').count(),0);
   assert.equal(await page.locator('.test-pack-status.active circle').count(),1);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   assert.equal((await page.evaluate(()=>window.calls.filter(c=>c.name==='testPackProgress'))).length,1);
   assert.deepEqual(errors,[]);await page.screenshot({path:`artifacts/test-pack-progress/${width}.png`,fullPage:true});await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
