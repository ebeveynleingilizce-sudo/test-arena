import {test,expect} from '@playwright/test';
import {loadCurriculumBank} from '../../scripts/curriculum-bank.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from '../helpers.mjs';
import {disposeFixture} from '../classroom-fixture.mjs';

const bank=loadCurriculumBank(),records=new Map(bank.records.map(r=>[r.question.questionId,r]));
test('V3 representative real objects, geometry, options, marks, liquids and compositions',async({page},info)=>{
 test.setTimeout(180000);await clearLimiter();const owner=await teacherClient({fixtures:false}),pupil=client(),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  const cls=await owner.call('createClass',{className:'V3 GÖRSEL KONTROL',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Görsel',lastName:'Kontrol',gradeLevel:2});
  await loginStudent(pupil,student.code);await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await expect(page.getByRole('heading',{name:'Merhaba, Görsel.'})).toBeVisible();
  await page.goto('/ogrenci/coz');const choose=(name:string)=>page.locator('.selection-list button').filter({has:page.getByText(name,{exact:true})});await choose('Matematik').click();await choose('1. ÜNİTE — Nesnelerin Geometrisi').click();await expect(page.locator('.selection-list button')).toHaveCount(5);await choose('Geometrik Cisimler').click();await expect(page.locator('.test-pack-list button')).toHaveCount(1);await expect(choose('Test 1')).toContainText('10 soru');
  const polish=process.env.V3_ASSET_POLISH==='1';
  const samples=polish?['002','004','006','007']:process.env.V3_CONSTRUCTION_ONLY==='1'?['015']:['003','005','007','015','019','034','035','043','044'];
  for(const suffix of samples){
   const id='g2-mat-u1-v3-'+suffix,r=records.get(id)!;
   const t=await pupil.call('startTest',{grade:2,subjectId:'matematik',unitId:r.question.unitId,topicId:r.question.topicId,packId:'pack-1'});
   expect(t.questions).toHaveLength(10);expect(t.questions.every((q:any)=>q.questionId.startsWith('g2-mat-u1-v3-'))).toBe(true);
   for(const q of t.questions){if(q.questionId===id)break;await pupil.call('submitAnswer',{testSessionId:t.testSessionId,questionId:q.questionId,selectedChoiceId:records.get(q.questionId)!.answer.correctOptionId});}
   await page.goto('/ogrenci/coz/'+t.testSessionId);await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',id);await expect(page.locator('.question-text')).toHaveText(r.question.questionText);
   const visuals=page.locator('.question-visual [role="img"], .answer-choices [role="img"]');expect(await visuals.count()).toBeGreaterThan(0);
   for(const v of await visuals.all()){await expect(v).toBeVisible();expect(await v.getAttribute('aria-label')).toBeTruthy();const b=await v.boundingBox();expect(b!.width).toBeGreaterThan(40);expect(b!.height).toBeGreaterThan(40);}
   if(suffix==='003'){await expect(page.locator('[data-object-asset="can"]')).toBeVisible();const visual=await page.locator('.question-visual').boundingBox(),h=await page.locator('.question-text').boundingBox();expect(visual!.y+visual!.height).toBeLessThanOrEqual(h!.y);}
   if(suffix==='005')await expect(page.locator('.answer-choices [data-object-asset]')).toHaveCount(3);
   if(suffix==='019'){for(const a of ['ball','dice','can'])await expect(page.locator(`.question-visual [data-object-asset="${a}"]`)).toBeVisible();}
   if(suffix==='015'){const pieces=page.locator('[data-composition-asset="cube-cylinder-house"] > svg');await expect(pieces).toHaveCount(3);await expect(pieces.nth(0)).toHaveAttribute('x','45');await expect(pieces.nth(2)).toHaveAttribute('x','150');}
   if(suffix==='034')await expect(page.locator('[data-mark="face"]')).toBeVisible();
   if(suffix==='035')await expect(page.locator('.question-visual circle[fill="#ec941f"]')).toBeVisible();
   if(suffix==='043')await expect(page.locator('.answer-choices [data-visual-kind="container"]')).toHaveCount(3);
   if(suffix==='044')await expect(page.locator('[data-composition-asset="same-water-different-capacity"]')).toBeVisible();
   if(polish){
    if(suffix==='002')await expect(page.locator('[data-ball-style="football"]')).toBeVisible();
    if(suffix==='004')await expect(page.locator('[data-hat-decoration="pompon"]')).toBeVisible();
    if(suffix==='007'){await expect(page.locator('.answer-choices [data-ball-style]')).toHaveCount(0);await expect(page.locator('.answer-choices .math-visual')).toHaveCount(3);}
    if(suffix==='006'||suffix==='007')for(const button of await page.locator('.answer-choices button').all()){
     const box=await button.boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.height).toBeLessThanOrEqual(info.project.name==='phone'?140:165);
     const visual=await button.locator('[role="img"]').boundingBox();expect(visual!.width).toBeGreaterThanOrEqual(80);expect(visual!.height).toBeGreaterThanOrEqual(80);
     expect(await button.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    }
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.quiz-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   await page.screenshot({path:`artifacts/math-v3/${info.project.name}/${suffix}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
 }finally{await page.close();await pupil.close();await disposeFixture(owner);}
});
