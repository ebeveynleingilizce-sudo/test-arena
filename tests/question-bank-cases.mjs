import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFails} from '@firebase/rules-unit-testing';
import {doc,getDocFromServer,getDocs,collection,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {bankProjection,normalizeBankRecord,reportTypes} from '../shared/question-bank.mjs';
import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
export function registerQuestionBankTests(context){
 let pupil,student,quiz,scope,original,report;
 test('bank review is available to teachers; bank mutations and role escalation remain protected',async()=>{
  const {ta,tb,call,adminDb,records,client}=context();
  const bank=await call(tb,'teacherQuestionBank',{grade:2});assert.equal(bank.records.length,10);assert.equal(bank.permissions.canManage,false);assert(bank.records.every(r=>r.answer.correctOptionId));
  const id=records[0].question.questionId;await assertFails(setDoc(doc(tb.db,`questions/${id}`),records[0].question));await assertFails(deleteDoc(doc(tb.db,`questions/${id}`)));await assertFails(updateDoc(doc(tb.db,'roles/st-other'),{questionBankAdmin:true}));await assertFails(setDoc(doc(tb.db,'questionBankState/live'),{revision:0,lockId:'fake',lockedBy:'st-other',lockedAt:new Date()}));
  await assert.rejects(call(tb,'manageQuestionBank',{operation:'delete',grade:2,questionId:id}));
  await adminDb.doc('roles/st').set({questionBankAdmin:true},{merge:true});assert.equal((await call(ta,'teacherQuestionBank',{grade:2})).permissions.canManage,true);
  const cls=await call(ta,'createClass',{className:'BANK SECURITY',defaultGradeLevel:2});student=await call(ta,'createStudent',{classId:cls.classId,firstName:'Bank',lastName:'Test',gradeLevel:2});scope=`teachers/st/students/${student.studentId}`;pupil=await client('bank-pupil');await call(pupil,'studentLogin',{code:student.code});
  const q=records[0].question;quiz=await call(pupil,'startTest',{grade:2,subjectId:q.subject,unitId:q.unitId,topicId:q.topic,packId:'pack-1'});original=records.find(r=>r.question.questionId===quiz.questions[0].questionId);
  quiz.templateId=(await adminDb.doc(`${scope}/quizzes/${quiz.testSessionId}`).get()).data().templateId;
  await assertFails(getDocFromServer(doc(pupil.db,`privateQuestionAnswers/${id}`)));await assertFails(getDocs(collection(pupil.db,'questions')));
 });
 test('reports preserve quiz and XP; reporters cannot inspect others or forge metadata/status',async()=>{
  const {ta,tb,call,adminDb}=context(),before=(await adminDb.doc(`${scope}/learning/summary`).get()).data(),session=(await adminDb.doc(`${scope}/quizzes/${quiz.testSessionId}`).get()).data();
  report=await call(pupil,'reportQuestion',{questionId:original.question.questionId,testSessionId:quiz.testSessionId,type:reportTypes[0],description:'Anahtar inceleme'});
  const r=(await getDocFromServer(doc(pupil.db,`questionReports/${report.reportId}`))).data();assert.equal(r.reporterRole,'student');assert.equal(r.status,'pending');assert.equal(r.questionId,original.question.questionId);
  await assertFails(getDocFromServer(doc(tb.db,`questionReports/${report.reportId}`)));await assertFails(getDocs(collection(pupil.db,'questionReports')));await assertFails(updateDoc(doc(pupil.db,`questionReports/${report.reportId}`),{status:'fixed'}));
  await assertFails(setDoc(doc(pupil.db,'questionReports/forged'),{...r,reporterUid:'st'}));await assert.rejects(call(pupil,'reportQuestion',{questionId:'missing',testSessionId:quiz.testSessionId,type:reportTypes[0],description:''}));
  const own=await call(tb,'reportQuestion',{questionId:original.question.questionId,type:reportTypes[8],description:''});assert((await getDocFromServer(doc(tb.db,`questionReports/${own.reportId}`))).exists());await assertFails(getDocFromServer(doc(pupil.db,`questionReports/${own.reportId}`)));
  assert.equal((await call(ta,'questionReports')).filter(r=>r.questionId===original.question.questionId).length,2);await call(ta,'updateQuestionReport',{reportId:report.reportId,status:'reviewing'});await assertFails(updateDoc(doc(ta.db,`questionReports/${report.reportId}`),{description:'rewritten'}));
  assert.deepEqual((await adminDb.doc(`${scope}/learning/summary`).get()).data(),before);assert.deepEqual((await adminDb.doc(`${scope}/quizzes/${quiz.testSessionId}`).get()).data(),session);
 });
 test('bank publication versions immutable keys and keeps open student tests working',async()=>{
  const {ta,tb,call,adminDb}=context(),tree=(await adminDb.doc('curricula/2').get()).data(),bank=await call(ta,'teacherQuestionBank',{grade:2});
  const projection=await bankProjection(tree,bank.records);assert(projection.templates.some(t=>t.id===quiz.templateId));
  const changed=structuredClone(original);changed.answer.correctOptionId=changed.question.choices.find(c=>c.choiceId!==original.answer.correctOptionId).choiceId;changed.answer.explanation='Düzeltilen açıklama';
  await call(ta,'manageQuestionBank',{operation:'update',grade:2,record:changed,expectedRevision:0});
  assert.equal((await adminDb.doc(`privateQuizKeys/${quiz.templateId}/answers/${original.question.questionId}`).get()).data().correctOptionId,original.answer.correctOptionId);assert.equal((await adminDb.doc(`quizTemplates/${quiz.templateId}`).get()).data().active,false);
  const updated=await call(tb,'getBankQuestion',{questionId:original.question.questionId});assert.equal(updated.answer.correctOptionId,changed.answer.correctOptionId);assert.equal(updated.question.bankRevision,1);
  await assertFails(updateDoc(doc(ta.db,`privateQuizKeys/${quiz.templateId}/answers/${original.question.questionId}`),{correctOptionId:changed.answer.correctOptionId}));
  const result=await call(pupil,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:original.question.questionId,selectedChoiceId:original.answer.correctOptionId});assert.equal(result.answer.isCorrect,true);
  await call(pupil,'finishTest',{testSessionId:quiz.testSessionId});assert.equal((await adminDb.doc(`${scope}/learning/summary`).get()).data().totalXP,1);
  assert.equal((await adminDb.collection('questionBankAudit').get()).size,1);assert.equal((await adminDb.doc('roles/st').get()).data().role,'teacher');
  const invalid=structuredClone(updated);invalid.answer.correctOptionId='Z';assert.throws(()=>normalizeBankRecord(invalid,tree));await assert.rejects(call(ta,'manageQuestionBank',{operation:'update',grade:2,record:invalid,expectedRevision:1}));
 });
 test('bank create, JSON import and archive preserve IDs and reject duplicate imports',async()=>{
  const {ta,call,adminDb}=context(),base=structuredClone(original);base.question.questionId='bank-created';await call(ta,'manageQuestionBank',{operation:'create',grade:2,record:base});
  const imported=Array.from({length:50},(_,i)=>{const r=structuredClone(base);r.question.questionId=`bank-imported-${i}`;return r;});await call(ta,'manageQuestionBank',{operation:'import',grade:2,bank:imported});await assert.rejects(call(ta,'manageQuestionBank',{operation:'import',grade:2,bank:imported}));
  await call(ta,'manageQuestionBank',{operation:'delete',grade:2,questionId:'bank-created'});assert.equal((await adminDb.doc('questions/bank-created').get()).data().status,'archived');assert((await adminDb.doc('privateQuestionAnswers/bank-created').get()).exists);
  assert.equal((await adminDb.doc(`questions/${original.question.questionId}`).get()).data().questionId,original.question.questionId);
 });
 test('teacher review, practice, report and admin interfaces work on phone and desktop without student writes',async()=>{
  if(!process.env.SPARK_BROWSER_URL) return;
  const {adminDb}=context(),browser=await chromium.launch(),url=process.env.SPARK_BROWSER_URL;
  const snapshot=async()=>JSON.stringify((await adminDb.doc(`${scope}/learning/summary`).get()).data()),before=await snapshot();
  await mkdir('test-results/question-bank',{recursive:true});
  try{for(const width of [360,1366]){const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await page.goto(`${url}/ogretmen-giris`);await page.getByLabel('E-posta',{exact:true}).fill('st-other@fixture.invalid');await page.getByLabel('Şifre',{exact:true}).fill('teacher-fixture-only');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogretmen');
   await page.goto(`${url}/ogretmen/soru-bankasi`);await page.locator('.bank-answer').waitFor();assert.equal(await page.getByRole('button',{name:'Soru ekle',exact:true}).count(),0);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('.bank-question-list input').first().check();await page.getByRole('button',{name:'Test Modu · 1 soruyu çöz',exact:true}).click();assert.equal(await page.locator('.bank-answer').count(),0);await page.locator('.answer-choices button').first().click();await page.getByRole('button',{name:'Sonuçları gör',exact:true}).click();await page.getByRole('heading',{name:'Öğretmen test sonucu',exact:true}).waitFor();
   await page.getByRole('button',{name:'İnceleme Moduna dön',exact:true}).click();await page.getByRole('button',{name:'⚑ Hata Bildir',exact:true}).click();await page.getByLabel('Hata türü').selectOption('Görsel hatası');await page.getByLabel('Ek açıklama (isteğe bağlı)').fill(`UI ${width}`);await page.getByRole('button',{name:'Bildirimi gönder',exact:true}).click();await page.getByText('Bildirimin alındı. Soruyu çözmeye devam edebilirsin.',{exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/question-bank/review-${width}.png`,fullPage:true});assert.deepEqual(errors,[]);await page.close();
   const manager=await browser.newPage({viewport:{width,height:900}});manager.on('pageerror',e=>errors.push(e.message));manager.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await manager.goto(`${url}/ogretmen-giris`);await manager.getByLabel('E-posta',{exact:true}).fill('st@fixture.invalid');await manager.getByLabel('Şifre',{exact:true}).fill('teacher-fixture-only');await manager.getByRole('button',{name:'Giriş yap',exact:true}).click();await manager.waitForURL('**/ogretmen');await manager.goto(`${url}/ogretmen/soru-bankasi`);await manager.getByRole('button',{name:'Soru ekle',exact:true}).waitFor();await manager.getByRole('button',{name:'Soruyu düzenle',exact:true}).click();await manager.getByRole('dialog').waitFor();assert(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await manager.screenshot({path:`test-results/question-bank/editor-${width}.png`,fullPage:true});await manager.getByRole('button',{name:'Kapat',exact:true}).click();await manager.goto(`${url}/ogretmen/soru-hatalari`);await manager.locator('.report-group').first().waitFor();await manager.locator('.report-group select').first().selectOption('fixed');await manager.getByRole('link',{name:'Soruyu aç',exact:true}).first().click();await manager.locator('.bank-answer').waitFor();assert(await manager.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await manager.close();
  }assert.equal(await snapshot(),before);}finally{await browser.close();}
 });
}
