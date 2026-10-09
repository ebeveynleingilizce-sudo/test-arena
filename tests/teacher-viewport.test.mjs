import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {MemoryRouter} from 'react-router-dom';
import {chromium} from '@playwright/test';

// Render the real components. Only data/auth and unrelated child modules are
// replaced for this offline layout regression; this is not an auth integration test.
const dir='.firebase/teacher-viewport';
mkdirSync(dir,{recursive:true});
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
writeFileSync(`${dir}/components.mjs`,compile(readFileSync('src/ui/components.tsx','utf8')));
const source=readFileSync('src/features/Teacher.tsx','utf8').replace(/^import .*;\r?\n/gm,'');
writeFileSync(`${dir}/teacher.mjs`,compile(`
import {useEffect,useState} from 'react';
import {Link,NavLink,Navigate,useParams,useNavigate,useSearchParams} from 'react-router-dom';
import {Brand,GradeSelect,Icon,errorMessage} from './components.mjs';
const useSession=()=>({role:'teacher',user:{uid:'fixture',email:'fixture@example.invalid'}});
const useTeacherClasses=()=>({classes:[],students:[],codes:{},error:''});
const classGrades=()=>[6],classGradeLabel=()=> '6. Sınıf';
const InstallApp=()=>null,AdminQuestionBank=()=>null,BulkStudents=()=>null,
TeacherAnalytics=()=>null,ClassGrades=()=>null,ClassSharing=()=>null,
JoinTeacherClass=()=>null,StudentReward=()=>null;
const auth={},call=()=>{},signOut=()=>{};
${source}`));
const {Teacher}=await import('../.firebase/teacher-viewport/teacher.mjs');
const {AuthLayout}=await import('../.firebase/teacher-viewport/components.mjs');
const render=component=>renderToStaticMarkup(React.createElement(MemoryRouter,null,component));
const login=render(React.createElement(AuthLayout,{className:'teacher-auth',title:'Tekrar hoş geldin.',eyebrow:'ÖĞRETMENLERE ÖZEL'},React.createElement('form',null,React.createElement('label',null,'E-posta',React.createElement('input',{type:'email'})),React.createElement('button',null,'Giriş yap'))));
const teacher=render(React.createElement(Teacher,{view:'home'}));
const baseline=process.argv.includes('--baseline');
const css=['styles','polish','desktop','teacher-analytics','pwa',...(baseline?[]:['teacher-viewport'])].map(n=>readFileSync(`src/ui/${n}.css`,'utf8')).join('\n');
test('teacher login and panel cover viewport with modern/legacy units, resize and long content',async()=>{
 const browser=await chromium.launch(),results=[];
 mkdirSync('artifacts/teacher-viewport',{recursive:true});
 try{for(const legacy of [false,true])for(const [width,height,scale] of [[360,800,1],[390,844,3],[768,1024,2],[1366,768,1],[1920,1080,1],[3840,2160,1],[1280,720,1.5],[1920,1800,1],[1920,420,1]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:scale}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const sheet=legacy?css.replace(/(?:min-|max-)?height\s*:[^;{}]*\b\d+(?:s|d|l)vh[^;{}]*(?:;|(?=\}))/g,''):css;
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheet}</style><div id="root">${login}</div>`);
  const check=async selector=>page.locator(selector).evaluate(e=>({height:e.getBoundingClientRect().height,viewport:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth}));
  const before=await check('.teacher-auth');
  // Session changes replace the shell in the same root/document.
  await page.locator('#root').evaluate((root,html)=>root.innerHTML=html,teacher);
  const after=await check('.dashboard');results.push({legacy,width,height,scale,before,after});
  if(!baseline){assert(before.height>=height-1);assert(after.height>=height-1);assert(!before.overflow&&!after.overflow);}
  if(width===360||width===1920&&height===1080)await page.screenshot({path:`artifacts/teacher-viewport/${baseline?'before':'after'}-${legacy?'legacy':'modern'}-${width}.png`,fullPage:true});
  for(const newHeight of [height+300,420]){
   await page.setViewportSize({width,height:newHeight});
   if(!baseline){assert((await check('.dashboard')).height>=newHeight-1);if(width>=1000)assert(Math.abs((await check('.sidebar')).height-newHeight)<2);}
  }
  await page.locator('.teacher-main').evaluate(e=>{const block=document.createElement('div');block.style.height='2500px';block.textContent='Uzun rapor';e.append(block);});
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  assert(await page.evaluate(()=>scrollY>0));assert.deepEqual(errors,[]);await page.close();
 }writeFileSync(`artifacts/teacher-viewport/${baseline?'before':'after'}.json`,JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,collapsed:results.filter(r=>r.after.height<r.height-1).length}));
 }finally{await browser.close();}
});
