import {test,expect} from '@playwright/test';

for(const count of [1,2,3,4,5,10]){
  test(`${count} test packs stay in document flow`,async({page},info)=>{
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    // Render the actual selection flow with isolated catalog responses; no bank writes.
    await page.route('**/src/app/Session.tsx',r=>r.fulfill({contentType:'application/javascript',body:
      'export const useSession=()=>({role:"student",loading:false,user:{uid:"layout-test"},student:{gradeLevel:2}});export const SessionProvider=({children})=>children;'}));
    const packs=Array.from({length:count},(_,i)=>({id:`pack-${i+1}`,name:`Test ${i+1}`,count:10}));
    await page.route('**/quizCatalog',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({result:{
      allowedGrades:[2],entries:[],curricula:[{grade:2,subjects:[{id:'ingilizce',name:'İngilizce',count:count*10,
        navigationModel:'unit-topic-test',sectionLabel:'THEME',units:[{id:'school-life',name:'School Life',displayName:'THEME 1 — School Life',count:count*10,packs:[],
          topics:[{id:'greetings',name:'Greetings and Introductions at School',count:count*10,packs}]}]}]}]
    }})}));
    await page.goto('/ogrenci/coz');
    await page.getByRole('button',{name:/İngilizce/}).click();
    await page.getByRole('button',{name:/THEME 1 — School Life/}).click();
    await page.getByRole('button',{name:/Greetings and Introductions at School/}).click();
    const section=page.locator('.test-pack-section'),cards=section.locator('.test-pack-list button');
    await expect(cards).toHaveCount(count);
    await expect(section.locator('.quiz-summary')).toContainText('2. Sınıf · İngilizce');
    await expect(section.locator('.quiz-summary strong')).toHaveText('Greetings and Introductions at School');
    const layout=await section.evaluate(el=>{
      const rect=(node:Element)=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
      return {summary:rect(el.querySelector('.quiz-summary')!),grid:rect(el.querySelector('.test-pack-list')!),
        hint:rect(el.querySelector('.quiz-hint')!),cards:Array.from(el.querySelectorAll('.test-pack-list button')).map(rect),
        columns:getComputedStyle(el.querySelector('.test-pack-list')!).gridTemplateColumns.split(' ').length,
        sectionPosition:getComputedStyle(el).position,overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(layout.sectionPosition).toBe('static');
    expect(layout.summary.bottom).toBeLessThanOrEqual(layout.grid.top);
    expect(layout.hint.top-layout.grid.bottom).toBeGreaterThanOrEqual(12);
    expect(layout.hint.top-layout.grid.bottom).toBeLessThanOrEqual(32);
    for(const card of layout.cards){
      expect(card.top).toBeGreaterThanOrEqual(layout.summary.bottom);
      expect(card.bottom).toBeLessThanOrEqual(layout.hint.top);
    }
    if(info.project.name==='desktop'&&count>1)expect(layout.columns).toBe(2);
    if(info.project.name==='phone')expect(layout.columns).toBe(1);
    if(count>1&&count%2===1&&info.project.name==='desktop')
      expect(layout.cards.at(-1)!.top).toBeGreaterThan(layout.cards.at(-2)!.top);
    expect(layout.overflow).toBe(false);
    if(count===2||count===5)await page.screenshot({path:info.outputPath(`packs-${count}.png`),fullPage:true});
    expect(errors).toEqual([]);
  });
}
