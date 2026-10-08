import { test, expect } from '@playwright/test';
import { client, teacherClient, loginStudent, clearLimiter } from '../helpers.mjs';
import { disposeFixture } from '../classroom-fixture.mjs';
import { demoQuestions } from '../../scripts/demo-questions.mjs';
import { collection, getDocs } from 'firebase/firestore';

const names = ['Mehmet Kayra Aşık','Ali Ak','Ezgi Gür','Ayşe Yılmaz','Ece Demir','Deniz Yılmaz','Zeynep Kaya','Arda Çelik','Elif Şahin','Mert Koç','Selin Aydın','Emir Yıldız','Defne Aslan','Kerem Aksoy','Asya Güneş','Eren Öztürk','Ada Arslan','Burak Tekin','Duru Yalçın','Can Acar','İpek Kılıç','Berk Polat','Yağmur Kurt','Kaan Sezer','Lina Özdemir','Ozan Doğan','Nehir Erdem','Ali Ak','Abdülkadir Uzunsoyadıdenemesi'];
test('30-pupil classroom: single/bulk enrollment, copy, tabs, compact comparison, filters, detail and analytics', async ({ page, context }, info) => {
  test.setTimeout(180000);
  const teacher = await teacherClient(), pupil = client(), errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const consoleErrors:string[]=[];page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
  try {
    const cls = await teacher.call('createClass',{className:'DOSTLAR',defaultGradeLevel:6});
    const other = await teacher.call('createClass',{className:'DİL GRUBU',defaultGradeLevel:7});
    await teacher.call('createStudent',{classId:other.classId,firstName:'Diğer',lastName:'Öğrenci',gradeLevel:7});
    await page.goto('/ogretmen-giris');await page.getByLabel('E-posta',{exact:true}).fill(teacher.auth.currentUser!.email!);await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
    await expect(page.getByTestId('dashboard-solved')).toHaveText('0');
    await page.goto('/ogretmen/siniflar/'+cls.classId);
    await expect(page.getByRole('button',{name:'Öğrenciler',exact:true})).toHaveAttribute('aria-pressed','true');
    const add=page.getByRole('button',{name:'+ Öğrenci ekle'}), bulk=page.getByRole('button',{name:'+ Toplu Öğrenci Ekle'});
    expect((await add.boundingBox())!.y).toBeLessThan(info.project.use.viewport!.height);expect((await bulk.boundingBox())!.y).toBeLessThan(info.project.use.viewport!.height);
    await expect(page.locator('.analytics-metrics')).toHaveCount(0);
    await add.click();await page.getByLabel('Ad',{exact:true}).fill('Mehmet');await page.getByLabel('Soyad').fill('Kaya');await page.getByRole('dialog').getByRole('button',{name:'Öğrenci ekle',exact:true}).click();await expect(page.locator('.student-row')).toHaveCount(1);
    await bulk.click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('DOSTLAR · 6. Sınıf');await expect(dialog.locator('select')).toHaveCount(0);
    await dialog.getByLabel('Öğrenci adları').fill(Array(51).fill('Ali Ak').join('\n'));await expect(dialog.getByRole('button',{name:'Öğrencileri ekle'})).toBeDisabled();
    await dialog.getByLabel('Öğrenci adları').fill('\n'+names.join('\n\n')+'\n'+'A'.repeat(81));
    // Server commits, response is lost: retry must return the same records/codes.
    await page.route('**/bulkCreateStudents', async route=>{await route.fetch();await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({error:{status:'UNAVAILABLE',message:'Geçici bağlantı hatası'}})});});
    await dialog.getByRole('button',{name:'Öğrencileri ekle'}).click();await expect(dialog.getByRole('alert')).toContainText('çift kayıt oluşturmaz');await page.unroute('**/bulkCreateStudents');
    await dialog.getByRole('button',{name:'Aynı işlemi yeniden dene'}).click();await expect(dialog).toContainText('29 öğrenci eklendi · 1 öğrenci eklenemedi');await expect(dialog.locator('.bulk-results tbody tr')).toHaveCount(30);await expect(dialog.locator('.bulk-failure')).toBeVisible();
    const codes=await dialog.locator('.bulk-results b').allTextContents();expect(new Set(codes).size).toBe(29);
    await context.grantPermissions(['clipboard-read','clipboard-write']);await dialog.getByRole('button',{name:'Kodları Kopyala'}).click();const clipboard=await page.evaluate(()=>navigator.clipboard.readText());expect(clipboard.split('\n')).toHaveLength(29);expect(clipboard).toContain('Mehmet Kayra Aşık — '+codes[0]);expect(clipboard).not.toContain('A'.repeat(81));
    async function shot(name:string){await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`artifacts/classroom-ux/${info.project.name}/${name}.png`,fullPage:true});}
    await shot('01-bulk-results');await dialog.getByRole('button',{name:'Kapat'}).click();await expect(page.locator('.student-row')).toHaveCount(30);await expect(page.locator('.class-management-heading')).toContainText('30 öğrenci');await shot('02-management');
    const students=await getDocs(collection(teacher.db,'teachers',teacher.auth.currentUser!.uid,'students'));expect(students.docs.filter(d=>d.data().classId===cls.classId)).toHaveLength(30);expect(new Set(students.docs.map(d=>d.id)).size).toBe(31);expect(students.docs.filter(d=>d.data().classId===cls.classId).every(d=>d.data().gradeLevel===6)).toBe(true);
    await clearLimiter();await loginStudent(pupil,codes[0]);const session=await pupil.call('startTest',{gradeLevel:6,subject:'matematik',topic:'kesirler',questionCount:10});const q=session.questions[0], key=demoQuestions.find(d=>d.question.questionId===q.questionId)!.answer.correctChoiceId;
    await pupil.call('submitAnswer',{testSessionId:session.testSessionId,questionId:q.questionId,selectedChoiceId:key});
    const before=await teacher.call('teacherAnalytics',{classId:cls.classId});expect(before.totals.overall).toEqual({solved:1,correct:1,wrong:0});expect(before.totals.academicXP).toBe(1);
    await page.getByRole('button',{name:'Genel Bakış',exact:true}).click();await expect(page.locator('.analytics-metrics')).toContainText('%100');await expect(page.locator('.analytics-table tbody tr')).toHaveCount(30);await shot('03-overview');
    await page.getByRole('button',{name:'Konu Analizi',exact:true}).click();await expect(page.locator('.dimension-list')).toContainText('1 soru');await page.getByRole('button',{name:'Konular',exact:true}).click();await expect(page.locator('.dimension-list')).toContainText('Kesirler');await shot('04-topics');
    await page.goto('/ogretmen/ogrenciler');await expect(page.locator('.analytics-table tbody tr')).toHaveCount(31);await page.getByLabel('Sınıf filtresi').selectOption(cls.classId);await expect(page.locator('.analytics-table tbody tr')).toHaveCount(30);await page.getByLabel('Sıralama').selectOption('most');await expect(page.locator('.analytics-table tbody tr').first()).toContainText('Mehmet Kayra Aşık');
    const rows=page.locator('.analytics-table tbody tr');
    if(info.project.use.viewport!.width<1024){expect((await rows.first().boundingBox())!.height).toBeLessThanOrEqual(150);await expect(page.locator('.analytics-table thead')).toBeHidden();await expect(rows.first().locator('.compact-rank')).toHaveText('#1');}else{await expect(page.locator('.analytics-table thead th')).toHaveCount(9);await expect(page.locator('.analytics-table thead')).toBeVisible();}
    if(info.project.use.viewport!.width<600){const a=await page.getByLabel('Sınıf filtresi').boundingBox(),b=await page.getByLabel('Sıralama').boundingBox();expect(b!.y).toBeGreaterThan(a!.y+a!.height);}
    await shot('05-comparison');await page.evaluate(()=>{const row=document.querySelector('.analytics-table tbody tr')!;window.scrollTo(0,row.getBoundingClientRect().top+scrollY-24);});if(info.project.use.viewport!.width<600){const visible=await rows.evaluateAll(rs=>rs.filter(r=>r.getBoundingClientRect().top>=0&&r.getBoundingClientRect().bottom<=innerHeight).length);expect(visible).toBeGreaterThanOrEqual(4);}await page.screenshot({path:`artifacts/classroom-ux/${info.project.name}/06-comparison-viewport.png`});
    await page.getByLabel('Sıralama').selectOption('least');await expect(rows.first()).not.toContainText('Mehmet Kayra Aşık');await expect(rows.first()).toContainText('Henüz veri yok');await page.getByLabel('Sınıf filtresi').selectOption(other.classId);await expect(rows).toHaveCount(1);await page.getByLabel('Sınıf filtresi').selectOption(cls.classId);await page.getByLabel('Sıralama').selectOption('xp');await expect(rows.first()).toContainText('Mehmet Kayra Aşık');
    await page.getByRole('button',{name:'Mehmet Kayra Aşık',exact:true}).click();await expect(page.getByRole('heading',{name:'Mehmet Kayra Aşık',exact:true})).toBeVisible();await expect(page.locator('.analytics-metrics')).toContainText('%100');await shot('07-student-detail');
    const after=await teacher.call('teacherAnalytics',{classId:cls.classId});expect(after.totals).toEqual(before.totals);expect(after.dimensions).toEqual(before.dimensions);expect(errors).toEqual([]);expect(consoleErrors).toEqual([]);
  } finally {await page.close();await pupil.close();await disposeFixture(teacher);}
});
