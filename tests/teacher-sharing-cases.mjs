import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertFails} from '@firebase/rules-unit-testing';
import {doc,collection,getDocFromServer,getDocs,setDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,onSnapshot} from 'firebase/firestore';
import {inviteHash} from '../src/data/teacher-sharing.mjs';
import {migrateTeacherSharing} from '../scripts/teacher-sharing-migration.mjs';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
export function registerTeacherSharingTests(context){
 let shared,pupil,inv,third;
 const base=()=>`teachers/st/classes/${shared.classId}`,student=()=>`teachers/st/students/${pupil.studentId}`;
 test('teacher invitation grants shared canonical access; forged membership and cross-class access fail',async()=>{
  const {ta,tb,call,client,adminAuth,adminDb,ensureTeacher}=context();await adminAuth.createUser({uid:'sharing-third',email:'sharing-third@fixture.invalid',password:'teacher-fixture-only'});third=await client('sharing-third','sharing-third@fixture.invalid');await ensureTeacher(third.db,third.auth.currentUser);
  shared=await call(ta,'createClass',{className:'ORTAK ARENA',defaultGradeLevel:2});pupil=await call(ta,'createStudent',{classId:shared.classId,firstName:'Ortak',lastName:'Öğrenci',gradeLevel:2});
  await assertFails(getDocFromServer(doc(tb.db,student())));await assertFails(setDoc(doc(tb.db,`${base()}/teacherMembers/st-other`),{uid:'st-other',email:tb.auth.currentUser.email,status:'active',lastActionId:'forged',invitationId:'forged'}));
  inv=await call(ta,'inviteTeacher',{classId:shared.classId});assert.match(inv.code,/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{24}$/);assert.equal(await inviteHash(inv.code),inv.invitationId);assert.equal('code' in (await adminDb.doc(`teacherInvitations/${inv.invitationId}`).get()).data(),false);
  const joined=await call(tb,'acceptTeacherInvitation',{code:inv.code});assert.equal(joined.storageUid,'st');assert.equal((await getDocFromServer(doc(tb.db,student()))).data().teacherUid,'st');await assert.rejects(call(third,'acceptTeacherInvitation',{code:inv.code}));
  assert((await call(tb,'listTeacherClasses')).some(c=>c.storageUid==='st'&&c.classId===shared.classId));assert.equal((await adminDb.collection('teachers/st-other/students').get()).docs.filter(d=>d.id===pupil.studentId).length,0);
  await assertFails(getDocs(collection(tb.db,'teachers/st/students')));const privateClass=await call(ta,'createClass',{className:'ÖZEL',defaultGradeLevel:2});await assertFails(getDocFromServer(doc(tb.db,`teachers/st/classes/${privateClass.classId}`)));
  await assertFails(getDocs(collection(tb.db,'teachers/st/classes')));
 });
 test('legacy creator discovery works without an access row or active membership; outsiders remain denied',async()=>{
  const {ta,tb,call,adminDb}=context(),classId='creator-compatibility',path=`teachers/st/classes/${classId}`;
  await adminDb.doc(path).set({classId,className:'ESKİ KURUCU SINIFI',defaultGradeLevel:2,ownerUid:'st-other',createdBy:'st',status:'active'});
  await adminDb.doc(`${path}/teacherMembers/st`).set({uid:'st',email:'st@fixture.invalid',status:'revoked'});
  await adminDb.doc(`${path}/teacherMembers/st-other`).set({uid:'st-other',email:'st-other@fixture.invalid',status:'active'});
  assert((await call(ta,'listTeacherClasses')).some(c=>c.classId===classId));
  await call(ta,'updateClass',{classId,className:'Kurucu hâlâ yönetir',defaultGradeLevel:2});
  await assertFails(getDocFromServer(doc(third.db,path)));
  await assertFails(setDoc(doc(third.db,`teacherClassAccess/sharing-third/classes/st~${classId}`),{storageUid:'st',classId}));
  await assert.rejects(call(tb,'removeClassTeacher',{storageUid:'st',classId,teacherUid:'st'}));
  // An invited member can perform full management, including deleting a test-only empty class.
  const empty=await call(ta,'createClass',{className:'ÜYE YETKİ TESTİ',defaultGradeLevel:2});
  const invite=await call(ta,'inviteTeacher',{classId:empty.classId});await call(tb,'acceptTeacherInvitation',{code:invite.code});
  await call(tb,'transferClassOwnership',{storageUid:'st',classId:empty.classId,teacherUid:'st-other'});
  await call(ta,'transferClassOwnership',{storageUid:'st',classId:empty.classId,teacherUid:'st'});
  await call(tb,'deleteClass',{storageUid:'st',classId:empty.classId});assert.equal((await adminDb.doc(`teachers/st/classes/${empty.classId}`).get()).exists,false);
 });
 test('shared teachers edit pupils, rotate codes, manage activities and audited XP/star adjustments',async()=>{
  const {ta,tb,call,adminDb,client,pack,records}=context(),scope={storageUid:'st',classId:shared.classId};
  await call(tb,'updateStudent',{...scope,studentId:pupil.studentId,firstName:'Yeni',lastName:'Ad',gradeLevel:2});assert.equal((await getDocFromServer(doc(ta.db,student()))).data().firstName,'Yeni');
  const rotated=await call(tb,'rotateStudentCode',{storageUid:'st',studentId:pupil.studentId});assert.notEqual(rotated.code,pupil.code);
  await call(tb,'adjustStudentReward',{...scope,studentId:pupil.studentId,kind:'xp',amount:10,reason:'Sınıf çalışması'});await call(tb,'adjustStudentReward',{...scope,studentId:pupil.studentId,kind:'stars',amount:3,reason:'Katılım'});await call(ta,'adjustStudentReward',{...scope,studentId:pupil.studentId,kind:'xp',amount:-4,reason:'Düzeltme'});
  const summary=(await getDocFromServer(doc(tb.db,`${student()}/learning/summary`))).data();assert.equal(summary.totalXP,6);assert.equal(summary.academicXP,0);assert.equal(summary.stars,3);
  await assert.rejects(call(tb,'adjustStudentReward',{...scope,studentId:pupil.studentId,kind:'xp',amount:-7,reason:'Geçersiz bakiye'}));await assertFails(updateDoc(doc(tb.db,`${student()}/learning/summary`),{totalXP:9000}));
  const learner=await client('shared-learner');await call(learner,'studentLogin',{code:rotated.code});const tpl=(await getDocFromServer(doc(learner.db,`quizTemplates/${pack.templateId}`))).data(),quiz=await call(learner,'startTest',{grade:2,subjectId:tpl.subject,unitId:tpl.unitId,...(tpl.topic?{topicId:tpl.topic}:{}),packId:tpl.packId});
  for(const q of quiz.questions)await call(learner,'submitAnswer',{testSessionId:quiz.testSessionId,questionId:q.questionId,selectedChoiceId:records.find(r=>r.question.questionId===q.questionId).answer.correctOptionId});await call(learner,'finishTest',{testSessionId:quiz.testSessionId});const earned=(await getDocFromServer(doc(tb.db,`${student()}/learning/summary`))).data();assert.equal(earned.totalXP,16);assert.equal(earned.academicXP,10);assert.equal(earned.teacherXP,6);assert.equal(earned.stars,3);await call(learner,'finishTest',{testSessionId:quiz.testSessionId});assert.equal((await getDocFromServer(doc(tb.db,`${student()}/learning/summary`))).data().totalXP,16);
  await assertFails(updateDoc(doc(tb.db,student()),{gradeLevel:12}));await assertFails(updateDoc(doc(tb.db,base()),{ownerUid:'st-other'}));
  await call(tb,'saveClassActivity',{...scope,title:'Ortak yarışma',status:'planned'});const report=await call(tb,'teacherAnalytics',scope);assert.equal(report.students.find(s=>s.studentId===pupil.studentId).displayName,'Yeni Ad');
  const events=await getDocs(collection(ta.db,`${base()}/audit`));assert(events.docs.some(d=>d.data().actorUid==='st-other'&&d.data().operation==='rewardAdjusted'));
  const old=events.docs[0];await assertFails(deleteDoc(doc(tb.db,`${base()}/audit/${old.id}`)));await assertFails(updateDoc(doc(tb.db,`${base()}/audit/${old.id}`),{actorUid:'st'}));
  const forged=writeBatch(tb.db),actionId=crypto.randomUUID();forged.set(doc(tb.db,`${base()}/audit/${actionId}`),{actorUid:'st',actorEmail:ta.auth.currentUser.email,operation:'rewardAdjusted',targetId:pupil.studentId,changes:{kind:'xp',amount:1,reason:'Sahte'},at:serverTimestamp()});forged.update(doc(tb.db,`${student()}/learning/summary`),{totalXP:7,teacherXP:7,lastActionId:actionId});await assertFails(forged.commit());
  // Members have full rights, but the explicit name confirmation still protects deletion.
  await assert.rejects(call(tb,'permanentlyDeleteClass',{...scope,confirmName:'YANLIŞ AD'}));assert((await adminDb.doc(student()).get()).exists);
 });
 test('invitations expire and revoke; teacher removal stops real-time access and preserves student data',async()=>{
  const {ta,tb,call,adminDb}=context(),scope={storageUid:'st',classId:shared.classId};
  const expired=await call(tb,'inviteTeacher',scope);await adminDb.doc(`teacherInvitations/${expired.invitationId}`).update({createdAt:new Date(Date.now()-86401000)});await assert.rejects(call(third,'acceptTeacherInvitation',{code:expired.code}));
  const cancelled=await call(tb,'inviteTeacher',scope);await call(ta,'revokeTeacherInvitation',{...scope,invitationId:cancelled.invitationId});await assert.rejects(call(third,'acceptTeacherInvitation',{code:cancelled.code}));
  const fresh=await call(tb,'inviteTeacher',scope);await call(third,'acceptTeacherInvitation',{code:fresh.code});
  const before=(await adminDb.doc(student()).get()).data();let stopped;const revoked=new Promise((resolve,reject)=>{stopped=onSnapshot(doc(tb.db,student()),()=>{},error=>error.code==='permission-denied'?resolve(true):reject(error));});
  await call(ta,'removeClassTeacher',{...scope,teacherUid:'st-other'});assert.deepEqual((await adminDb.doc(student()).get()).data(),before);
  await call(ta,'updateStudent',{...scope,studentId:pupil.studentId,firstName:'Erişim',lastName:'Testi',gradeLevel:2});await Promise.race([revoked,new Promise((_,reject)=>setTimeout(()=>reject(Error('Revoked listener received a new update')),8000))]);stopped();
  await assertFails(getDocFromServer(doc(tb.db,student())));await assert.rejects(call(tb,'rotateStudentCode',{storageUid:'st',studentId:pupil.studentId}));assert(!(await call(tb,'listTeacherClasses')).some(c=>c.storageUid==='st'&&c.classId===shared.classId));
 });
 test('multi-class codes grant only selected classes atomically and keep legacy codes compatible',async()=>{
  const {ta,tb,call,adminDb}=context();const groups=[];
  for(let i=0;i<6;i++)groups.push(await call(ta,'createClass',{className:`DAVET ${i}`,defaultGradeLevel:2}));
  const classIds=groups.slice(0,5).map(c=>c.classId),invite=await call(ta,'inviteTeacherClasses',{classIds});
  await assert.rejects(call(ta,'inviteTeacherClasses',{classIds:[]}));await assert.rejects(call(ta,'inviteTeacherClasses',{classIds:[classIds[0],classIds[0]]}));await assert.rejects(call(ta,'inviteTeacherClasses',{classIds:groups.map(c=>c.classId)}));await assert.rejects(call(ta,'acceptTeacherInvitation',{code:invite.code}));
  await assertFails(updateDoc(doc(ta.db,`teacherInvitations/${invite.invitationId}`),{classIds:[...classIds,groups[5].classId]}));
  // A malicious client cannot consume a group invitation while joining only its first class.
  const partial=writeBatch(tb.db),eventId=crypto.randomUUID(),path=`teachers/st/classes/${classIds[0]}`;
  partial.update(doc(tb.db,`teacherInvitations/${invite.invitationId}`),{consumedBy:'st-other',consumedAt:serverTimestamp()});
  partial.set(doc(tb.db,`${path}/audit/${eventId}`),{actorUid:'st-other',actorEmail:tb.auth.currentUser.email,operation:'teacherJoined',targetId:'st-other',changes:{invitationId:invite.invitationId},at:serverTimestamp()});
  partial.set(doc(tb.db,`${path}/teacherMembers/st-other`),{uid:'st-other',email:tb.auth.currentUser.email,status:'active',lastActionId:eventId,invitationId:invite.invitationId});await assertFails(partial.commit());
  assert.equal((await adminDb.doc(`teacherInvitations/${invite.invitationId}`).get()).data().consumedBy,'');
  const joined=await call(tb,'acceptTeacherInvitation',{code:invite.code});assert.deepEqual(joined.classIds,classIds);
  for(const c of classIds){await call(tb,'saveClassActivity',{storageUid:'st',classId:c,title:'Tam yetki',status:'planned'});assert.equal((await getDocFromServer(doc(tb.db,`teachers/st/classes/${c}/teacherMembers/st-other`))).data().status,'active');}
  await assertFails(getDocFromServer(doc(tb.db,`teachers/st/classes/${groups[5].classId}`)));await assert.rejects(call(third,'acceptTeacherInvitation',{code:invite.code}));
  const cancelled=await call(ta,'inviteTeacherClasses',{classIds:[groups[5].classId,classIds[0]]});await call(ta,'revokeTeacherInvitation',{storageUid:'st',classId:groups[5].classId,invitationId:cancelled.invitationId});await assert.rejects(call(third,'acceptTeacherInvitation',{code:cancelled.code}));
 });
 test('shared teacher browser: invite join, live roster, full member controls and phone/desktop layout',async()=>{
  const {ta,tb,call}=context(),ports=ta.testPorts,url=process.env.SPARK_BROWSER_URL||'http://127.0.0.1:5185',vite=process.env.SPARK_BROWSER_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5185','--strictPort'],{env:{...process.env,VITE_SPARK_TEST:'true',VITE_TEST_PROJECT_ID:ta.app.options.projectId,VITE_USE_EMULATORS:'true',VITE_TEST_AUTH_PORT:String(ports.auth),VITE_TEST_FIRESTORE_PORT:String(ports.firestore)},windowsHide:true,stdio:'ignore'});let browser;
  try{for(let i=0;i<120;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}browser=await chromium.launch();await mkdir('test-results/teacher-sharing',{recursive:true});
   for(const [width,height]of [[360,800],[1366,900]]){const cls=await call(ta,'createClass',{className:`ORTAK UI ${width}`,defaultGradeLevel:2}),scope={storageUid:'st',classId:cls.classId},invitation=await call(ta,'inviteTeacher',scope),pages=[],errors=[];
    for(const email of ['st@fixture.invalid','st-other@fixture.invalid']){const page=await browser.newPage({viewport:{width,height}});pages.push(page);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});await page.goto(`${url}/ogretmen-giris`,{waitUntil:'domcontentloaded',timeout:60000});await page.getByLabel('E-posta',{exact:true}).fill(email);await page.getByLabel('Şifre',{exact:true}).fill('teacher-fixture-only');await page.getByRole('button',{name:'Giriş yap',exact:true}).click();await page.waitForURL('**/ogretmen');}
    const [ownerPage,memberPage]=pages;
    for(const page of pages){assert.equal(await page.getByRole('button',{name:'Öğretmen Davet Et',exact:true}).count(),0);assert.equal(await page.getByLabel('Öğretmen davet kodu').count(),0);}
    const extra=await call(ta,'createClass',{className:`SEÇİLEN UI ${width}`,defaultGradeLevel:2}),excluded=await call(ta,'createClass',{className:`SEÇİLMEYEN UI ${width}`,defaultGradeLevel:2});
    await ownerPage.goto(`${url}/ogretmen/siniflar`);await ownerPage.getByRole('button',{name:'Öğretmen Davet Et',exact:true}).click();await ownerPage.getByRole('checkbox',{name:`ORTAK UI ${width}`,exact:true}).check();await ownerPage.getByRole('checkbox',{name:`SEÇİLEN UI ${width}`,exact:true}).check();assert.equal(await ownerPage.getByRole('checkbox',{name:`SEÇİLMEYEN UI ${width}`,exact:true}).isChecked(),false);
    await ownerPage.getByRole('button',{name:'Davet Kodu Oluştur',exact:true}).click();const issued=ownerPage.getByLabel('Oluşturulan davet kodu',{exact:true});await issued.waitFor();const issuedCode=await issued.inputValue();assert.match(issuedCode,/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{24}$/);
    await ownerPage.context().grantPermissions(['clipboard-read','clipboard-write']);await ownerPage.getByRole('button',{name:'Kodu kopyala',exact:true}).click();await ownerPage.getByText('Davet kodu kopyalandı.',{exact:true}).waitFor();assert.equal(await ownerPage.evaluate(()=>navigator.clipboard.readText()),issuedCode);assert(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ownerPage.screenshot({path:`test-results/teacher-sharing/invite-classes-${width}.png`,fullPage:true});
    await memberPage.goto(`${url}/ogretmen/siniflar`);await memberPage.getByRole('button',{name:'Davet Kodu ile Sınıfa Katıl',exact:true}).click();await memberPage.getByLabel('Öğretmen davet kodu').fill(issuedCode);await memberPage.getByRole('button',{name:'Sınıfa katıl',exact:true}).click();await memberPage.getByText('2 sınıfa tam yönetim yetkisiyle katıldın. Sınıfların aşağıdaki listede.',{exact:true}).waitFor();await memberPage.getByRole('heading',{name:`SEÇİLEN UI ${width}`,exact:true}).waitFor();assert.equal(await memberPage.getByRole('heading',{name:`SEÇİLMEYEN UI ${width}`,exact:true}).count(),0);await memberPage.getByRole('link').filter({has:memberPage.getByRole('heading',{name:`ORTAK UI ${width}`,exact:true})}).click();await memberPage.waitForURL(`**/siniflar/${cls.classId}?owner=st`);
    await ownerPage.goto(`${url}/ogretmen/siniflar/${cls.classId}?owner=st`);const learner=await call(tb,'createStudent',{...scope,firstName:'Canlı',lastName:'Öğrenci',gradeLevel:2});for(const page of pages){await page.locator(`[data-student-id="${learner.studentId}"]`).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    await memberPage.locator(`[data-student-id="${learner.studentId}"]`).getByRole('button',{name:'XP / yıldız',exact:true}).click();const reward=memberPage.getByRole('dialog',{name:'XP / yıldız düzenle'});await reward.getByLabel('Ödül',{exact:true}).selectOption('stars');await reward.getByLabel('Değişim',{exact:true}).fill('3');await reward.getByLabel('Neden',{exact:true}).fill('Katılım');await reward.getByRole('button',{name:'Kaydet',exact:true}).click();await reward.getByText('3 yıldız',{exact:true}).waitFor();assert(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await memberPage.screenshot({path:`test-results/teacher-sharing/reward-${width}.png`,fullPage:true});await reward.getByRole('button',{name:'Kapat',exact:true}).click();
    await memberPage.getByRole('button',{name:'Sınıf yönetimi',exact:true}).click();await memberPage.getByRole('heading',{name:'Ortak sınıf yönetimi'}).waitFor();assert.equal(await memberPage.getByRole('heading',{name:'Sahipliği devret'}).count(),1);assert.equal(await memberPage.getByText('Sınıfı ve verilerini kalıcı sil',{exact:true}).count(),1);assert(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await memberPage.screenshot({path:`test-results/teacher-sharing/shared-management-${width}.png`,fullPage:true});await ownerPage.getByRole('button',{name:'Sınıf yönetimi',exact:true}).click();await ownerPage.getByRole('heading',{name:'Sahipliği devret'}).waitFor();assert(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ownerPage.screenshot({path:`test-results/teacher-sharing/owner-management-${width}.png`,fullPage:true});
    await memberPage.getByRole('button',{name:'Öğrenciler',exact:true}).click();await call(ta,'removeClassTeacher',{...scope,teacherUid:'st-other'});await memberPage.locator(`[data-student-id="${learner.studentId}"]`).waitFor({state:'detached'});assert.deepEqual(errors,[]);for(const page of pages)await page.close();
   }
  }finally{await browser?.close();vite?.kill();}
 });
 test('ownership transfer preserves creator rights; members have full powers and audit attribution',async()=>{
  const {ta,call,adminDb}=context(),scope={storageUid:'st',classId:shared.classId};await assert.rejects(call(ta,'deleteClass',scope),e=>e.code==='class-not-empty');await call(ta,'transferClassOwnership',{...scope,teacherUid:'sharing-third'});
  assert.equal((await getDocFromServer(doc(third.db,base()))).data().ownerUid,'sharing-third');await call(ta,'saveClassActivity',{...scope,title:'Kurucunun erişimi korunur',status:'planned'});
  await assert.rejects(call(third,'removeClassTeacher',{...scope,teacherUid:'sharing-third'}));await assert.rejects(call(third,'removeClassTeacher',{...scope,teacherUid:'st'}));await getDocFromServer(doc(ta.db,student()));await getDocs(collection(ta.db,`${base()}/audit`));await call(third,'permanentlyDeleteClass',{...scope,confirmName:'ORTAK ARENA'});assert.equal((await adminDb.doc(base()).get()).exists,false);assert.equal((await adminDb.doc(student()).get()).exists,false);assert.equal((await adminDb.doc(`${student()}/learning/summary`).get()).exists,false);
  const audit=await getDocs(collection(third.db,`${base()}/audit`));assert(audit.docs.some(d=>d.data().operation==='classDeletionStarted'&&d.data().actorUid==='sharing-third'));await assertFails(getDocs(collection(ta.db,`${base()}/audit`)));
 });
 test('interrupted class deletion stays visible to its owner and can be resumed safely',async()=>{
  const {ta,call,adminDb}=context();for(const empty of [false,true]){const c=await call(ta,'createClass',{className:'KESİNTİ TESTİ',defaultGradeLevel:2}),path=`teachers/st/classes/${c.classId}`;await adminDb.doc(path).update({status:'deleting',...(empty?{deletionToken:'interrupted-empty'}:{})});await adminDb.doc(`deletedClassArchives/st~${c.classId}`).set({storageUid:'st',classId:c.classId,ownerUid:'st',at:new Date()});assert((await call(ta,'listTeacherClasses')).some(cls=>cls.classId===c.classId&&cls.status==='deleting'));await call(ta,empty?'deleteClass':'permanentlyDeleteClass',{storageUid:'st',classId:c.classId,confirmName:'KESİNTİ TESTİ'});assert.equal((await adminDb.doc(path).get()).exists,false);assert.equal((await adminDb.doc(`teacherClassAccess/st/classes/st~${c.classId}`).get()).exists,false);}
 });
 test('legacy class sharing migration is additive and idempotent; student/code/XP fingerprints stay identical',async()=>{
  const {adminDb,adminAuth}=context();await adminDb.doc('teachers/st/classes/legacy-sharing-fixture').set({classId:'legacy-sharing-fixture',className:'ESKİ SINIF',defaultGradeLevel:2});const dry=await migrateTeacherSharing(adminDb,adminAuth);assert.equal(dry.apply,false);assert(dry.classesToUpdate>=1);assert.equal((await adminDb.doc('teachers/st/classes/legacy-sharing-fixture').get()).data().ownerUid,undefined);let backed=false;const applied=await migrateTeacherSharing(adminDb,adminAuth,{apply:true,backup:async()=>{backed=true;}});assert(backed);assert.equal(applied.before.sha256,applied.after.sha256);assert.equal((await adminDb.doc('teacherClassAccess/st/classes/st~legacy-sharing-fixture').get()).data().storageUid,'st');const retry=await migrateTeacherSharing(adminDb,adminAuth,{apply:true});assert.equal(retry.classesToUpdate,0);assert.equal(retry.before.sha256,retry.after.sha256);
 });
}
