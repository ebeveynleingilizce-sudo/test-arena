import { test, expect } from '@playwright/test';
import { teacherClient, clearLimiter } from '../helpers.mjs';

test('presentation covers empty, single zero XP, long names, many rows, loading and error', async ({ page }, info) => {
  await clearLimiter();
  const teacher = await teacherClient();
  const email = teacher.auth.currentUser!.email!;
  const cls = await teacher.call('createClass', { className: 'DOSTLAR', defaultGradeLevel: 6 });
  const pupil = await teacher.call('createStudent', { classId: cls.classId, firstName: 'Abdülkadir', lastName: 'Uzunsoyadıdenemesi', gradeLevel: 6 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  async function shot(name: string) {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `${process.env.UI_ARTIFACT_ROOT || 'artifacts/milestone-4/after'}/${info.project.name}/${name}.png`, fullPage: true });
  }
  await page.goto('/'); await expect(page.locator('.landing')).toBeVisible(); await shot('01-opening');
  await page.goto('/ogretmen-giris'); await page.getByLabel('E-posta', { exact: true }).fill(email); await page.getByLabel('Şifre', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click();
  await expect(page.getByRole('link', { name: /DOSTLAR/ })).toBeVisible(); await shot('15-teacher-home');
  await page.goto('/ogretmen/siniflar'); await expect(page.getByRole('link', { name: /DOSTLAR/ })).toBeVisible(); await shot('16-classes');
  await page.getByRole('link', { name: /DOSTLAR/ }).click(); await expect(page.locator('.student-row')).toHaveCount(1); await shot('18-single-student');
  const empty = await teacher.call('createClass', { className: 'HENÜZ ÖĞRENCİ YOK', defaultGradeLevel: 6 });
  await page.goto(`/ogretmen/siniflar/${empty.classId}`); await expect(page.locator('.empty-state')).toBeVisible(); await shot('18-empty');
  await page.getByRole('button', { name: 'Çıkış yap' }).click();
  await page.goto('/ogrenci-giris'); await page.getByLabel('Öğrenci kısa kodu').fill(pupil.code); await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByLabel('Toplam XP')).toHaveText('0 XP'); await shot('03-home-long-zero');
  const wide = (info.project.use.viewport?.width || 0) >= 1024;
  expect(await page.locator('.student-nav').evaluate(el => getComputedStyle(el).flexDirection)).toBe(wide ? 'column' : 'row');
  if (!wide) await expect(page.getByRole('link', { name: 'Soru Çöz →' })).toBeInViewport();
  await page.goto('/ogrenci/arena'); await expect(page.locator('.arena-row')).toHaveCount(1); await shot('12-single-zero');
  for (let i = 0; i < 12; i++) await teacher.call('createStudent', { classId: cls.classId, firstName: `Öğrenci${i}`, lastName: 'Uzunsoyadıdenemesi', gradeLevel: 6 });
  await expect(page.locator('.arena-row')).toHaveCount(13); await shot('12-many');
  await page.goto('/ogrenci/profil'); await expect(page.locator('.profile-stats dd').nth(1)).toHaveText('0'); await expect(page.locator('.profile-xp')).toContainText('0'); await shot('13-profile-long-zero');
  await page.route('**/quizCatalog', async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.continue(); });
  await page.goto('/ogrenci/coz'); await expect(page.getByText('Konular hazırlanıyor…')).toBeVisible(); await shot('04-loading');
  await expect(page.getByRole('button', { name: /6. Sınıf/ })).toBeVisible(); await page.unroute('**/quizCatalog');
  await page.route('**/quizCatalog', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Konular şu anda yüklenemiyor.' } }) }));
  await page.reload(); await expect(page.getByRole('alert')).toBeVisible(); await shot('04-error'); await page.unroute('**/quizCatalog');
  await page.route('**/quizCatalog', async route => {
    const response = await route.fetch(); const body = await response.json();
    for (const entry of body.result.entries) entry.topicName = 'Kesirler ve çok uzun konu adı: paydaları eşitleme, karşılaştırma ve günlük yaşam problemleri';
    await route.fulfill({ response, json: body });
  });
  await page.reload(); await page.getByRole('button', { name: /6. Sınıf/ }).click(); await page.getByRole('button', { name: /Matematik/ }).click();
  await expect(page.getByRole('button', { name: /Kesirler ve çok uzun/ })).toBeVisible(); await shot('06-long-topic'); await page.unroute('**/quizCatalog');
  if (!wide) {
    await page.goto('/ogrenci/profil'); await page.getByRole('button', { name: 'Çıkış yap' }).click();
    const original = info.project.use.viewport!; await page.setViewportSize({ width: original.width, height: 420 });
    await page.goto('/ogrenci-giris'); await page.getByLabel('Öğrenci kısa kodu').focus();
    await page.getByRole('button', { name: 'Giriş yap' }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeInViewport(); await shot('02-reduced-height-form');
  }
  await teacher.close(); expect(errors).toEqual([]);
});
