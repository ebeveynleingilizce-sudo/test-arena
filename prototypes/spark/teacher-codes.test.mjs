import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithEmailAndPassword,createUserWithEmailAndPassword,updatePassword,updateEmail,deleteUser} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc,updateDoc,Timestamp,setLogLevel} from 'firebase/firestore';
import {initializeApp as adminApp,deleteApp as deleteAdminApp} from 'firebase-admin/app';
import {getAuth as adminAuth} from 'firebase-admin/auth';
import {preparedBankFixture} from '../../tests/prepared-bank-fixture.mjs';
import {arenaPeriod} from '../../functions/lib/arena-store.js';
import {loginWithCode} from './client.mjs';
import {createStudentProfile,issueCode} from './teacher-codes.mjs';
import {startQuiz,submitQuiz,gradeQuiz,awardQuiz} from './quiz-client.mjs';
import {loadIdentityQuizRules} from './load-identity-rules.mjs';
const projectId='demo-test-arena-spark-prototype';
if(process.env.GCLOUD_PROJECT!==projectId||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Isolated prototype emulators required');
setLogLevel('silent');
let env,admin,teacher,other,enroll,student,recovered,first,second,third,records,period;
const apps=[];
const base='teachers/it/students/s1';
const ref=(db,p)=>doc(db,p);
function client(name){
  const app=initializeApp({projectId,apiKey:'emulator-only'},`identity-${name}`);apps.push(app);
  const auth=getAuth(app),db=getFirestore(app);
  connectAuthEmulator(auth,'http://127.0.0.1:9199',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8180);
  return {auth,db};
}
async function seed(p,d){await env.withSecurityRulesDisabled(c=>setDoc(ref(c.firestore(),p),d));}
async function finish(d,id){
  await startQuiz(d,'it','s1',id,'identity-pack');
  for(const [i,r]of records.entries()){
    const choice=i===0?r.question.choices.find(c=>c.choiceId!==r.answer.correctOptionId).choiceId:r.answer.correctOptionId;
    await submitQuiz(d,'it','s1',id,r.question.questionId,choice);
    const result=await gradeQuiz(d,'it','s1',id,r.question.questionId);assert.equal(result.isCorrect,i!==0);
  }
}
before(async()=>{
  const rules=await loadIdentityQuizRules();
  env=await initializeTestEnvironment({projectId,firestore:{host:'127.0.0.1',port:8180,rules}});
  await env.clearFirestore(); // Disposable isolated project only.
  admin=adminApp({projectId},'identity-fixture-admin');
  // Admin is fixture setup only: teachers, existing prepared bank, trusted calendar.
  // Every student creation, renewal and recovery below uses ordinary client SDKs.
  for(const uid of ['it','it-other']){
    await adminAuth(admin).createUser({uid,email:`${uid}@prototype.invalid`,password:'teacher-fixture-only'});
    await seed(`roles/${uid}`,{role:'teacher'});
  }
  teacher=client('teacher');other=client('other');enroll=client('enrollment');student=client('student');recovered=client('recovered');
  for(const [c,uid]of [[teacher,'it'],[other,'it-other']])await signInWithEmailAndPassword(c.auth,`${uid}@prototype.invalid`,'teacher-fixture-only');
  records=preparedBankFixture('matematik',2,10).prepared.records.slice(0,10);
  await seed('quizTemplates/identity-pack',{gradeLevel:2,questionIds:records.map(r=>r.question.questionId)});
  for(const r of records){
    await seed(`questions/${r.question.questionId}`,{...r.question,choiceIds:r.question.choices.map(c=>c.choiceId)});
    await seed(`privateQuestionAnswers/${r.question.questionId}`,r.answer);
    await seed(`privateQuizKeys/identity-pack/answers/${r.question.questionId}`,r.answer);
  }
  period=arenaPeriod();await seed(`arenaWeeks/${period.weekKey}`,{startsAt:Timestamp.fromMillis(period.startsAt),endsAt:Timestamp.fromMillis(period.endsAt)});
});
after(async()=>{await Promise.all(apps.map(deleteApp));if(admin)await deleteAdminApp(admin);await env?.cleanup();});
test('teacher creates class/student and six-character code through client Auth; teacher session survives',async()=>{
  await setDoc(ref(teacher.db,'teachers/it/classes/c1'),{className:'DOSTLAR',defaultGradeLevel:2});
  await createStudentProfile(teacher.db,'it','s1','c1',2);
  first=await issueCode(teacher.db,enroll.auth,enroll.db,'it','s1','R7M4Q9');
  assert.equal(teacher.auth.currentUser.uid,'it');assert.equal(first.version,1);
  await loginWithCode(student.auth,first.code);assert.equal(student.auth.currentUser.uid,first.uid);
  assert.equal((await getDoc(ref(student.db,base))).data().gradeLevel,2);
});
test('global codes, private answers, foreign students, identity forgery and XP tampering denied',async()=>{
  await assertFails(getDocs(collection(student.db,'codeTickets')));
  await assertFails(getDoc(ref(student.db,`codeTickets/${first.code}`)));
  await assertFails(getDoc(ref(student.db,`privateQuestionAnswers/${records[0].question.questionId}`)));
  await assertFails(getDoc(ref(other.db,base)));
  await assertFails(updateDoc(ref(student.db,base),{gradeLevel:12}));
  await assertFails(updateDoc(ref(student.db,`${base}/learning/summary`),{totalXP:999}));
  await assertFails(setDoc(ref(other.db,`studentBindings/${first.uid}`),{teacherUid:'it-other',studentId:'s1',version:1}));
  await assertFails(setDoc(ref(student.db,'enrollmentProofs/fake-uid'),{teacherUid:'it',studentId:'s1',version:1,code:first.code}));
  await assertFails(setDoc(ref(student.db,`roles/${first.uid}`),{role:'teacher'}));
});
test('real short-code Auth identity solves ten-question quiz: wrong=0, first correct=1, repeated=0',async()=>{
  await finish(student.db,'initial');
  const q=records[1].question.questionId;
  await assert.rejects(awardQuiz(student.db,'it','s1','initial',records[0].question.questionId,period.weekKey));
  assert.equal(await awardQuiz(student.db,'it','s1','initial',q,period.weekKey),1);
  assert.equal(await awardQuiz(student.db,'it','s1','initial',q,period.weekKey),0);
});
test('native Auth password change IS possible and breaks short-code login: documented unresolved risk',async()=>{
  await updatePassword(student.auth.currentUser,'student-changed-fixture-password');
  const fresh=client('old-code-check');await assert.rejects(loginWithCode(fresh.auth,first.code));
  await signInWithEmailAndPassword(fresh.auth,`${first.code.toLowerCase()}@students.testarena.invalid`,'student-changed-fixture-password');
  await getDoc(ref(fresh.db,base));
});
test('teacher recovery rotates to a NEW Auth UID, revokes old binding, retains profile/XP/idempotency',async()=>{
  second=await issueCode(teacher.db,enroll.auth,enroll.db,'it','s1','R8N5T4');
  assert.notEqual(second.uid,first.uid);assert.equal(second.version,2);
  await assertFails(getDoc(ref(student.db,base)));
  await assertFails(startQuiz(student.db,'it','s1','stale','identity-pack'));
  await loginWithCode(recovered.auth,second.code);
  assert.equal((await getDoc(ref(recovered.db,`${base}/learning/summary`))).data().totalXP,1);
  assert.equal(await awardQuiz(recovered.db,'it','s1','initial',records[1].question.questionId,period.weekKey),0);
  await finish(recovered.db,'after-recovery');
  assert.equal(await awardQuiz(recovered.db,'it','s1','after-recovery',records[2].question.questionId,period.weekKey),1);
});
test('old code cannot be recycled; unauthorized teacher cannot renew code; active binding stays usable',async()=>{
  await assert.rejects(issueCode(teacher.db,enroll.auth,enroll.db,'it','s1',first.code));
  await assert.rejects(issueCode(other.db,enroll.auth,enroll.db,'it','s1','R9P6V3'));
  assert.equal((await getDoc(ref(recovered.db,base))).data().credentialVersion,2);
});
test('student can change native Auth email and delete own account; teacher recovers permanent student again',async()=>{
  await updateEmail(recovered.auth.currentUser,'changed-student@prototype.invalid');
  await deleteUser(recovered.auth.currentUser);
  third=await issueCode(teacher.db,enroll.auth,enroll.db,'it','s1','R9P6V3');
  await loginWithCode(recovered.auth,third.code);assert.equal(third.version,3);
  assert.equal((await getDoc(ref(recovered.db,`${base}/learning/summary`))).data().totalXP,2);
  assert.equal((await getDoc(ref(teacher.db,`teachers/it/classes/c1/leaderboard/s1`))).data().academicXP,2);
  await assert.rejects(issueCode(teacher.db,enroll.auth,enroll.db,'it','s1',second.code));
});
test('recovery cannot reset grade/class/XP or promote student; previous committed answers remain private',async()=>{
  await assertFails(updateDoc(ref(teacher.db,base),{gradeLevel:12}));
  await assertFails(updateDoc(ref(teacher.db,`${base}/learning/summary`),{totalXP:0,academicXP:0}));
  await assertFails(setDoc(ref(recovered.db,`roles/${third.uid}`),{role:'teacher'}));
  await assertFails(getDoc(ref(recovered.db,`privateQuizKeys/identity-pack/answers/${records[1].question.questionId}`)));
  assert.equal((await getDoc(ref(recovered.db,`${base}/quizzes/initial`))).data().resolved,10);
});
test('Auth enrollment failure does not revoke active student; reserved failed code cannot be recycled',async()=>{
  const squatter=client('squatter');
  await createUserWithEmailAndPassword(squatter.auth,'r6k3p8@students.testarena.invalid','fixture-squatter-password');
  await assert.rejects(issueCode(teacher.db,enroll.auth,enroll.db,'it','s1','R6K3P8'),e=>e.code==='auth/email-already-in-use');
  const profile=(await getDoc(ref(recovered.db,base))).data();assert.equal(profile.credentialVersion,3);assert.equal(profile.authUid,third.uid);
  await assertFails(getDoc(ref(squatter.db,base)));
  await assertFails(setDoc(ref(squatter.db,`studentBindings/${squatter.auth.currentUser.uid}`),{teacherUid:'it',studentId:'s1',version:4}));
  await assert.rejects(issueCode(teacher.db,enroll.auth,enroll.db,'it','s1','R6K3P8'));
});
