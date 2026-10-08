import {test,expect} from '@playwright/test';
import {schoolVisuals} from '../fixtures/school-life-visuals.mjs';

// Mount the actual shared student visual component with local descriptors only.
// No Firestore writes, student fixture, AI generation or publication.
test('School Life controlled visuals: readable dialogue, all assets, no overflow/errors',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/ogrenci-giris');
  await page.getByLabel('Öğrenci kısa kodu').waitFor();
  await page.evaluate(async visuals=>{
    const dynamicImport=(path:string)=>import(/* @vite-ignore */ path);
    const reactModule=await dynamicImport('/node_modules/.vite/deps/react.js'),React=reactModule.default??reactModule;
    const domModule=await dynamicImport('/node_modules/.vite/deps/react-dom_client.js'),{createRoot}=domModule.default??domModule;
    const {MathVisual}=await dynamicImport('/src/ui/MathVisual.tsx');
    document.getElementById('root')!.style.display='none';
    const host=document.createElement('main');host.id='school-render-test';host.style.cssText='max-width:640px;margin:0 auto;padding:16px;box-sizing:border-box';document.body.append(host);
    createRoot(host).render(React.createElement('div',{},...visuals.map((visual:any)=>React.createElement('section',
      {key:visual.asset,'data-school-fixture':visual.asset,style:{padding:'12px',marginBottom:'12px',background:'#fff8eb',borderRadius:'16px'}},
      React.createElement('h2',{style:{fontSize:'20px',margin:'0 0 12px'}},visual.kind==='school-dialogue'?visual.speech:visual.kind==='school-place'?'What is this?':'Who is this?'),
      React.createElement(MathVisual,{visual})))));
  },schoolVisuals);
  await expect(page.locator('[data-school-fixture]')).toHaveCount(7);
  await expect(page.locator('.school-dialogue .speech-bubble')).toHaveText(['How are you?','?']);
  for(const asset of ['classroom','library','garden','teacher','pupil','headmaster']){
    const picture=page.locator(`[data-school-asset="${asset}"]`);await expect(picture).toBeVisible();
    const box=(await picture.boundingBox())!;expect(box.width).toBeGreaterThan(200);
    expect(await picture.getAttribute('aria-label')).not.toBe('a '+asset);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/school-life-visual/${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});
