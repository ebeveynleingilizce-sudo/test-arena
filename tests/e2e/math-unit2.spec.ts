import {test,expect} from '@playwright/test';
import {loadCurriculumBank} from '../../scripts/curriculum-bank.mjs';
import {teacherClient,client,loginStudent,clearLimiter} from '../helpers.mjs';
import {disposeFixture} from '../classroom-fixture.mjs';
const records=new Map(loadCurriculumBank().records.map(r=>[r.question.questionId,r]));
test('unit-2 six representative visuals: models, shapes, comparison, scatter, dots and jumps',async({page},info)=>{
 test.setTimeout(180000);await clearLimiter();const owner=await teacherClient({fixtures:false}),pupil=client(),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 try{
  const cls=await owner.call('createClass',{className:'2. ÜNİTE GÖRSEL KONTROL',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Görsel',lastName:'Kontrol',gradeLevel:2});await loginStudent(pupil,student.code);
  await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await expect(page.getByRole('heading',{name:'Merhaba, Görsel.'})).toBeVisible();
  await page.goto('/ogrenci/coz');const choose=(name:string)=>page.locator('.selection-list button').filter({has:page.getByText(name,{exact:true})});await choose('Matematik').click();await choose('2. ÜNİTE — Sayılar ve Nicelikler').click();await expect(page.locator('.selection-list button')).toHaveCount(6);await choose('Sayılar').click();await expect(page.locator('.test-pack-list button')).toHaveCount(1);await expect(choose('Test 1')).toContainText('10 soru');
  for(const suffix of ['001','043','057','052','059','039']){
   const id='g2-mat-u2-v1-'+suffix,r=records.get(id)!;const t=await pupil.call('startTest',{grade:2,subjectId:'matematik',unitId:r.question.unitId,topicId:r.question.topicId,packId:'pack-1'});
   for(const q of t.questions){if(q.questionId===id)break;await pupil.call('submitAnswer',{testSessionId:t.testSessionId,questionId:q.questionId,selectedChoiceId:records.get(q.questionId)!.answer.correctOptionId});}
   await page.goto('/ogrenci/coz/'+t.testSessionId);await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',id);await expect(page.locator('.question-text')).toHaveText(r.question.questionText);
   if(suffix==='001'){await expect(page.locator('.ten-rod')).toHaveCount(3);await expect(page.locator('.one-blocks i')).toHaveCount(6);}
   if(suffix==='043')await expect(page.locator('.sequence-step .math-visual')).toHaveCount(4);
   if(suffix==='057'){await expect(page.locator('.scene-part').first().locator('.object-icon')).toHaveCount(12);await expect(page.locator('.scene-part').last().locator('.object-icon')).toHaveCount(28);}
   if(suffix==='052'||suffix==='059'){
    const items=page.locator('[data-scattered-object]');await expect(items).toHaveCount(suffix==='052'?32:41);await expect(page.locator('.question-visual .object-grid')).toHaveCount(0);
    // Nested SVG bounds describe painted glyphs (a pencil is narrow). Measure
    // the allocated icon viewport separately from its visible drawing.
    const rects=await items.evaluateAll(elements=>elements.map(el=>{const svg=el as SVGSVGElement,m=svg.getScreenCTM()!;const p=new DOMPoint(0,0).matrixTransform(m);return {x:p.x,y:p.y,w:svg.width.baseVal.value*m.a,h:svg.height.baseVal.value*m.d};}));const outer=(await page.locator('.scattered-objects').boundingBox())!;
    expect(await items.first().evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(15);
    for(const [i,a] of rects.entries()){expect(a.w).toBeGreaterThanOrEqual(18);expect(a.x).toBeGreaterThanOrEqual(outer.x);expect(a.y).toBeGreaterThanOrEqual(outer.y);expect(a.x+a.w).toBeLessThanOrEqual(outer.x+outer.width+1);expect(a.y+a.h).toBeLessThanOrEqual(outer.y+outer.height+1);for(const b of rects.slice(i+1))expect(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y).toBe(true);}
    const coords=await items.evaluateAll(elements=>elements.map(el=>[el.getAttribute('x'),el.getAttribute('y')]));await page.reload();await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',id);expect(await items.evaluateAll(elements=>elements.map(el=>[el.getAttribute('x'),el.getAttribute('y')]))).toEqual(coords);
    if(suffix==='059')await expect(page.locator('.scattered-objects .object-icon circle')).toHaveCount(41);
   }
   if(suffix==='039')await expect(page.locator('[data-number-jump]')).toHaveCount(3);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('.quiz-content').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
   await page.screenshot({path:`artifacts/math-unit2/${info.project.name}/${suffix}.png`,fullPage:true});
  }
  expect(errors).toEqual([]);
 }finally{await page.close();await pupil.close();await disposeFixture(owner);}
});
