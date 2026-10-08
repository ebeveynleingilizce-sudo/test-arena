// Disposable integration fixture. Never part of the production bank.
import {readFileSync,readdirSync,writeFileSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getAuth} from 'firebase-admin/auth';
import {teacherClient,client,loginStudent} from '../helpers.mjs';
import {prepareQuestionBank} from '../../scripts/curriculum-bank.mjs';
import {randomUUID} from 'node:crypto';
const folder='data/questions/zz-package-image-disposable',state='.firebase/package-image-local.json';
process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099';process.env.GCLOUD_PROJECT='demo-test-arena';
const app=initializeApp({projectId:'demo-test-arena'},'package-image-local'),db=getFirestore(app);
try{
 if(process.argv[2]==='setup'){
  if(existsSync(state))throw Error('Fixture already exists');
  const bank=JSON.parse(readFileSync('data/questions/'+readdirSync('data/questions').find(f=>f.startsWith('2-sinif-ingilizce')),'utf8'));
  mkdirSync(folder+'/images',{recursive:true});writeFileSync(folder+'/images/q.png',readFileSync('design-reference/test-arena-master.png'));
  bank.questions=Array.from({length:20},(_,i)=>structuredClone(bank.questions[i%bank.questions.length]));delete bank.questionCount;
  const marker='zz-package-image-'+randomUUID().slice(0,8);
  bank.questions.forEach((q,i)=>{q.id=marker+'-'+String(i).padStart(2,'0');q.visual={type:'image',src:'images/q.png',alt:'Test Arena ekran örnekleri'};});
  const prepared=prepareQuestionBank(bank,undefined,{packageDirectory:folder});writeFileSync(folder+'/questions.json',JSON.stringify(bank));
  writeFileSync(state,JSON.stringify({ids:bank.questions.map(q=>q.id),visual:prepared.records[0].question.visual,bank}));console.log('Disposable nested bank ready: 20 questions');
 }else if(process.argv[2]==='session'){
  const saved=JSON.parse(readFileSync(state));if(saved.uid)throw Error('Fixture session already created');const teacher=await teacherClient({fixtures:false});saved.uid=teacher.auth.currentUser.uid;
  try{const cls=await teacher.call('createClass',{className:'Disposable image test',defaultGradeLevel:2});const student=await teacher.call('createStudent',{classId:cls.classId,firstName:'Görsel',lastName:'Test',gradeLevel:2});saved.code=student.code;const pupil=client();try{
   await loginStudent(pupil,student.code);const catalog=await pupil.call('quizCatalog',{}),subject=catalog.curricula.find(c=>c.grade===2).subjects.find(s=>s.id==='ingilizce'),unit=subject.units.find(u=>u.id===saved.bank.questions[0].unitId),topic=unit.topics.find(t=>t.id===saved.bank.questions[0].topicId),packs=subject.navigationModel==='theme-test'?unit.packs:topic.packs;
   const test=await pupil.call('startTest',{grade:2,subjectId:subject.id,unitId:unit.id,...(subject.navigationModel==='theme-test'?{}:{topicId:topic.id}),packId:packs.at(-1).id});saved.testId=test.testSessionId;
   if(!test.questions.length||test.questions.some(q=>!saved.ids.includes(q.questionId)||!q.visual||'correctOptionId' in q||'explanation' in q))throw Error('DTO mismatch');
   console.log(JSON.stringify({code:saved.code,url:'http://127.0.0.1:5173/ogrenci/coz/'+saved.testId,questions:test.questions.length}));
  }finally{await pupil.close();}}finally{writeFileSync(state,JSON.stringify(saved));await teacher.close();}
 }else if(process.argv[2]==='cleanup'){
  const saved=JSON.parse(readFileSync(state));for(const id of saved.ids){await db.doc('questions/'+id).delete();await db.doc('privateQuestionAnswers/'+id).delete();}
  if(saved.testId)await db.doc('privateTestKeys/'+saved.testId).delete();
  if(saved.uid){for(const col of ['studentSessions','studentCodeIndex']){const docs=await db.collection(col).where('teacherUid','==',saved.uid).get();for(const d of docs.docs){if(col==='studentSessions')await getAuth(app).deleteUser(d.id).catch(()=>{});await d.ref.delete();}}await db.recursiveDelete(db.doc('teachers/'+saved.uid));await getAuth(app).deleteUser(saved.uid);}
  rmSync(folder,{recursive:true,force:true});rmSync(state);console.log('Disposable questions/answers/user/session removed; existing banks preserved.');
 }
}finally{await Promise.all(getApps().map(deleteApp));}
