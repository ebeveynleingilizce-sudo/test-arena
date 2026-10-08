import { test, expect } from '@playwright/test';
import { clearLimiter } from '../helpers.mjs';

test.beforeEach(async () => { await clearLimiter(); });
test('role selection and both login screens fit the viewport', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  for (const path of ['/', '/ogrenci-giris', '/ogretmen-giris']) {
    await page.goto(path); await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.loading')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(path === '/' ? 'role-selection.png' : path.slice(1) + '.png'), fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('teacher creates a class and student; clean student enters only a code; rotation and removal revoke live access', async ({ page, browser }, info) => {
  const errors: string[] = [], consoleErrors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  await page.goto('/ogretmen-giris');
  await page.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  await page.getByLabel('E-posta', { exact: true }).fill(`e2e-${info.project.name}-${Date.now()}@example.invalid`);
  await page.getByLabel('Şifre', { exact: true }).fill('test-only-password');
  await page.getByRole('button', { name: 'Hesap oluştur', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Merhaba, öğretmenim.' })).toBeVisible();
  await page.getByRole('button', { name: '+ Sınıf oluştur' }).click();
  await page.getByLabel('Sınıf / Grup adı').fill('DOSTLAR');
  await page.getByLabel('Varsayılan kademe').selectOption('6');
  await page.getByRole('dialog').getByRole('button', { name: 'Sınıf oluştur', exact: true }).click();
  await page.getByRole('link', { name: /DOSTLAR/ }).click();
  await page.getByRole('button', { name: '+ Öğrenci ekle' }).click();
  await page.getByLabel('Ad', { exact: true }).fill('Ali'); await page.getByLabel('Soyad').fill('Yılmaz');
  await expect(page.getByLabel('Kademe', { exact: true })).toHaveValue('6');
  await page.getByRole('dialog').getByRole('button', { name: 'Öğrenci ekle', exact: true }).click();
  const row = page.locator('.student-row').filter({ hasText: 'Ali Yılmaz' });
  await expect(row).toBeVisible(); const code = await row.locator('.student-code b').innerText();
  expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
  await expect(row.locator('a')).toHaveCount(0); await expect(page.getByText('Öğrenci bağlantısı', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('teacher-roster.png'), fullPage: true });
  const context = await browser.newContext({ viewport: info.project.use.viewport });
  const student = await context.newPage(); student.on('pageerror', e => errors.push(e.message));
  await student.goto('http://127.0.0.1:5173/ogrenci-giris');
  await expect(student.locator('input')).toHaveCount(1);
  await student.getByLabel('Öğrenci kısa kodu').fill(code); await student.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(student.getByRole('heading', { name: 'Merhaba, Ali.' })).toBeVisible();
  await expect(student.getByText('DOSTLAR', { exact: true })).toBeVisible();
  await student.reload(); await expect(student.getByRole('heading', { name: 'Merhaba, Ali.' })).toBeVisible();
  expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await student.screenshot({ path: info.outputPath('student-welcome.png'), fullPage: true });
  await row.getByRole('button', { name: 'Kodu yenile' }).click();
  await expect(row.locator('.student-code b')).not.toHaveText(code);
  await expect(student.getByRole('heading', { name: 'Hazır mısın?' })).toBeVisible();
  await student.getByLabel('Öğrenci kısa kodu').fill(code); await student.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(student.getByRole('alert')).toContainText('Kod geçersiz');
  const nextCode = await row.locator('.student-code b').innerText();
  await student.getByLabel('Öğrenci kısa kodu').fill(nextCode); await student.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(student.getByRole('heading', { name: 'Merhaba, Ali.' })).toBeVisible();
  await row.getByRole('button', { name: 'Kaldır', exact: true }).click();
  await page.getByRole('button', { name: 'Kaldırmayı onayla' }).click();
  await expect(row).toHaveCount(0); await expect(student.getByRole('heading', { name: 'Hazır mısın?' })).toBeVisible();
  await context.close(); expect(errors).toEqual([]); expect(consoleErrors).toEqual([]);
});
