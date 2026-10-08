import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {teacherClient,clearLimiter} from '../helpers.mjs';
import {disposeFixture} from '../classroom-fixture.mjs';
import {visualFixture} from '../visual-fixture.mjs';
const source=JSON.parse(readFileSync('tests/fixtures/math-engine-questions.json','utf8'));
test('30 parametrical mathematics fixtures: accurate models, touch/keyboard, placements, all presets, safe XP and responsive layout',async({page},info)=>{
 test.setTimeout(360000);await clearLimiter();const owner=await teacherClient(),fixture=await visualFixture(source,30);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
 const cls=await owner.call('createClass',{className:'MATH ENGINE E2E',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Model',lastName:'Test',gradeLevel:2});
 await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await expect(page.getByRole('heading',{name:'Merhaba, Model.'})).toBeVisible();await page.getByRole('link',{name:'Soru Çöz →'}).click();await page.getByRole('button',{name:/2\. Sınıf/}).click();await page.getByRole('button',{name:/Matematik/}).click();await page.getByRole('button',{name:fixture.topicName+' 30 soru →',exact:true}).click();await page.getByRole('button',{name:'30 soru',exact:true}).click();await page.getByRole('button',{name:'Teste başla →'}).click();
 const seen=new Set<string>(),records=new Map(fixture.records.map((r:any)=>[r.question.questionId,r]));let wrongId='';
 for(let i=0;i<30;i++){
  const heading=page.locator('[data-question-id]');await expect(heading).toBeVisible();const id=(await heading.getAttribute('data-question-id'))!,r:any=records.get(id),example=source.questions.find((q:any)=>id.endsWith('_'+q.id));seen.add(example.id);
  if(i===0){wrongId=id;await page.reload();await expect(heading).toHaveAttribute('data-question-id',id);}
  if(example.id==='01-count'){await expect(page.locator('.question-visual .object-icon')).toHaveCount(36);expect(await page.locator('.object-grid').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);}
  if(example.id==='02-dozen'){const counts=[];for(const button of await page.locator('.answer-choices button').all())counts.push(await button.locator('.object-icon').count());expect(counts.sort((a,b)=>a-b)).toEqual([9,10,12]);}
  if(example.id==='03-base-read'){await expect(page.locator('.ten-rod')).toHaveCount(3);await expect(page.locator('.one-blocks i')).toHaveCount(4);const visual=await page.locator('.question-visual').boundingBox(),h=await heading.boundingBox();expect(visual!.y+visual!.height).toBeLessThanOrEqual(h!.y);}
  if(example.id==='08-vertical-add'||example.id==='09-vertical-subtract'){const rows=page.locator('.operation-row');for(let j=1;j<3;j++){const a=await rows.nth(0).locator('b').nth(j).boundingBox(),b=await rows.nth(1).locator('b').nth(j).boundingBox();expect(Math.abs(a!.x-b!.x)).toBeLessThan(1);}}
  if(example.id==='25-liquid'){await expect(page.locator('.question-visual clipPath rect').first()).toHaveAttribute('y','95');await expect(page.locator('.question-visual clipPath rect').nth(1)).toHaveAttribute('y','35');}
  if(example.id==='21-clock'){for(const svg of await page.locator('.answer-choices .math-diagram').all()){const box=await svg.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(90);expect(box!.height).toBeGreaterThanOrEqual(90);}for(const s of await page.locator('[data-hand="minute"]').all())expect(await s.getAttribute('d')).toMatch(/^M110 110L/);}
  for(const b of await page.locator('.answer-choices button').all()){const box=await b.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(100);expect(box!.height).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(example.id==='26-data'){expect(await page.locator('.math-data').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');}
  for(const el of await page.locator('.mathematical-visual').all()){expect(await el.getAttribute('aria-label')).toBeTruthy();const box=await el.boundingBox();expect(box!.width).toBeGreaterThan(50);}
  await page.screenshot({path:`artifacts/visual-engine/${info.project.name}/${example.id}.png`,fullPage:true});
  const choiceId=id===wrongId?'b':'a',button=page.locator(`.answer-choices button[data-choice-id="${choiceId}"]`);await button.focus();await button.press('Space');
  await page.getByRole('button',{name:'Cevabı kontrol et',exact:true}).click();await expect(page.locator('.answer-feedback')).toContainText(id===wrongId?'Yanlış · +0 XP':'+1 XP');await page.getByRole('button',{name:/^(Sonraki soru →|Sonuçları gör)$/}).click();
 }
 expect(seen.size).toBe(30);await expect(page.locator('.result-xp')).toHaveText('+29 XP');expect(errors).toEqual([]);
 const report=await owner.call('teacherAnalytics',{studentId:student.studentId});expect(report.totals.overall).toEqual({solved:30,correct:29,wrong:1});expect(report.totals.academicXP).toBe(29);
 }finally{await disposeFixture(owner);await fixture.close();}
});
