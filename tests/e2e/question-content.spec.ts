import {test,expect} from '@playwright/test';

test('quiz content: multiline card, safe text and legacy questions',async({page},info)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const content='👧 Ada: Hello! My name is Ada.\n👦 Efe: Hello, Ada! My name is Efe.\n👧 Ada: Nice to meet you!\n👦 Efe: ______\n<img src=x onerror=alert(1)>';
  let withContent=true;
  await page.route('**/src/app/Session.tsx',route=>route.fulfill({contentType:'application/javascript',body:
    'export const useSession=()=>({role:"student",loading:false,user:{uid:"content-test"},student:{gradeLevel:2,firstName:"Ada"}});export const SessionProvider=({children})=>children;'}));
  await page.route('**/getTestSession',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({result:{
    testSessionId:'content-test',gradeLevel:2,subject:'ingilizce',subjectName:'İngilizce',topic:'dialogue',topicName:'Diyalog',
    questionCount:1,answeredQuestionIds:[],correctCount:0,wrongCount:0,earnedXP:0,status:'active',startedAt:0,completedAt:null,
    questions:[{questionId:'content-test',questionText:"Efe'nin verebileceği uygun cevap hangisidir?",...(withContent?{content}:{}),choices:[
      {choiceId:'a',text:'Nice to meet you, too!'},{choiceId:'b',text:'Today is Friday.'},{choiceId:'c',text:'Goodbye, teacher!'}]}]
  }})}));
  await page.goto('/ogrenci/coz/content-test');
  await expect(page.locator('.question-content')).toHaveText(content);
  await expect(page.locator('.question-content img')).toHaveCount(0);
  expect(await page.locator('.question-content').evaluate(e=>getComputedStyle(e).whiteSpace)).toBe('pre-wrap');
  const card=(await page.locator('.question-content').boundingBox())!,stem=(await page.locator('.question-text').boundingBox())!;
  expect(card.y+card.height).toBeLessThanOrEqual(stem.y);
  await expect(page.locator('.answer-choices button')).toHaveCount(3);
  await page.locator('[data-choice-id="a"]').click();
  await expect(page.getByRole('button',{name:'Cevabı kontrol et'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('content.png'),fullPage:true});
  withContent=false;await page.reload();
  await expect(page.locator('.question-text')).toBeVisible();
  await expect(page.locator('.question-content')).toHaveCount(0);
  await expect(page.locator('.answer-choices button')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
