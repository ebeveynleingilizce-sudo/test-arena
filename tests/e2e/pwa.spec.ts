import {test,expect} from '@playwright/test';
import {teacherClient} from '../helpers.mjs';

test('native prompt is used only when offered; installed event hides the CTA',async({page})=>{
  await page.goto('/');await expect(page.getByRole('button',{name:'Uygulamayı İndir'})).toBeVisible();
  await page.evaluate(()=>{
    const event=new Event('beforeinstallprompt',{cancelable:true});
    Object.assign(event,{prompt:async()=>{document.body.dataset.promptCalled='true';window.dispatchEvent(new Event('appinstalled'));},userChoice:Promise.resolve({outcome:'accepted'})});
    window.dispatchEvent(event);
  });
  await page.getByRole('button',{name:'Uygulamayı İndir'}).click();
  await expect(page.locator('body')).toHaveAttribute('data-prompt-called','true');
  await expect(page.getByRole('button',{name:'Uygulamayı İndir'})).toHaveCount(0);
});

for(const [device,ua,title] of [
  ['Windows Chrome','Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36','Bilgisayara yükle'],
  ['Windows Edge','Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Edg/130.0','Bilgisayara yükle'],
  ['Android Chrome','Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36','Android’e yükle'],
  ['iPhone Safari','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1','iPhone / iPad’e yükle'],
  ['iPad Safari','Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1','iPhone / iPad’e yükle'],
  ['iOS Chrome','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/130.0 Mobile Safari/604.1','iPhone / iPad’e yükle'],
  ['unsupported browser','Mozilla/5.0 (Windows NT 10.0) Firefox/130.0','Tarayıcında kurulum']
])test(`instruction fallback: ${device} (UA simulation)`,async({browser},info)=>{
  const context=await browser.newContext({userAgent:ua,viewport:info.project.use.viewport as {width:number;height:number}});
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:5173/');await page.getByRole('button',{name:'Uygulamayı İndir'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('heading',{name:title})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('install-instructions.png'),fullPage:true});
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('standalone simulation hides install and Firebase login persists across reload',async({page})=>{
  await page.addInitScript(()=>{
    const original=window.matchMedia.bind(window);
    window.matchMedia=query=>{const result=original(query);if(query==='(display-mode: standalone)')Object.defineProperty(result,'matches',{value:true});return result;};
  });
  const teacher=await teacherClient({fixtures:false}),email=teacher.auth.currentUser.email;
  await teacher.close();
  await page.goto('/ogretmen-giris');await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Uygulamayı İndir'})).toHaveCount(0);
  await page.reload();await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
});
