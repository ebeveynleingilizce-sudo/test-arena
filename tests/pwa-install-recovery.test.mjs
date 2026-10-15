import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {chromium} from '@playwright/test';

const source=await readFile('src/app/pwa.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function model({android=true,standalone=false,remembered=true,blocked=false}={}){
 const handlers={},storage=new Map(remembered?[['test-arena-installed','true']]:[]),exports={};
 const context={exports,navigator:{userAgent:android?'Android Chrome/130':'Windows Chrome/130',platform:'',maxTouchPoints:0},localStorage:{getItem:k=>{if(blocked)throw Error();return storage.get(k);},setItem:(k,v)=>{if(blocked)throw Error();storage.set(k,v);},removeItem:k=>storage.delete(k)},window:{matchMedia:()=>({matches:standalone,addEventListener:()=>{}}),addEventListener:(name,fn)=>handlers[name]=fn}};
 vm.runInNewContext(compiled,context);return {api:exports,handlers};
}
test('Android stale flag recovers after reload; standalone and desktop suppression remain intact',()=>{
 assert.equal(model().api.installSnapshot().installed,false);
 assert.equal(model({standalone:true}).api.installSnapshot().installed,true);
 assert.equal(model({android:false}).api.installSnapshot().installed,true);
 assert.equal(model({blocked:true}).api.installSnapshot().installed,false);
 const m=model({remembered:false});m.handlers.appinstalled();assert.equal(m.api.installSnapshot().installed,true);
 assert.equal(model({remembered:true}).api.installSnapshot().installed,false);
});
test('only offered native prompt is called; dismissed/accepted do not manufacture installation',async()=>{
 for(const outcome of ['accepted','dismissed']){
  const m=model({remembered:false});let calls=0;
  await m.api.requestInstall();assert.equal(calls,0);
  m.handlers.beforeinstallprompt({preventDefault(){},prompt:async()=>{calls++;},userChoice:Promise.resolve({outcome})});
  await m.api.requestInstall();assert.equal(calls,1);assert.equal(m.api.installSnapshot().installed,false);assert.equal(m.api.installSnapshot().prompt,undefined);
 }
});
test('Android recovery instructions render on mobile and desktop without Firebase',async()=>{
 const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{InstallApp}from'./src/ui/InstallApp';createRoot(document.getElementById('root')).render(<InstallApp/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
 const css=await readFile('src/ui/pwa.css','utf8');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{browser=await chromium.launch();await mkdir('artifacts/pwa-install-recovery',{recursive:true});
  for(const width of [360,1366]){
   const page=await browser.newPage({viewport:{width,height:900},userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.addInitScript(()=>localStorage.setItem('test-arena-installed','true'));
   await page.goto(`http://127.0.0.1:${server.address().port}`);
   await page.getByRole('button',{name:'Uygulamayı İndir'}).click();
   const dialog=page.getByRole('dialog');assert(await dialog.isVisible());assert((await dialog.innerText()).includes('Ayarlar → Uygulamalar'));assert((await dialog.innerText()).includes('kanıtlamaz'));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
   await page.screenshot({path:`artifacts/pwa-install-recovery/${width}.png`,fullPage:true});await page.close();
  }
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});
