import {test,expect} from '@playwright/test';
import {initializeApp,getApps} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';

for(const legacy of [false,true])test(`teacher shell survives login and resize (${legacy?'legacy units':'modern units'})`,async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 if(legacy)await page.route('**/src/ui/*.css',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:(await response.text()).replace(/(?:min-|max-)?height\s*:[^;{}]*\b\d+(?:s|d|l)vh[^;{}]*(?:;|(?=\}))/g,'')});
 });
 const covered=async(selector:string)=>{
  await expect(page.locator(selector)).toBeVisible();
  expect(await page.locator(selector).evaluate(e=>e.getBoundingClientRect().height>=innerHeight-1)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 };
 await page.goto('/');await covered('.landing');
 await page.getByRole('link',{name:/Öğretmen Girişi/}).click();await covered('.teacher-auth');
 if(!process.env.FIREBASE_AUTH_EMULATOR_HOST||!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local emulators required');
 const app=getApps()[0]||initializeApp({projectId:'demo-test-arena-spark-prototype'});
 const uid=`viewport-${Date.now()}`,email=`${uid}@example.invalid`;
 await getAuth(app).createUser({uid,email,password:'test-only-password'});
 await getFirestore(app).doc(`roles/${uid}`).set({role:'teacher'});
 await page.getByLabel('E-posta',{exact:true}).fill(email);
 await page.getByLabel('Şifre',{exact:true}).fill('test-only-password');
 await page.getByRole('button',{name:'Giriş yap',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Merhaba, öğretmenim.'})).toBeVisible();
 await covered('.dashboard');
 const original=page.viewportSize()!;
 for(const height of [original.height+300,420]){
  await page.setViewportSize({width:original.width,height});await covered('.dashboard');
  if(original.width>=1000)expect(await page.locator('.sidebar').evaluate(e=>Math.abs(e.getBoundingClientRect().height-innerHeight)<2)).toBe(true);
 }
 await page.reload();await covered('.dashboard');
 expect(errors).toEqual([]);
});
