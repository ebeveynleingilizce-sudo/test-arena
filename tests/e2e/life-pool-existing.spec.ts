import {test,expect} from '@playwright/test';
import {Firestore} from 'firebase-admin/firestore';
import {teacherClient} from '../helpers.mjs';
import {disposeFixture} from '../classroom-fixture.mjs';

test('existing 1 curated + 5 verified life questions: student UI, private keys, wrong/first/repeat XP',async({page},info)=>{
  test.setTimeout(120000);
  const db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false});
  const owner=await teacherClient({fixtures:false}),errors:string[]=[],aiRequests:string[]=[],awarded=new Set<string>();
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/generativelanguage|aiplatform|refill|orchestrat/i.test(r.url()))aiRequests.push(r.url());});
  try {
    const pool=await db.collection('questions').where('gradeLevel','==',2).where('subject','==','hayat-bilgisi')
      .where('unitId','==','g2-hayat-bilgisi-ben-ve-okulum').where('topic','==','g2-hayat-bilgisi-zaman-yonetimi')
      .where('status','==','published').where('isDemo','==',false).get();
    const keys=new Map<string,string>();for(const d of pool.docs)keys.set(d.id,(await db.doc('privateQuestionAnswers/'+d.id).get()).data()!.correctOptionId);
    const cls=await owner.call('createClass',{className:'AŞAMA 4 TEST',defaultGradeLevel:2});
    const student=await owner.call('createStudent',{classId:cls.classId,firstName:'Havuz',lastName:'Kontrol',gradeLevel:2});
    await page.goto('/ogrenci-giris');await page.getByLabel('Öğrenci kısa kodu').fill(student.code);
    await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await expect(page.getByRole('heading',{name:'Merhaba, Havuz.'})).toBeVisible();
    // Resume a real remembered session at the home route, not a direct quiz URL.
    await page.goto('/ogrenci');await expect(page.getByRole('heading',{name:'Merhaba, Havuz.'})).toBeVisible();
    await page.getByRole('link',{name:'Soru Çöz →'}).click();
    const choose=(name:string)=>page.locator('.selection-list button').filter({has:page.getByText(name,{exact:true})});
    // Grade 2 is the sole permitted grade, selected automatically by the existing UI.
    await choose('Hayat Bilgisi').click();await choose('1. ÜNİTE — Ben ve Okulum').click();await choose('Zaman Yönetimi').click();
    await expect(choose('Test 1')).toContainText('6 soru');
    expect(pool.size).toBe(6);expect(pool.docs.filter(d=>d.data().source==='ai_verified')).toHaveLength(5);
    const started=page.waitForResponse(r=>r.url().endsWith('/startTest'));await choose('Test 1').click();
    const body=await (await started).json(),quiz=body.result??body.data;
    expect(quiz.questions).toHaveLength(6);expect(new Set(quiz.questions.map((q:any)=>q.questionId))).toEqual(new Set(keys.keys()));
    for(const q of quiz.questions){
      expect(JSON.stringify(q)).not.toMatch(/correctOptionId|correctChoiceId|explanation|solvedOptionId|answerKey/);
      await expect(page.locator('[data-question-id]')).toBeVisible();
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/life-pool-existing/${info.project.name}.png`,fullPage:true});
    for(let round=0;round<3;round++) {
      for(let index=0;index<6;index++) {
        const question=page.locator('[data-question-id]');await expect(question).toBeVisible();
        const id=(await question.getAttribute('data-question-id'))!,correct=keys.get(id)!;
        const wrong=round===0&&index===0;
        const selected=wrong?await page.locator(`.answer-choices button:not([data-choice-id="${correct}"])`).first().getAttribute('data-choice-id'):correct;
        await page.locator(`.answer-choices button[data-choice-id="${selected}"]`).click();
        const response=page.waitForResponse(r=>r.url().endsWith('/submitAnswer'));await page.getByRole('button',{name:'Cevabı kontrol et'}).click();
        const payload=await (await response).json(),answer=(payload.result??payload.data).answer;
        const xp=wrong||awarded.has(id)?0:1;
        expect(answer.isCorrect).toBe(!wrong);expect(answer.earnedXP).toBe(xp);
        if(!wrong)awarded.add(id);
        await expect(page.locator('.answer-feedback')).toContainText(`+${xp} XP`);
        await page.getByRole('button',{name:index===5?'Sonuçları gör':'Sonraki soru →'}).click();
      }
      await expect(page.locator('.result-xp')).toHaveText(`+${[5,1,0][round]} XP`);
      if(round<2){await page.getByRole('button',{name:'Tekrar çöz',exact:true}).click();await expect(page.locator('[data-question-id]')).toBeVisible();}
    }
    await page.getByRole('link',{name:'← Ana ekran'}).click();await expect(page.getByLabel('Toplam XP')).toHaveText('6 XP');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);expect(aiRequests).toEqual([]);
  }finally {await page.close();await disposeFixture(owner);await db.terminate();}
});
