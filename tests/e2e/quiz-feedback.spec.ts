import {test,expect} from '@playwright/test';

test('feedback has one compact action and returns to question navigation',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const questions=[1,2].map(n=>({questionId:`feedback-${n}`,questionText:`${n}. sorunun cevabı hangisidir?`,choices:[{choiceId:'a',text:'Birinci seçenek'},{choiceId:'b',text:'İkinci seçenek'},{choiceId:'c',text:'Üçüncü seçenek'}]}));
 const quiz={testSessionId:'feedback',gradeLevel:5,subject:'turkce',subjectName:'Türkçe',topic:'tema',topicName:'Oyun Dünyası',questionCount:2,questions,answeredQuestionIds:[],correctCount:0,wrongCount:0,earnedXP:0,status:'active',startedAt:0,completedAt:null};
 await page.route('**/src/app/DuelLobby.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const DuelLobby=({children})=>children;export const useDuelLobby=()=>({duels:[],presence:[],busyDuels:[],now:0,error:""});'}));
 await page.route('**/src/app/Session.tsx*',r=>r.fulfill({contentType:'application/javascript',body:'export const useSession=()=>({role:"student",loading:false,user:{uid:"feedback"},student:{gradeLevel:5,firstName:"Ada"}});export const SessionProvider=({children})=>children;'}));
 await page.route('**/src/data/firebase.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export const auth={},db={},app={},persistenceReady=Promise.resolve();let quiz=${JSON.stringify(quiz)};export async function call(name,data){if(name==='submitAnswer'){const correct=data.selectedChoiceId==='a';quiz={...quiz,answeredQuestionIds:[...quiz.answeredQuestionIds,data.questionId],correctCount:quiz.correctCount+Number(correct),wrongCount:quiz.wrongCount+Number(!correct),earnedXP:quiz.earnedXP+Number(correct)};return {test:quiz,answer:{selectedChoiceId:data.selectedChoiceId,correctChoiceId:'a',isCorrect:correct,earnedXP:Number(correct),explanation:'Doğru seçeneği bulmak için verilen bilgileri birlikte değerlendir.'}};}if(name==='finishTest'){quiz={...quiz,status:'completed'};}return quiz;}`}));
 await page.goto('/ogrenci/coz/feedback');
 await expect(page.locator('.quiz-question-navigation')).toBeVisible();
 await page.locator('[data-choice-id="a"]').click();await page.getByRole('button',{name:'Cevabı kontrol et'}).click();
 for(const state of ['correct','wrong']){
  const feedback=page.locator(`.answer-feedback.${state}`);await expect(feedback).toBeVisible();
  await expect(page.locator('.quiz-question-navigation')).toHaveCount(0);await expect(feedback.getByRole('button')).toHaveCount(1);
  const action=feedback.getByRole('button'),heading=feedback.locator('h2');
  const a=(await action.boundingBox())!,h=(await heading.boundingBox())!;expect(a.y).toBeGreaterThan(h.y+h.height);expect(a.width).toBeLessThanOrEqual(230);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`feedback-${state}.png`),fullPage:true});
  if(state==='correct'){await page.getByRole('button',{name:'Devam →'}).click();await expect(page.locator('.quiz-question-navigation')).toBeVisible();await page.locator('[data-choice-id="b"]').click();await page.getByRole('button',{name:'Cevabı kontrol et'}).click();}
 }
 await page.getByRole('button',{name:'Sonuçları gör'}).click();await expect(page.locator('.quiz-result')).toBeVisible();expect(errors).toEqual([]);
});
