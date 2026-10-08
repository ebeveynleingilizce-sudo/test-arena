import { test, expect } from '@playwright/test';
import { loadCurriculumBank } from '../../scripts/curriculum-bank.mjs';
import { teacherClient, clearLimiter } from '../helpers.mjs';
import { disposeFixture } from '../classroom-fixture.mjs';

const bank = loadCurriculumBank();
test('real grade-2 curriculum, four subjects, units/topics, small pools, secure XP and analytics', async ({ page }, info) => {
  test.setTimeout(180000);await clearLimiter();
  const owner=await teacherClient({fixtures:false}), errors:string[]=[], consoleErrors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  try {
    const cls=await owner.call('createClass',{className:'GERÇEK MÜFREDAT',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Elif',lastName:'Pilot',gradeLevel:2});
    async function shot(name:string){await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/navigation-v2/${info.project.name}/${name}.png`,fullPage:true});}
    const choose=(name:string)=>page.locator('.selection-list button').filter({has:page.getByText(name,{exact:true})});
    await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);await page.getByRole('button',{name:'Giriş yap'}).click();await expect(page.getByRole('heading',{name:'Merhaba, Elif.'})).toBeVisible();
    await page.getByRole('link',{name:'Soru Çöz →'}).click();await expect(page.getByRole('heading',{name:'Hangi ders?'})).toBeVisible();
    await expect(page.locator('.selection-list button')).toHaveCount(4);for(const s of bank.curricula[0].subjects)await expect(choose(s.name)).toBeVisible();await expect(page.locator('body')).not.toContainText('demo');await shot('01-subjects');
    for(const s of bank.curricula[0].subjects){
      await choose(s.name).click();await expect(page.getByRole('heading',{name:s.sectionLabel==='TEMA'?'Temanı seç':s.sectionLabel==='THEME'?'Theme seç':'Üniteni seç'})).toBeVisible();
      await expect(page.locator('.selection-list button')).toHaveCount(s.units.length);
      for(const u of s.units) await expect(choose(u.displayName)).toBeVisible();
      await expect(page.locator('body')).not.toContainText('Karışık Test');await shot('02-units-'+s.id);
      await choose(s.units[0].displayName).click();
      if(s.id==='turkce'){
        await expect(page.getByRole('heading',{name:'Testini seç'})).toBeVisible();await expect(page.getByText('Bu temada henüz eşleştirilmiş soru bulunmuyor.')).toBeVisible();
        await expect(page.locator('.test-pack-list button')).toHaveCount(0);
        for(const forbidden of ['Dinleme/İzleme','Konuşma','Okuma','Yazma','Yazmayı Planlama ve Yönetme','Okumayı Değerlendirme'])await expect(page.locator('.quiz-content')).not.toContainText(forbidden);
      }else{
        await expect(page.getByRole('heading',{name:'Konunu seç'})).toBeVisible();await expect(page.locator('.selection-list button')).toHaveCount(s.units[0].topics.length);
        for(const t of s.units[0].topics)await expect(choose(t.name)).toBeVisible();
      }
      await shot('03-topics-'+s.id);await page.goto('/ogrenci/coz');await expect(page.getByRole('heading',{name:'Hangi ders?'})).toBeVisible();
    }
    // Long English units and real Classroom Life subtopics; no curriculum codes.
    const english=bank.curricula[0].subjects.find(s=>s.id==='ingilizce')!;
    await choose(english.name).click();await expect(choose(english.units[4].displayName)).toBeVisible();await choose(english.units[1].displayName).click();const r=bank.records.find(r=>r.question.questionId==='g2-en-0004')!;await choose(english.units[1].topics.find(t=>t.id===r.question.topicId)!.name).click();
    await expect(page.getByRole('heading',{name:'Testini seç'})).toBeVisible();await expect(page.locator('.test-pack-list button')).toHaveCount(1);await shot('04-single-question-pack');
    await choose('Test 1').click();await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id','g2-en-0004');await expect(page.locator('.question-text')).toHaveText(r.question.questionText);await expect(page.locator('body')).not.toContainText('ENG.2.');await shot('05-english-question');
    const correctText=r.question.choices.find(c=>c.choiceId===r.answer.correctOptionId)!.text;await page.locator('.answer-choices button').filter({has:page.getByText(correctText,{exact:true})}).click();await page.getByRole('button',{name:'Cevabı kontrol et'}).click();await expect(page.locator('.answer-feedback')).toContainText('+1 XP');await shot('06-correct');await page.getByRole('button',{name:'Sonuçları gör'}).click();
    // The retained one-question fraction pilot: wrong, later first correct, then zero new XP.
    await page.goto('/ogrenci/coz');const math=bank.curricula[0].subjects.find(s=>s.id==='matematik')!,m=bank.records.find(r=>r.question.questionId==='g2-mat-0005')!;
    await choose(math.name).click();await choose(math.units.find(u=>u.id===m.question.unitId)!.displayName).click();await choose(m.question.topicName).click();await choose('Test 1').click();await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',m.question.questionId);await shot('07-math-question');
    const wrongText=m.question.choices.find(c=>c.choiceId!==m.answer.correctOptionId)!.text, mathCorrect=m.question.choices.find(c=>c.choiceId===m.answer.correctOptionId)!.text;
    await page.locator('.answer-choices button').filter({has:page.getByText(wrongText,{exact:true})}).click();await page.getByRole('button',{name:'Cevabı kontrol et'}).click();await expect(page.locator('.answer-feedback')).toContainText('Yanlış · +0 XP');await shot('08-wrong');await page.getByRole('button',{name:'Sonuçları gör'}).click();
    for(const earned of [1,0]){await page.getByRole('button',{name:'Tekrar çöz',exact:true}).click();await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',m.question.questionId);await page.locator('.answer-choices button').filter({has:page.getByText(mathCorrect,{exact:true})}).click();await page.getByRole('button',{name:'Cevabı kontrol et'}).click();await expect(page.locator('.answer-feedback')).toContainText(`+${earned} XP`);if(!earned)await shot('09-repeated-no-xp');await page.getByRole('button',{name:'Sonuçları gör'}).click();await expect(page.locator('.result-xp')).toHaveText(`+${earned} XP`);}
    const report=await owner.call('teacherAnalytics',{studentId:student.studentId});expect(report.totals.overall).toEqual({solved:4,correct:3,wrong:1});expect(report.totals.academicXP).toBe(2);expect(report.dimensions.filter(d=>d.kind==='unit')).toHaveLength(2);
    // Zero-question topic and longest math labels stay readable; mixed tests are a mode.
    await page.goto('/ogrenci/coz');await choose(math.name).click();await choose(math.units[2].displayName).click();await shot('10-long-math-topics');await choose(math.units[2].topics[1].name).click();await expect(page.getByText('Bu konuda henüz soru bulunmuyor. Başka bir konu seçebilirsin.')).toBeVisible();await expect(page.locator('.test-pack-list button')).toHaveCount(0);await shot('11-empty-topic');
    const hb=bank.curricula[0].subjects.find(s=>s.id==='hayat-bilgisi')!,hr=bank.records.find(r=>r.question.questionId==='g2-hb-0001')!;
    await page.goto('/ogrenci/coz');await choose(hb.name).click();await choose(hb.units[0].displayName).click();await choose(hb.units[0].topics[0].name).click();await choose('Test 1').click();
    await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',hr.question.questionId);await shot('12-life-skills-question');
    await page.route('**/quizCatalog',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.continue();});await page.goto('/ogrenci/coz');await expect(page.getByText('Konular hazırlanıyor…')).toBeVisible();await shot('13-loading');await expect(page.getByRole('heading',{name:'Hangi ders?'})).toBeVisible();await page.unroute('**/quizCatalog');
    await page.route('**/quizCatalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:{status:'UNAVAILABLE',message:'Geçici hata'}})}));await page.goto('/ogrenci/coz');await expect(page.getByRole('alert')).toBeVisible();await shot('14-error');await page.unroute('**/quizCatalog');await page.getByRole('button',{name:'Yeniden dene'}).click();await expect(page.getByRole('heading',{name:'Hangi ders?'})).toBeVisible();
    expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
  }finally{await disposeFixture(owner);}
});
