import { test, expect } from '@playwright/test';
import { teacherClient, clearLimiter } from '../helpers.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';

test('lost answer response can be retried without awarding a second XP', async ({ page }) => {
  await clearLimiter(); const teacher = await teacherClient();
  const cls = await teacher.call('createClass', { className: 'TEKRAR', defaultGradeLevel: 6 });
  const pupil = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Ece', lastName: 'Test', gradeLevel: 6 }); await teacher.close();
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/ogrenci-giris'); await page.getByLabel('Öğrenci kısa kodu').fill(pupil.code); await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByRole('link', { name: 'Soru Çöz →' }).click(); await page.getByRole('button', { name: /6. Sınıf/ }).click(); await page.getByRole('button', { name: /Matematik/ }).click(); await page.getByRole('button', { name: /Kesirler/ }).click(); await page.getByRole('button', { name: 'Teste başla →' }).click();
  const question = page.locator('[data-question-id]'); await expect(question).toBeVisible(); const id = await question.getAttribute('data-question-id'); const fixture = demoQuestions.find(e => e.question.questionId === id)!; const choice = fixture.question.choices.find(c => c.choiceId === fixture.answer.correctChoiceId)!;
  await page.locator('.answer-choices button').filter({ has: page.getByText(choice.text, { exact: true }) }).click();
  // Commit reaches the server, but the browser never receives its response.
  await page.route('**/submitAnswer', async route => { await route.fetch(); await route.abort('failed'); }, { times: 1 });
  await page.getByRole('button', { name: 'Cevabı kontrol et' }).click(); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('.answer-feedback')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cevabı kontrol et' }).click(); await expect(page.locator('.answer-feedback')).toContainText('Doğru! +1 XP');
  await page.getByRole('link', { name: '← Ana ekran' }).click(); await expect(page.getByLabel('Toplam XP')).toHaveText('1 XP');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); expect(errors).toEqual([]);
});
