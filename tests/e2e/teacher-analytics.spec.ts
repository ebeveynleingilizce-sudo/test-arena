import { test, expect } from '@playwright/test';
import { clearLimiter, teacherClient, enableFixtureTeacher } from '../helpers.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';

test('teacher dashboard shows canonical practice, class, student and subject/topic analytics', async ({ page, browser }, info) => {
  test.setTimeout(120000);
  await clearLimiter();
  const errors: string[] = [], consoleErrors: string[] = [];
  const watch = (p: typeof page) => { p.on('pageerror',e=>errors.push(e.message)); p.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());}); };
  watch(page);
  const email = `analytics-${info.project.name}-${Date.now()}@example.invalid`;
  await page.goto('/ogretmen-giris'); await page.getByRole('button',{name:'Hesap oluştur',exact:true}).click();
  await page.getByLabel('E-posta',{exact:true}).fill(email); await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');
  await page.getByRole('button',{name:'Hesap oluştur',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
  await enableFixtureTeacher(email);
  async function shot(name: string) {
    await page.evaluate(()=>document.fonts.ready);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:`artifacts/milestone-5/${info.project.name}/${name}.png`,fullPage:true});
  }
  await expect(page.getByTestId('dashboard-solved')).toHaveText('0'); await expect(page.getByTestId('dashboard-accuracy')).toHaveText('Henüz veri yok');
  await shot('01-empty-dashboard');
  await page.getByRole('button',{name:'+ Sınıf oluştur'}).click(); await page.getByLabel('Sınıf / Grup adı').fill('DOSTLAR');
  await page.getByRole('dialog').getByRole('button',{name:'Sınıf oluştur',exact:true}).click();
  await page.locator('.analytics-classes').getByRole('link',{name:/DOSTLAR/}).click();
  const codes: Record<string,string> = {};
  for (const firstName of ['Ali','Ece','Deniz']) {
    await page.getByRole('button',{name:'+ Öğrenci ekle'}).click(); await page.getByLabel('Ad',{exact:true}).fill(firstName); await page.getByLabel('Soyad').fill('Yılmaz');
    await page.getByRole('dialog').getByRole('button',{name:'Öğrenci ekle',exact:true}).click();
    const row=page.locator('.student-row').filter({hasText:firstName+' Yılmaz'}); await expect(row.locator('.student-code b')).toHaveText(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    codes[firstName]=await row.locator('.student-code b').innerText();
  }
  const classUrl=page.url();
  await page.getByRole('button',{name:'Çıkış yap',exact:true}).click();
  for (const [name, count, correctCount] of [['Ali',10,7],['Ece',3,3],['Deniz',5,2]] as const) {
    const context=await browser.newContext({viewport:info.project.use.viewport}), student=await context.newPage();watch(student);
    await student.goto('http://127.0.0.1:5173/ogrenci-giris');await student.getByLabel('Öğrenci kısa kodu').fill(codes[name]);await student.getByRole('button',{name:'Giriş yap'}).click();
    await expect(student.getByRole('heading',{name:`Merhaba, ${name}.`})).toBeVisible();
    await student.getByRole('link',{name:'Soru Çöz →'}).click();await student.getByRole('button',{name:/6. Sınıf/}).click();await student.getByRole('button',{name:/Matematik/}).click();await student.getByRole('button',{name:/Kesirler/}).click();await student.getByRole('button',{name:'Teste başla →'}).click();
    for(let i=0;i<count;i++){
      const q=student.locator('[data-question-id]');await expect(q).toBeVisible();const id=await q.getAttribute('data-question-id'),fixture=demoQuestions.find(e=>e.question.questionId===id)!;
      const choice=fixture.question.choices.find(c=>i<correctCount?c.choiceId===fixture.answer.correctChoiceId:c.choiceId!==fixture.answer.correctChoiceId)!;
      await student.locator('.answer-choices button').filter({has:student.getByText(choice.text,{exact:true})}).click();await student.getByRole('button',{name:'Cevabı kontrol et'}).click();await expect(student.locator('.answer-feedback')).toBeVisible();
      await student.getByRole('button',{name:i===9?'Sonuçları gör':'Sonraki soru →'}).click();
    }
    await context.close();
  }
  await page.goto('/ogretmen-giris'); await page.getByLabel('E-posta',{exact:true}).fill(email);await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
  await expect(page.getByTestId('dashboard-solved')).toHaveText('18');await expect(page.getByTestId('dashboard-accuracy')).toHaveText('%67');
  await expect(page.locator('.analytics-leader-grid section').first()).toContainText('Ali Yılmaz');await expect(page.locator('.analytics-leader-grid section').first()).toContainText('10 soru');
  await expect(page.locator('.analytics-classes')).toContainText('18 soru'); await shot('02-dashboard-general');
  await page.getByRole('button',{name:'Bu hafta',exact:true}).click();await expect(page.getByTestId('dashboard-solved')).toHaveText('18');await expect(page.locator('.analytics-leader-grid section').last()).toContainText('Sınıfların Arena liderleri · Bu hafta');await shot('03-dashboard-weekly');
  await page.getByLabel('Sıralama',{exact:true}).selectOption('high');await expect(page.locator('.analytics-table tbody tr').first()).toContainText('Ece Yılmaz');await expect(page.locator('.analytics-table tbody tr').first()).toContainText('3');
  await page.getByLabel('Sıralama',{exact:true}).selectOption('least');await expect(page.locator('.analytics-table tbody tr').first()).toContainText('Ece Yılmaz');
  await page.locator('.analytics-classes').getByRole('link',{name:/DOSTLAR/}).click();await page.getByRole('button',{name:'Genel Bakış',exact:true}).click();await expect(page.locator('.analytics-metrics')).toContainText('18');await shot('04-class-general');
  await expect(page.locator('.analytics-table tbody tr')).toHaveCount(3);await shot('05-class-students');
  await page.getByRole('button',{name:'Konu Analizi',exact:true}).click();await page.getByRole('button',{name:'Dersler',exact:true}).click();await expect(page.locator('.dimension-list')).toContainText('Matematik');await expect(page.locator('.dimension-list')).toContainText('18 soru');await shot('06-class-subjects');
  await page.getByRole('button',{name:'Konular',exact:true}).click();await expect(page.locator('.dimension-list')).toContainText('Kesirler');await expect(page.locator('.dimension-list')).toContainText('12 doğru · 6 yanlış');await shot('07-class-topics');
  await page.getByRole('button',{name:'Genel Bakış',exact:true}).click();await page.getByRole('button',{name:'Ali Yılmaz',exact:true}).click();await expect(page.getByRole('heading',{name:'Ali Yılmaz',exact:true})).toBeVisible();
  await expect(page.locator('.analytics-metrics')).toContainText('%70');await expect(page.locator('.dimension-list').first()).toContainText('10 soru');await shot('08-student-general');
  await page.getByRole('button',{name:'Konular',exact:true}).click();await expect(page.locator('.dimension-list')).toContainText('7 doğru · 3 yanlış');await shot('09-student-topics');
  // Add another class and a no-data student through the same management UI.
  await page.goto('/ogretmen');await page.getByRole('button',{name:'+ Sınıf oluştur'}).click();await page.getByLabel('Sınıf / Grup adı').fill('DİL GRUBU');await page.getByRole('dialog').getByRole('button',{name:'Sınıf oluştur',exact:true}).click();await page.getByRole('link',{name:/DİL GRUBU/}).click();
  await page.getByRole('button',{name:'+ Öğrenci ekle'}).click();await page.getByLabel('Ad',{exact:true}).fill('Mert');await page.getByLabel('Soyad').fill('Uzunsoyadıdenemesi');await page.getByRole('dialog').getByRole('button',{name:'Öğrenci ekle',exact:true}).click();
  await page.goto('/ogretmen/ogrenciler');await expect(page.locator('.analytics-table tbody tr')).toHaveCount(4);await page.getByLabel('Sınıf filtresi').selectOption({label:'DİL GRUBU'});await expect(page.locator('.analytics-table tbody tr')).toHaveCount(1);await expect(page.locator('.analytics-table')).toContainText('Henüz veri yok');await shot('10-filter-no-data');
  await page.getByRole('button',{name:'Mert Uzunsoyadıdenemesi'}).click();await expect(page.locator('.analytics-metrics')).toContainText('Henüz veri yok');await shot('11-student-no-data');
  await page.goto(classUrl);await expect(page.locator('.student-row')).toHaveCount(3);
  expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
});

