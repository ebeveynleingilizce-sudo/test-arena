import {test,expect} from '@playwright/test';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {teacherClient} from '../helpers.mjs';

// Opt-in: build --base=/test-arena/ into .firebase/pwa-test-dist and preview on 4174.
test.use({serviceWorkers:'allow'});
test('real service worker: subdirectory, explicit update, Firebase session and offline fallback',async({page,context,request},info)=>{
  test.skip(process.env.PWA_PREVIEW_TEST!=='1','Requires isolated local preview build.');
  const base='http://127.0.0.1:4174/test-arena/';
  const workerPath='.firebase/pwa-test-dist/service-worker.js';
  const original=readFileSync(workerPath,'utf8');
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    const manifest=await (await request.get(base+'manifest.webmanifest')).json();
    expect(new URL(manifest.start_url,base+'manifest.webmanifest').href).toBe(base);
    expect(existsSync('.firebase/pwa-test-dist/404.html')).toBe(true);
    for(const icon of manifest.icons)expect((await request.get(base+icon.src)).ok()).toBe(true);
    await page.goto(base);
    await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
    expect(await page.evaluate(async()=> (await navigator.serviceWorker.ready).scope)).toBe(base);
    const teacher=await teacherClient({fixtures:false}),email=teacher.auth.currentUser.email;await teacher.close();
    await page.getByRole('link',{name:/Öğretmen Girişi/}).click();
    await page.getByLabel('E-posta').fill(email);await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');
    await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
    await page.evaluate(()=>localStorage.setItem('pwa-update-check','preserved'));
    writeFileSync(workerPath,original.replace(/test-arena-shell-[a-f0-9]+/,'test-arena-shell-local-update-test'));
    await page.evaluate(async()=>{await (await navigator.serviceWorker.ready).update();});
    await expect(page.getByRole('button',{name:'Yeni sürüme geç'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
    await page.getByRole('button',{name:'Yeni sürüme geç'}).click();
    await expect(page.getByRole('button',{name:'Yeni sürüme geç'})).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
    expect(await page.evaluate(()=>localStorage.getItem('pwa-update-check'))).toBe('preserved');
    const cacheNames=await page.evaluate(()=>caches.keys());expect(cacheNames).toContain('test-arena-shell-local-update-test');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('installed-shell-update.png'),fullPage:true});
    await context.setOffline(true);await page.reload();
    await expect(page.getByRole('heading',{name:'İnternet bağlantısı gerekiyor.'})).toBeVisible();
    await context.setOffline(false);await page.getByRole('button',{name:'Yeniden dene'}).click();
    await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{writeFileSync(workerPath,original);await context.setOffline(false);}
});
