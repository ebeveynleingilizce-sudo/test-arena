import { test, expect } from '@playwright/test';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { teacherClient, client, loginStudent, clearLimiter } from '../helpers.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';

// Same real emulator snapshots are replayed for visual comparison. Functional
// quiz/XP tests remain separate and make real server calls on every run.
const root = 'artifacts/milestone-4.1';
const phase = process.env.COMPOSITION_PHASE === 'before' ? 'before' : 'after';
test('desktop composition and mobile lock with stable real-data snapshots', async ({ page }, info) => {
  await clearLimiter(); mkdirSync(root, { recursive: true });
  const file = `${root}/visual-fixture.json`;
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  let fixtureIsLive = false;
  if (previous) {
    const probe = client();
    try { await loginStudent(probe, previous.code); fixtureIsLive = true; }
    catch (e) { if ((e as { code?: string }).code !== 'functions/unauthenticated') throw e; }
    finally { await probe.close(); }
  }
  if (!fixtureIsLive) {
    const teacher = await teacherClient();
    const cls = await teacher.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
    const pupil = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Deniz', lastName: 'Yılmaz', gradeLevel: 6 });
    const rival = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Mehmet', lastName: 'Kaya', gradeLevel: 6 });
    for (let i = 0; i < 5; i++) await teacher.call('createStudent', { classId: cls.classId, firstName: ['Ece', 'Kerem', 'Selin', 'Mert', 'Zeynep'][i], lastName: 'Arena', gradeLevel: 6 });
    const student = client(); await loginStudent(student, pupil.code);
    const quiz = await student.call('startTest', { gradeLevel: 6, subject: 'matematik', topic: 'kesirler', questionCount: 10 });
    const answers = [];
    for (let i = 0; i < quiz.questions.length; i++) {
      const q = quiz.questions[i]; const fixture = demoQuestions.find(e => e.question.questionId === q.questionId)!;
      const choice = q.choices.find((c: { choiceId: string }) => i === 0 ? c.choiceId !== fixture.answer.correctChoiceId : c.choiceId === fixture.answer.correctChoiceId)!;
      answers.push(await student.call('submitAnswer', { testSessionId: quiz.testSessionId, questionId: q.questionId, selectedChoiceId: choice.choiceId }));
    }
    await student.close(); const opponent = client(); await loginStudent(opponent, rival.code);
    const rivalQuiz = await opponent.call('startTest', { gradeLevel: 6, subject: 'matematik', topic: 'kesirler', questionCount: 10 });
    for (const q of rivalQuiz.questions) {
      const fixture = demoQuestions.find(e => e.question.questionId === q.questionId)!;
      await opponent.call('submitAnswer', { testSessionId: rivalQuiz.testSessionId, questionId: q.questionId, selectedChoiceId: fixture.answer.correctChoiceId });
    }
    await opponent.close(); await teacher.close();
    // An emulator restart loses accounts. Restore the same visible XP/summary,
    // while retaining the original recorded quiz for before/after comparison.
    writeFileSync(file, JSON.stringify({ code: pupil.code, quiz: previous?.quiz || quiz, answers: previous?.answers || answers }, null, 2));
  }
  const fixture = JSON.parse(readFileSync(file, 'utf8'));
  const errors: string[] = [], consoleErrors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const boxes: Record<string, unknown> = {};
  const volatileRegions: Record<string, unknown> = {};
  const dir = `${root}/${phase}/${info.project.name}`; mkdirSync(dir, { recursive: true });
  async function shot(name: string, selector: string) {
    await page.evaluate(() => document.fonts.ready); await page.mouse.move(0, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    boxes[name] = await page.locator(selector).boundingBox();
    if (name.startsWith('12-arena')) volatileRegions[name] = await page.locator('.arena-row:nth-child(n+3) .arena-avatar,.arena-row:nth-child(n+3) .arena-name').evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }));
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.goto('/ogrenci-giris'); await page.getByLabel('Öğrenci kısa kodu').fill(fixture.code); await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByLabel('Toplam XP')).toHaveText('9 XP'); await shot('03-home', '.home-columns');
  await page.goto('/ogrenci/arena'); await expect(page.locator('.arena-row')).toHaveCount(7); await expect(page.locator('.rival-message')).toContainText('2 XP'); await shot('12-arena-weekly', '.arena-board');
  await page.getByRole('tab', { name: 'Genel' }).click(); await shot('12-arena-overall', '.arena-board');
  await page.goto('/ogrenci/profil'); await expect(page.locator('.profile-stats dd').nth(1)).toHaveText('10'); await expect(page.locator('.profile-xp')).toContainText('9'); await expect(page.locator('.profile-stats dd').first()).toHaveText('#2'); await shot('13-profile', '.student-profile');
  await page.route('**/startTest', route => route.fulfill({ json: { result: fixture.quiz } }));
  await page.route('**/getTestSession', route => route.fulfill({ json: { result: fixture.quiz } }));
  let answerIndex = 0;
  await page.route('**/submitAnswer', route => route.fulfill({ json: { result: fixture.answers[answerIndex++] } }));
  await page.goto('/ogrenci/coz'); await expect(page.getByRole('button', { name: /6. Sınıf/ })).toBeVisible(); await shot('04-grade', '.quiz-shell');
  await page.getByRole('button', { name: /6. Sınıf/ }).click(); await shot('05-subject', '.quiz-shell');
  await page.getByRole('button', { name: /Matematik/ }).click(); await shot('06-topic', '.quiz-shell');
  await page.getByRole('button', { name: /Kesirler/ }).click(); await shot('07-count', '.quiz-shell');
  await page.getByRole('button', { name: 'Teste başla →' }).click();
  for (let i = 0; i < 10; i++) {
    await expect(page.locator('[data-question-id]')).toBeVisible(); if (!i) await shot('08-question', '.quiz-shell');
    const choice = fixture.quiz.questions[i].choices.find((c: { choiceId: string }) => c.choiceId === fixture.answers[i].answer.selectedChoiceId);
    await page.locator('.answer-choices button').filter({ has: page.getByText(choice.text, { exact: true }) }).click(); await page.getByRole('button', { name: 'Cevabı kontrol et' }).click();
    await expect(page.locator('.answer-feedback')).toBeVisible(); if (i < 2) await shot(i ? '09-correct' : '10-wrong', '.quiz-shell');
    await page.getByRole('button', { name: i === 9 ? 'Sonuçları gör' : 'Sonraki soru →' }).click();
  }
  await expect(page.locator('.result-xp')).toHaveText('+9 XP'); await shot('11-result', '.quiz-shell');
  writeFileSync(`${dir}/layout-boxes.json`, JSON.stringify(boxes, null, 2));
  writeFileSync(`${dir}/volatile-regions.json`, JSON.stringify(volatileRegions, null, 2));
  if (phase === 'after' && (info.project.name === 'desktop' || info.project.name === 'wide')) {
    const available = info.project.use.viewport!.width - 210;
    for (const name of ['03-home', '04-grade', '13-profile']) {
      expect((boxes[name] as { width: number }).width).toBeGreaterThan(available * .65);
    }
    await page.goto('/ogrenci/profil');
    await expect(page.locator('.profile-stats dd').first()).toHaveText('#2');
    const identity = await page.getByRole('heading', { name: 'Deniz Yılmaz' }).boundingBox();
    const stats = await page.locator('.profile-stats').boundingBox();
    expect(stats!.x).toBeGreaterThan(identity!.x + identity!.width);
  }
  if (phase === 'after' && existsSync(`${root}/before/${info.project.name}/layout-boxes.json`) && (info.project.name === 'phone' || info.project.name === 'tablet')) {
    const before = JSON.parse(readFileSync(`${root}/before/${info.project.name}/layout-boxes.json`, 'utf8'));
    expect(boxes).toEqual(before);
  }
  expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});
