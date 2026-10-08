import { test, expect } from '@playwright/test';
import { loadCurriculumBank } from '../../scripts/curriculum-bank.mjs';
import { teacherClient, clearLimiter } from '../helpers.mjs';
import { disposeFixture } from '../classroom-fixture.mjs';

const bank = loadCurriculumBank();
const unit = bank.curricula[0].subjects.find(s => s.id === 'matematik')!.units[0];
const records = new Map(bank.records.map(r => [r.question.questionId, r]));

test('real unit-1 bank: five Test 1 packs, all 50 questions, visuals and safe XP', async ({ page }, info) => {
  test.setTimeout(180000);
  await clearLimiter();
  const owner = await teacherClient({ fixtures: false }), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    const cls = await owner.call('createClass', { className: 'İÇERİK DOĞRULAMA', defaultGradeLevel: 2 });
    const student = await owner.call('createStudent', { classId: cls.classId, firstName: 'İçerik', lastName: 'Kontrol', gradeLevel: 2 });
    await page.goto('/ogrenci-giris');
    await page.getByLabel('Öğrenci kısa kodu').fill(student.code);
    await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Merhaba, İçerik.' })).toBeVisible();
    const choose = (name: string) => page.locator('.selection-list button').filter({ has: page.getByText(name, { exact: true }) });
    async function start(topic: typeof unit.topics[number]) {
      await page.goto('/ogrenci/coz');
      await choose('Matematik').click();
      await choose(unit.displayName).click();
      await expect(page.getByRole('heading', { name: 'Konunu seç' })).toBeVisible();
      await expect(page.locator('.selection-list button')).toHaveCount(5);
      await choose(topic.name).click();
      await expect(page.locator('.test-pack-list button')).toHaveCount(1);
      await expect(choose('Test 1')).toContainText('10 soru');
      await choose('Test 1').click();
    }
    let wrongId = '';
    const seen = new Set<string>(), captured = new Set<string>();
    for (const topic of unit.topics) {
      await start(topic);
      for (let i = 0; i < 10; i++) {
        const heading = page.locator('[data-question-id]');
        await expect(heading).toBeVisible();
        const id = (await heading.getAttribute('data-question-id'))!, r = records.get(id)!;
        expect(topic.questionIds).toContain(id);expect(seen.has(id)).toBe(false);seen.add(id);
        await expect(heading).toHaveText(r.question.questionText);
        await expect(page.locator('.answer-choices button')).toHaveCount(3);
        for (const choice of r.question.choices) {
          const button = page.locator(`.answer-choices button[data-choice-id="${choice.choiceId}"]`);
          if (choice.visual) {
            const visual = button.locator('[role="img"]');
            await expect(visual).toHaveAttribute('aria-label', choice.visual.alt);
            await expect(button.locator('svg')).toBeVisible();
            const box = await visual.boundingBox();expect(box!.width).toBeGreaterThan(50);expect(box!.height).toBeGreaterThan(40);
          } else await expect(button).toContainText(choice.text);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('.answer-choices').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        const kind = r.question.choices.some(c => c.visual?.kind === 'container') ? 'container' :
          r.question.choices.some(c => c.visual?.kind === 'geometry' && ['triangle','square','rectangle','circle'].includes(c.visual.shape)) ? 'shape' :
          r.question.choices.some(c => c.visual) ? 'solid' : 'text';
        if (!captured.has(kind)) {
          captured.add(kind);
          await page.screenshot({ path: `artifacts/math-unit1-import/${info.project.name}/${kind}.png`, fullPage: true });
        }
        const wrong = seen.size === 1;
        if (wrong) wrongId = id;
        const choiceId = wrong ? r.question.choices.find(c => c.choiceId !== r.answer.correctOptionId)!.choiceId : r.answer.correctOptionId;
        await page.locator(`.answer-choices button[data-choice-id="${choiceId}"]`).click();
        await page.getByRole('button', { name: 'Cevabı kontrol et', exact: true }).click();
        await expect(page.locator('.answer-feedback')).toContainText(wrong ? 'Yanlış · +0 XP' : '+1 XP');
        await page.getByRole('button', { name: /^(Sonraki soru →|Sonuçları gör)$/ }).click();
      }
      await expect(page.locator('.result-xp')).toHaveText(topic === unit.topics[0] ? '+9 XP' : '+10 XP');
    }
    expect(seen.size).toBe(50);expect([...captured].sort()).toEqual(['container','shape','solid','text']);
    // Same real package: previously wrong question earns its first XP; awarded ones earn zero.
    await start(unit.topics[0]);
    for (let i = 0; i < 10; i++) {
      const heading = page.locator('[data-question-id]');await expect(heading).toBeVisible();
      const id = (await heading.getAttribute('data-question-id'))!, r = records.get(id)!;
      await page.locator(`.answer-choices button[data-choice-id="${r.answer.correctOptionId}"]`).click();
      await page.getByRole('button', { name: 'Cevabı kontrol et', exact: true }).click();
      await expect(page.locator('.answer-feedback')).toContainText(id === wrongId ? '+1 XP' : '+0 XP');
      await page.getByRole('button', { name: /^(Sonraki soru →|Sonuçları gör)$/ }).click();
    }
    await expect(page.locator('.result-xp')).toHaveText('+1 XP');
    const report = await owner.call('teacherAnalytics', { studentId: student.studentId });
    expect(report.totals.overall).toEqual({ solved: 60, correct: 59, wrong: 1 });expect(report.totals.academicXP).toBe(50);
    expect(errors).toEqual([]);
  } finally { await page.close();await disposeFixture(owner); }
});