test('teacher analytics handles loading, error, retry and long real names without overflow', async ({ page }, info) => {
  const teacher=await teacherClient(), email=teacher.auth.currentUser!.email!;
  try {
    const cls=await teacher.call('createClass',{className:'DOSTLAR — Uzun grup adıyla öğretmen performans incelemesi',defaultGradeLevel:6});
    await teacher.call('createStudent',{classId:cls.classId,firstName:'Abdülkadir',lastName:'Uzunsoyadıdenemesi',gradeLevel:5});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    async function shot(name:string){await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/milestone-5/${info.project.name}/${name}.png`,fullPage:true});}
    await page.route('**/teacherAnalytics',async route=>{await new Promise(resolve=>setTimeout(resolve,1200));await route.continue();});
    await page.goto('/ogretmen-giris');await page.getByLabel('E-posta',{exact:true}).fill(email);await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
    await expect(page.getByText('Performans özeti hazırlanıyor…')).toBeVisible();await shot('12-loading');await expect(page.locator('.analytics-classes')).toBeVisible();await page.unroute('**/teacherAnalytics');
    await page.route('**/teacherAnalytics',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:{status:'UNAVAILABLE',message:'Rapor şu anda yüklenemiyor.'}})}));
    await page.getByRole('button',{name:'Verileri yenile'}).click();await expect(page.getByRole('alert')).toContainText('İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.');await expect(page.getByTestId('dashboard-solved')).toHaveCount(0);await shot('13-error');await page.unroute('**/teacherAnalytics');
    await page.getByRole('button',{name:'Yeniden dene'}).click();await expect(page.getByTestId('dashboard-solved')).toHaveText('0');await shot('14-long-class');
    await page.getByRole('button',{name:'Abdülkadir Uzunsoyadıdenemesi'}).click();await expect(page.getByRole('heading',{name:'Abdülkadir Uzunsoyadıdenemesi'})).toBeVisible();await shot('15-long-student');expect(errors).toEqual([]);
  } finally {await teacher.close();}
});
