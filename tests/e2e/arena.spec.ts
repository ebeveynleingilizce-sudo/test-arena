import { test, expect } from '@playwright/test';
import { teacherClient, client, loginStudent, clearLimiter } from '../helpers.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';

test('class rivals update live after secure XP; home, Arena and profile navigation work', async ({ page, browser }, info) => {
  await clearLimiter(); const teacher = await teacherClient(), pupilClient = client();
  const cls = await teacher.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
  const deniz = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Deniz', lastName: 'Yılmaz', gradeLevel: 6 });
  const mehmet = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Mehmet', lastName: 'Kaya', gradeLevel: 6 });
  await loginStudent(pupilClient, mehmet.code);
  const t = await pupilClient.call('startTest', { gradeLevel: 6, subject: 'matematik', topic: 'kesirler', questionCount: 10 });
  const q = t.questions[0], key = demoQuestions.find(e => e.question.questionId === q.questionId)!.answer.correctChoiceId;
  await pupilClient.call('submitAnswer', { testSessionId: t.testSessionId, questionId: q.questionId, selectedChoiceId: key });
  await pupilClient.close();
  const errors: string[] = [], consoleErrors: string[] = [];
  const rivalContext = await browser.newContext({ viewport: info.project.use.viewport }); const rival = await rivalContext.newPage();
  for (const p of [page, rival]) { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); }); }
  async function login(p: typeof page, code: string) { await p.goto('http://127.0.0.1:5173/ogrenci-giris'); await p.getByLabel('Öğrenci kısa kodu').fill(code); await p.getByRole('button', { name: 'Giriş yap' }).click(); await expect(p.locator('.student-nav')).toBeVisible(); }
  async function snapshot(name: string) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true }); }
  await login(page, deniz.code); await expect(page.getByLabel('Toplam XP')).toHaveText('0 XP'); await expect(page.getByLabel('Sınıf sıran')).toHaveText('#2'); await expect(page.locator('.rival-message')).toContainText('2 XP');
  if (info.project.name === 'phone') {
    const cta = await page.getByRole('link', { name: 'Soru Çöz →', exact: true }).boundingBox();
    const nav = await page.getByRole('navigation').boundingBox(); expect(cta!.y + cta!.height).toBeLessThanOrEqual(nav!.y);
  }
  await snapshot('03-home-rival');
  await page.getByRole('navigation').getByRole('link', { name: 'Arena', exact: true }).click(); await expect(page.getByRole('tab', { name: 'Bu Hafta' })).toHaveAttribute('aria-selected', 'true'); await expect(page.locator('.arena-own')).toContainText('#2'); await expect(page.locator('.arena-own')).toContainText('0 XP'); await snapshot('12-arena-before');
  await login(rival, mehmet.code); await rival.getByRole('navigation').getByRole('link', { name: 'Arena', exact: true }).click(); await expect(rival.locator('.arena-own')).toContainText('1 XP');
  await page.getByRole('navigation').getByRole('link', { name: 'Çöz', exact: true }).click(); await page.getByRole('button', { name: /6. Sınıf/ }).click(); await page.getByRole('button', { name: /Matematik/ }).click(); await page.getByRole('button', { name: /Kesirler/ }).click(); await page.getByRole('button', { name: 'Teste başla →' }).click();
  const question = page.locator('[data-question-id]'); await expect(question).toBeVisible(); const id = await question.getAttribute('data-question-id'); const fixture = demoQuestions.find(e => e.question.questionId === id)!; const choice = fixture.question.choices.find(c => c.choiceId === fixture.answer.correctChoiceId)!;
  await page.locator('.answer-choices button').filter({ has: page.getByText(choice.text, { exact: true }) }).click(); await page.getByRole('button', { name: 'Cevabı kontrol et' }).click(); await expect(page.locator('.answer-feedback')).toContainText('Doğru! +1 XP');
  // Rival's already-open Arena must update without reload or polling.
  await expect(rival.locator(`[data-student-id="${deniz.studentId}"]`)).toContainText('1 XP'); await expect(rival.locator(`[data-student-id="${deniz.studentId}"] .arena-rank`)).toHaveText('#1');
  await page.getByRole('link', { name: '← Ana ekran' }).click(); await expect(page.getByLabel('Toplam XP')).toHaveText('1 XP'); await expect(page.getByLabel('Sınıf sıran')).toHaveText('#1'); await snapshot('03-home-after');
  await page.getByRole('navigation').getByRole('link', { name: 'Arena', exact: true }).click(); await expect(page.locator('.arena-own')).toContainText('1 XP'); await expect(page.locator('.rival-message')).toContainText('Zirvedesin!'); await expect(page.locator('.arena-rank')).toHaveText(['#1','#1']); await snapshot('12-arena-tied-week');
  await page.getByRole('tab', { name: 'Genel', exact: true }).click(); await expect(page.locator('.arena-own')).toContainText('1 XP'); await snapshot('12-arena-overall');
  await page.getByRole('navigation').getByRole('link', { name: 'Profil', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Deniz Yılmaz' })).toBeVisible(); await expect(page.locator('.profile-stats')).toContainText('%100'); await snapshot('13-profile');
  // A live class move must discard the old class subscription and public rows.
  const next = await teacher.call('createClass', { className: 'YENİ GRUP', defaultGradeLevel: 7 }); await teacher.call('updateStudent', { studentId: deniz.studentId, classId: next.classId, gradeLevel: 6 });
  await page.getByRole('navigation').getByRole('link', { name: 'Arena', exact: true }).click(); await expect(page.getByRole('heading', { name: 'YENİ GRUP' })).toBeVisible(); await expect(page.locator('.arena-row')).toHaveCount(1); await expect(page.locator('.arena-own')).toContainText('1 XP'); await expect(rival.locator(`[data-student-id="${deniz.studentId}"]`)).toHaveCount(0); await snapshot('12-arena-moved');
  await page.getByRole('navigation').getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.locator('.profile-stats')).toContainText('%100');
  await page.getByRole('navigation').getByRole('link', { name: 'Ana', exact: true }).click();
  await page.getByRole('navigation').getByRole('link', { name: 'Profil', exact: true }).click();
  await expect(page.locator('.profile-stats')).toContainText('%100');
  await page.getByRole('button', { name: 'Çıkış yap', exact: true }).click(); await expect(page).toHaveURL('http://127.0.0.1:5173/');
  await rivalContext.close(); await teacher.close(); expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});
