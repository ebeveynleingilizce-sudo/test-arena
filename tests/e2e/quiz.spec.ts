import { test, expect } from '@playwright/test';
import { teacherClient, clearLimiter } from '../helpers.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';

test('student selects grade/topic, solves, resumes and sees secure XP results', async ({ page }, info) => {
  await clearLimiter(); const teacher = await teacherClient();
  const cls = await teacher.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
  const pupil = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Deniz', lastName: 'Arena', gradeLevel: 6 });
  await teacher.close(); const errors: string[] = [], consoleErrors: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  async function snapshot(name: string) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true }); }
  await page.goto('/ogrenci-giris'); await page.getByLabel('Öğrenci kısa kodu').fill(pupil.code); await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByRole('heading', { name: 'Merhaba, Deniz.' })).toBeVisible(); await expect(page.getByLabel('Toplam XP')).toHaveText('0 XP'); await snapshot('04-home');
  await page.getByRole('link', { name: 'Soru Çöz →' }).click(); await expect(page.getByRole('button', { name: /6. Sınıf/ })).toBeVisible(); await expect(page.getByRole('button', { name: /7. Sınıf/ })).toHaveCount(0); await snapshot('05-grade');
  await page.getByRole('button', { name: /6. Sınıf/ }).click(); await snapshot('06-subject'); await page.getByRole('button', { name: /Matematik/ }).click(); await snapshot('07-topic'); await page.getByRole('button', { name: /Kesirler/ }).click(); await snapshot('08-count');
  await expect(page.getByRole('button', { name: '20 soru' })).toBeDisabled(); await page.getByRole('button', { name: 'Teste başla →' }).click();
  await expect(page.locator('[data-question-id]')).toBeVisible();
  const firstId=await page.locator('[data-question-id]').getAttribute('data-question-id');
  await expect(page.getByRole('button',{name:'← Önceki soru'})).toBeDisabled();
  await page.locator('.answer-choices button').first().click();
  await page.getByRole('button',{name:'Sonraki soru →'}).click();
  await expect(page.locator('.quiz-meta strong')).toHaveText('2 / 10');
  await page.getByRole('button',{name:'← Önceki soru'}).click();
  await expect(page.locator('[data-question-id]')).toHaveAttribute('data-question-id',firstId!);
  await expect(page.locator('.answer-choices button[aria-pressed=true]')).toHaveCount(1);
  // All questions can be skipped without submission; the summary remains resumable.
  for(let i=0;i<9;i++) await page.getByRole('button',{name:'Sonraki soru →'}).click();
  await page.getByRole('button',{name:'Sonuçları gör'}).click();
  await expect(page.locator('.quiz-result')).toContainText('Boş: 10');
  await expect(page.locator('.result-xp')).toHaveText('+0 XP');
  await page.getByRole('button',{name:'Boş sorulara dön'}).click();
  await expect(page.locator('.quiz-meta strong')).toHaveText('1 / 10');
  await snapshot('09-skip-navigation');
  for (let i = 0; i < 10; i++) {
    const question = page.locator('[data-question-id]'); await expect(question).toBeVisible(); const id = await question.getAttribute('data-question-id');
    const fixture = demoQuestions.find(e => e.question.questionId === id)!;
    const choice = fixture.question.choices.find(c => i === 0 ? c.choiceId !== fixture.answer.correctChoiceId : c.choiceId === fixture.answer.correctChoiceId)!;
    if (i === 0) await snapshot('09-question');
    await page.locator('.answer-choices button').filter({ has: page.getByText(choice.text, { exact: true }) }).click();
    await page.getByRole('button', { name: 'Cevabı kontrol et' }).click();
    await expect(page.locator('.answer-feedback')).toContainText(i === 0 ? 'Yanlış · +0 XP' : 'Doğru! +1 XP');
    if (i === 0) await snapshot('10-wrong'); if (i === 1) await snapshot('10-correct');
    await page.getByRole('button', { name: i === 9 ? 'Sonuçları gör' : 'Sonraki soru →' }).click();
    if(i===0){
      await page.getByRole('button',{name:'← Önceki soru'}).click();
      await expect(page.locator('.answer-feedback')).toContainText('Yanlış · +0 XP');
      await expect(page.getByRole('button',{name:'Cevabı kontrol et'})).toHaveCount(0);
      await page.getByRole('button',{name:'Sonraki soru →'}).click();
    }
    if (i === 2) { await page.reload(); await expect(page.locator('.quiz-meta strong')).toHaveText('4 / 10'); }
  }
  await expect(page.locator('.result-xp')).toHaveText('+9 XP'); await expect(page.locator('.result-stats')).toContainText('9Doğru'); await expect(page.locator('.result-stats')).toContainText('1Yanlış'); await snapshot('11-result');
  await page.reload(); await expect(page.locator('.result-xp')).toHaveText('+9 XP');
  await page.getByRole('button', { name: 'Tekrar çöz' }).click();
  for (let i = 0; i < 4; i++) {
    const question = page.locator('[data-question-id]'); await expect(question).toBeVisible(); const id = await question.getAttribute('data-question-id'); const fixture = demoQuestions.find(e => e.question.questionId === id)!; const choice = fixture.question.choices.find(c => c.choiceId === fixture.answer.correctChoiceId)!;
    await page.locator('.answer-choices button').filter({ has: page.getByText(choice.text, { exact: true }) }).click(); await page.getByRole('button', { name: 'Cevabı kontrol et' }).click();
    await expect(page.locator('.answer-feedback')).toBeVisible(); if (i === 3) { await expect(page.locator('.answer-feedback')).toContainText('daha önce kazandın'); await snapshot('10-repeat-zero'); }
    await page.getByRole('button', { name: 'Sonraki soru →' }).click();
  }
  await page.getByRole('link', { name: '← Ana ekran' }).click(); await expect(page.getByLabel('Toplam XP')).toHaveText('12 XP');
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});
