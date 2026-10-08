import {test,expect} from '@playwright/test';
import {teacherClient,clearLimiter} from '../helpers.mjs';
import {disposeFixture} from '../classroom-fixture.mjs';
import {visualFixture} from '../visual-fixture.mjs';

test('visual prompts/options, keyboard selection, server answers, repeat XP and responsive geometry',async({page},info)=>{
  test.setTimeout(240000);await clearLimiter();const owner=await teacherClient(),fixture=await visualFixture();
  const errors:string[]=[],consoleErrors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  try{
    const cls=await owner.call('createClass',{className:'GÖRSEL FİXTURE',defaultGradeLevel:2}),student=await owner.call('createStudent',{classId:cls.classId,firstName:'Görsel',lastName:'Test',gradeLevel:2});
    await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await expect(page.getByRole('heading',{name:'Merhaba, Görsel.'})).toBeVisible();
    // Existing isolated fixture bank only. No curriculum/navigation or real bank documents are edited.
    await page.getByRole('link',{name:'Soru Çöz →'}).click();await page.getByRole('button',{name:/2\. Sınıf/}).click();await page.getByRole('button',{name:/Matematik/}).click();await page.getByRole('button',{name:fixture.topicName+' 10 soru →',exact:true}).click();await page.getByRole('button',{name:'Teste başla →'}).click();
    const records=new Map(fixture.records.map((r:any)=>[r.question.questionId,r])),seen=new Set<string>(),shapes=new Set<string>();
    const wrongId=fixture.records[0].question.questionId;
    async function choose(c:any){const button=c.visual?page.locator('.answer-choices button').filter({has:page.getByRole('img',{name:c.visual.alt,exact:true})}):page.locator('.answer-choices button').filter({has:page.getByText(c.text,{exact:true})});await button.focus();await button.press('Space');await expect(button).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'Cevabı kontrol et',exact:true}).click();}
    async function next(){await page.getByRole('button',{name:/^(Sonraki soru →|Sonuçları gör)$/}).click();}
    for(let i=0;i<10;i++){
      const el=page.locator('[data-question-id]');await expect(el).toBeVisible();const id=(await el.getAttribute('data-question-id'))!;seen.add(id);const r:any=records.get(id),q=r.question;
      if(i===0){await page.reload();await expect(el).toHaveAttribute('data-question-id',id);}
      if(q.visual){shapes.add(q.visual.shape);await expect(page.locator('.question-visual svg')).toHaveAttribute('aria-label',q.visual.alt);}
      for(const c of q.choices.filter((c:any)=>c.visual)){shapes.add(c.visual.shape);await expect(page.locator('.answer-choices').getByRole('img',{name:c.visual.alt,exact:true})).toBeVisible();}
      if(q.choices.some((c:any)=>c.visual)){
        expect(await page.locator('.answer-choices').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(2);
        for(const button of await page.locator('.answer-choices button').all()){const box=await button.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(100);expect(box!.height).toBeGreaterThanOrEqual(100);}
      }
      for(const svg of await page.locator('.math-visual').all()){const box=await svg.boundingBox();expect(box!.width).toBeGreaterThanOrEqual(70);expect(box!.height).toBeGreaterThanOrEqual(70);await expect(svg).toHaveAttribute('role','img');expect((await svg.getAttribute('aria-label'))!.length).toBeGreaterThan(5);}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`artifacts/visual-quiz/${info.project.name}/${q.questionId.split('_').at(-1)}.png`,fullPage:true});
      const correct=q.choices.find((c:any)=>c.choiceId===r.answer.correctChoiceId),selection=id===wrongId?q.choices.find((c:any)=>c.choiceId!==r.answer.correctChoiceId):correct;
      await choose(selection);await expect(page.locator('.answer-feedback')).toContainText(id===wrongId?'Yanlış · +0 XP':'+1 XP');
      if(id===wrongId){await expect(page.locator('.correct-answer-visual svg')).toHaveAttribute('aria-label',correct.visual.alt);await page.screenshot({path:`artifacts/visual-quiz/${info.project.name}/wrong-feedback.png`,fullPage:true});}
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await next();
    }
    expect(seen.size).toBe(10);expect(shapes.size).toBe(9);await expect(page.locator('.result-xp')).toHaveText('+9 XP');
    await page.getByRole('button',{name:'Tekrar çöz',exact:true}).click();
    for(let i=0;i<10;i++){const el=page.locator('[data-question-id]');await expect(el).toBeVisible();const id=(await el.getAttribute('data-question-id'))!,r:any=records.get(id);await choose(r.question.choices.find((c:any)=>c.choiceId===r.answer.correctChoiceId));await expect(page.locator('.answer-feedback')).toContainText(id===wrongId?'+1 XP':'+0 XP');await next();}
    await expect(page.locator('.result-xp')).toHaveText('+1 XP');const report=await owner.call('teacherAnalytics',{studentId:student.studentId});expect(report.totals.overall).toEqual({solved:20,correct:19,wrong:1});expect(report.totals.academicXP).toBe(10);
    expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
  }finally{await disposeFixture(owner);await fixture.close();}
});
