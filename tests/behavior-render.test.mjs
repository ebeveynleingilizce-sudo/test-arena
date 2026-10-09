import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {chromium} from '@playwright/test';
test('behavior report renders old/new data on phone and desktop without overflow',async()=>{
 const source=readFileSync('src/features/TestBehaviorHistory.tsx','utf8').replace("import '../ui/quiz-behavior.css';",'');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 mkdirSync('.firebase/behavior-test',{recursive:true});writeFileSync('.firebase/behavior-test/render.mjs',js);
 const {TestBehaviorHistory}=await import('../.firebase/behavior-test/render.mjs');
 const record={testSessionId:'render-fixture',gradeLevel:2,subjectName:'Türkçe',unitName:'1. TEMA — Değerlerimizle Varız',packName:'Test 1',status:'completed',startedAt:1728000000000,questionCount:10,correct:7,wrong:2,blank:1,serverDurationMs:65000,visibleMs:55000,hiddenMs:10000,exitCount:1,changeCount:2,streamCount:2,reported:true,accuracyChange:20,questions:Array.from({length:10},(_,i)=>({questionId:`q${i}`,number:i+1,visibleMs:5000,changes:0,submittedAfterStartMs:5000*(i+1)}))};
 const html=renderToStaticMarkup(React.createElement(TestBehaviorHistory,{history:[record,{...record,testSessionId:'old',reported:false,accuracyChange:null,questions:[{questionId:'old-q',number:1,visibleMs:null,changes:null,submittedAfterStartMs:null}]}]}));
 assert(html.includes('Henüz veri yok'));assert(html.includes('hile kanıtı değildir'));assert(!html.includes('Risk puanı: 0'));
 const css=['styles','polish','desktop','teacher-analytics','quiz-behavior'].map(n=>readFileSync(`src/ui/${n}.css`,'utf8')).join('\n');
 const browser=await chromium.launch();try{for(const [width,height]of [[360,800],[1366,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<style>${css}</style><div class="dashboard"><aside class="sidebar"><nav>${['Ana panel','Sınıflarım','Sınıf Arenası','Öğrenci performansı'].map(t=>`<a>${t}</a>`).join('')}</nav></aside><main class="teacher-main"><section class="teacher-analytics">${html}</section></main></div>`);
  await page.locator('details').first().evaluate(e=>e.open=true);
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({cls:e.className,width:e.getBoundingClientRect().width,text:e.textContent.slice(0,70)})).slice(-10)}));
  await page.screenshot({path:`.firebase/behavior-test/report-${width}.png`,fullPage:true});assert(overflow.scroll<=width,JSON.stringify(overflow));assert.deepEqual(errors,[]);await page.close();
 }}finally{await browser.close();}
});
