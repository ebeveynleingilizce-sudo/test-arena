import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,signInWithEmailAndPassword,setPersistence,inMemoryPersistence,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,collection,getDoc,getDocFromServer,getDocs,getDocsFromServer,query,where,setDoc,updateDoc,writeBatch,runTransaction,serverTimestamp} from 'firebase/firestore';
import {arenaPeriod} from '../../shared/arena-period.mjs';
import {contentGrades} from '../../shared/class-grades.mjs';
import {readServerTime} from './server-clock.mjs';
const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const code=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b&31]).join('');
const base=(t,s)=>`teachers/${t}/students/${s}`;
const quizPath=(t,s,id)=>`${base(t,s)}/quizzes/${id}`;
const ref=(db,p)=>doc(db,p);
const clean=(v,max=128)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>max)throw Error('Geçersiz değer.');return v.trim();};
const id=v=>{const s=clean(v);if(!/^[-A-Za-z0-9_]{1,128}$/.test(s))throw Error('Geçersiz kimlik.');return s;};
export const codeCredentials=value=>{const v=clean(value,6).toUpperCase();if(!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(v))throw Error('Geçersiz kısa kod.');return {code:v,email:`${v.toLowerCase()}@students.testarena.invalid`,password:v};};
export async function ensureTeacher(db,user){
  if((await getDocFromServer(ref(db,`studentBindings/${user.uid}`))).exists())throw Error('Öğrenci hesabı öğretmen olamaz.');
  const role=ref(db,`roles/${user.uid}`),old=await getDocFromServer(role);
  if(!old.exists())await setDoc(role,{role:'teacher'});
  else if(old.data().role!=='teacher')throw Error('Öğretmen hesabı gerekli.');
}
async function teacher(ctx){const user=ctx.auth.currentUser;if(!user)throw Error('Giriş gerekli.');await ensureTeacher(ctx.db,user);return user.uid;}
async function identity(ctx){
  const user=ctx.auth.currentUser;if(!user)throw Error('Öğrenci girişi gerekli.');
  const b=(await getDocFromServer(ref(ctx.db,`studentBindings/${user.uid}`))).data();
  if(!b)throw Error('Öğrenci oturumu bulunamadı.');
  const p=(await getDocFromServer(ref(ctx.db,base(b.teacherUid,b.studentId)))).data();
  if(!p||p.status!=='active'||p.credentialVersion!==b.version)throw Error('Kod yenilendi. Güncel kodla giriş yap.');
  return p;
}
async function serverPeriod(ctx){
  const at=await readServerTime(ctx);
  return {...arenaPeriod(new Date(at)),serverNow:at};
}
async function enrollment(ctx,work){
  const app=initializeApp(ctx.app.options,`enroll-${crypto.randomUUID()}`),auth=getAuth(app),db=getFirestore(app);
  if(ctx.emulator){connectAuthEmulator(auth,`http://127.0.0.1:${ctx.testPorts?.auth||9099}`,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',ctx.testPorts?.firestore||8080);}
  await setPersistence(auth,inMemoryPersistence);
  try{return await work(auth,db);}finally{await signOut(auth);await deleteApp(app);}
}
async function rotate(ctx,t,s){
  const profile=(await getDocFromServer(ref(ctx.db,base(t,s)))).data();
  if(!profile||profile.status==='removed')throw Error('Öğrenci bulunamadı.');
  const version=profile.credentialVersion+1;
  for(let attempt=0;attempt<4;attempt++){
    const credentials=codeCredentials(code());
    try{
      await setDoc(ref(ctx.db,`codeTickets/${credentials.code}`),{teacherUid:t,studentId:s,version,email:credentials.email});
      return await enrollment(ctx,async(auth,db)=>{
        const {user}=await createUserWithEmailAndPassword(auth,credentials.email,credentials.password);
        await setDoc(ref(db,`enrollmentProofs/${user.uid}`),{teacherUid:t,studentId:s,version,code:credentials.code});
        await runTransaction(ctx.db,async tx=>{
          const p=ref(ctx.db,base(t,s)),current=(await tx.get(p)).data();
          if(current.credentialVersion!==version-1)throw Error('Kod aynı anda yenilendi; tekrar dene.');
          tx.set(ref(ctx.db,`studentBindings/${user.uid}`),{teacherUid:t,studentId:s,version});
          tx.set(ref(ctx.db,`roles/${user.uid}`),{role:'student'});
          tx.update(p,{status:'active',credentialVersion:version,authUid:user.uid});
          tx.set(ref(ctx.db,`teachers/${t}/studentCodes/${s}`),{code:credentials.code,credentialVersion:version});
          tx.set(ref(ctx.db,`teachers/${t}/classes/${current.classId}/classMembers/${s}`),{studentId:s});
        });return {studentId:s,code:credentials.code};
      });
    }catch(e){if(!['auth/email-already-in-use','permission-denied'].includes(e.code)||attempt===3)throw e;}
  }
  throw Error('Kod oluşturulamadı.');
}
async function createStudent(ctx,t,data,studentId=crypto.randomUUID()){
  const classId=id(data.classId),c=(await getDocFromServer(ref(ctx.db,`teachers/${t}/classes/${classId}`))).data();
  if(!c)throw Error('Sınıf bulunamadı.');
  const firstName=clean(data.firstName,40),lastName=String(data.lastName||'').trim();if(lastName.length>40)throw Error('Soyad çok uzun.');
  const gradeLevel=Number(data.gradeLevel??c.defaultGradeLevel);if(!Number.isInteger(gradeLevel)||gradeLevel<2||gradeLevel>12)throw Error('Geçersiz kademe.');
  const p=ref(ctx.db,base(t,studentId)),old=await getDocFromServer(p);
  if(old.exists()){
    if(old.data().classId!==classId||old.data().firstName!==firstName||old.data().lastName!==lastName)throw Error('Önceki işlem farklı öğrenciye ait.');
    if(old.data().status==='active')return {studentId,code:(await getDocFromServer(ref(ctx.db,`teachers/${t}/studentCodes/${studentId}`))).data().code};
  }else await setDoc(p,{studentId,teacherUid:t,classId,className:c.className,firstName,lastName,gradeLevel,status:'pending',credentialVersion:0});
  const summary=ref(ctx.db,`${base(t,studentId)}/learning/summary`),row=ref(ctx.db,`teachers/${t}/classes/${classId}/leaderboard/${studentId}`);
  const [learning,arena]=await Promise.all([getDocFromServer(summary),getDocFromServer(row)]),batch=writeBatch(ctx.db);
  if(!learning.exists())batch.set(summary,{totalXP:0,academicXP:0,lastAwardQuestionId:'',answeredCount:0,correctCount:0,wrongCount:0});
  if(!arena.exists())batch.set(row,{studentId,classId,displayName:`${firstName} ${lastName}`,academicXP:0,weeklyAcademicXP:0,weekKey:'',lastAwardQuestionId:''});
  await batch.commit();return rotate(ctx,t,studentId);
}
async function catalog(ctx,p){
  const cls=(await getDocFromServer(ref(ctx.db,`teachers/${p.teacherUid}/classes/${p.classId}`))).data();
  const allowedGrades=contentGrades(p.gradeLevel,cls);
  const trees=await Promise.all(allowedGrades.map(g=>getDocFromServer(ref(ctx.db,`sparkCatalog/${g}`))));
  return {allowedGrades,curricula:trees.filter(d=>d.exists()).map(d=>d.data()),entries:[],fixture:false};
}
async function refreshRow(ctx,t,s){
  const p=(await getDocFromServer(ref(ctx.db,base(t,s)))).data(),period=await serverPeriod(ctx);
  const [summary,week]=await Promise.all([getDocFromServer(ref(ctx.db,`${base(t,s)}/learning/summary`)),getDocFromServer(ref(ctx.db,`${base(t,s)}/academicWeeks/${period.weekKey}`))]);
  await setDoc(ref(ctx.db,`teachers/${t}/classes/${p.classId}/leaderboard/${s}`),{studentId:s,classId:p.classId,displayName:`${p.firstName} ${p.lastName}`,academicXP:summary.data().totalXP,weeklyAcademicXP:week.data()?.academicXP||0,weekKey:period.weekKey,lastAwardQuestionId:summary.data().lastAwardQuestionId});
}
const timestamp=v=>typeof v?.toMillis==='function'?v.toMillis():null;
async function quizDTO(ctx,p,testId){
  const path=quizPath(p.teacherUid,p.studentId,testId),session=await getDocFromServer(ref(ctx.db,path));
  if(!session.exists()){
    const legacy=await getDocFromServer(ref(ctx.db,`${base(p.teacherUid,p.studentId)}/testSessions/${testId}`));
    if(legacy.exists())return {...legacy.data(),startedAt:timestamp(legacy.data().startedAt),completedAt:timestamp(legacy.data().completedAt),legacyReadOnly:true};
    throw Error('Test bulunamadı.');
  }
  const d=session.data(),template=(await getDocFromServer(ref(ctx.db,`quizTemplates/${d.templateId}`))).data();
  const [results,awards]=await Promise.all([getDocs(collection(ctx.db,`${path}/results`)),getDocs(collection(ctx.db,`${base(p.teacherUid,p.studentId)}/awardedQuestions`))]);
  const t=template;
  return {testSessionId:testId,gradeLevel:t.gradeLevel,subject:t.subject,subjectName:t.subjectName,unitId:t.unitId,unitName:t.unitName,topic:t.topic,topicName:t.topicName,packId:t.packId,packName:t.packName,contentBank:'curriculum',questionCount:t.questionIds.length,questions:t.questions.map(q=>({questionId:q.questionId,questionText:q.questionText,choices:q.choices,...(q.content?{content:q.content}:{}),...(q.visual?{visual:q.visual}:{}),...(q.visualPlacement?{visualPlacement:q.visualPlacement}:{})})),answeredQuestionIds:results.docs.map(r=>r.id),correctCount:d.correct,wrongCount:d.wrong,blankCount:d.blank,earnedXP:awards.docs.filter(a=>a.data().testSessionId===testId).reduce((n,a)=>n+a.data().xp,0),status:d.status,startedAt:timestamp(d.startedAt),completedAt:timestamp(d.completedAt)};
}
async function submit(ctx,p,testId,q,choice){
  const path=quizPath(p.teacherUid,p.studentId,testId),submission=ref(ctx.db,`${path}/submissions/${q}`);
  const old=await getDocFromServer(submission);if(old.exists()&&old.data().selectedChoiceId!==choice)throw Error('Yanıt daha önce kaydedildi.');
  const session=(await getDocFromServer(ref(ctx.db,path))).data(),receipt=ref(ctx.db,`${base(p.teacherUid,p.studentId)}/answerReceipts/${session.templateId}:${q}`),exists=await getDocFromServer(receipt),batch=writeBatch(ctx.db);
  if(!old.exists())batch.set(submission,{selectedChoiceId:choice,submittedAt:serverTimestamp()});
  if(!exists.exists())batch.set(receipt,{sessionId:testId,templateId:session.templateId,questionId:q});
  await batch.commit();
}
async function grade(ctx,p,testId,q){
  const path=quizPath(p.teacherUid,p.studentId,testId),result=ref(ctx.db,`${path}/results/${q}`);
  const submitted=(await getDocFromServer(ref(ctx.db,`${path}/submissions/${q}`))).data(),skipped=submitted.selectedChoiceId==='';
  const current=(await getDocFromServer(ref(ctx.db,path))).data();
  const answer=skipped?null:(await getDocFromServer(ref(ctx.db,`privateQuizKeys/${current.templateId}/answers/${q}`))).data();
  // The key becomes readable only AFTER an immutable answer is committed.
  // Rules independently recompute correctness; this boolean grants no authority.
  const isCorrect=!skipped&&submitted.selectedChoiceId===answer.correctOptionId;
  for(let retry=0;retry<3;retry++){
    try{return await runTransaction(ctx.db,async tx=>{
      const session=ref(ctx.db,path),summary=ref(ctx.db,`${base(p.teacherUid,p.studentId)}/learning/summary`);
      const [old,test,total]=await Promise.all([tx.get(result),tx.get(session),tx.get(summary)]);if(old.exists())return old.data();
      const d=test.data(),t=(await tx.get(ref(ctx.db,`quizTemplates/${d.templateId}`))).data(),resolved=d.resolved+1,finished=resolved===t.questionIds.length;
      tx.set(result,{isCorrect,skipped,gradedAt:serverTimestamp()});
      tx.update(session,{resolved,correct:d.correct+Number(isCorrect),wrong:d.wrong+Number(!isCorrect&&!skipped),blank:d.blank+Number(skipped),lastQuestionId:q,status:finished?'completed':'active',completedAt:finished?serverTimestamp():null});
      const a=total.data(),answeredCount=a.answeredCount+Number(!skipped),correctCount=a.correctCount+Number(isCorrect);
      tx.update(summary,{answeredCount,correctCount,wrongCount:answeredCount-correctCount,lastResultSessionId:testId,lastResultQuestionId:q});
      return {isCorrect,skipped};
    });}catch(e){if(!['permission-denied','aborted'].includes(e.code))throw e;}
  }throw Error('Yanıt güvenli biçimde doğrulanamadı.');
}
async function award(ctx,p,testId,q,weekKey,currentWeek){
  const b=base(p.teacherUid,p.studentId),award=ref(ctx.db,`${b}/awardedQuestions/${q}`);
  for(let retry=0;retry<3;retry++)try{return await runTransaction(ctx.db,async tx=>{
    const summary=ref(ctx.db,`${b}/learning/summary`),weekly=ref(ctx.db,`${b}/academicWeeks/${weekKey}`);
    const [old,total,week,profile,display]=await Promise.all([tx.get(award),tx.get(summary),tx.get(weekly),tx.get(ref(ctx.db,b)),weekKey===currentWeek?Promise.resolve(null):tx.get(ref(ctx.db,`${b}/academicWeeks/${currentWeek}`))]);
    if(old.exists())return 0;const academicXP=(total.data().academicXP??total.data().totalXP)+1,weeklyXP=(week.data()?.academicXP||0)+1,s=profile.data();
    tx.set(award,{testSessionId:testId,weekKey,xp:1,awardedAt:serverTimestamp()});
    tx.update(summary,{totalXP:academicXP+(total.data().teacherXP||0),academicXP,lastAwardQuestionId:q});
    tx.set(weekly,{academicXP:weeklyXP,lastAwardQuestionId:q});
    tx.set(ref(ctx.db,`teachers/${p.teacherUid}/classes/${s.classId}/leaderboard/${p.studentId}`),{studentId:p.studentId,classId:s.classId,displayName:`${s.firstName} ${s.lastName}`,academicXP,weeklyAcademicXP:weekKey===currentWeek?weeklyXP:display?.data()?.academicXP||0,weekKey:currentWeek,lastAwardQuestionId:q});return 1;
  });}catch(e){if(!['permission-denied','aborted'].includes(e.code))throw e;if((await getDocFromServer(award)).exists())return 0;if(retry===2)throw e;}
}
async function settle(ctx,p,testId){
  const path=quizPath(p.teacherUid,p.studentId,testId),session=(await getDocFromServer(ref(ctx.db,path))).data();if(session.status!=='completed')return;
  const week=arenaPeriod(session.completedAt.toDate()).weekKey,current=(await serverPeriod(ctx)).weekKey;
  const results=await getDocs(collection(ctx.db,`${path}/results`));
  for(const r of results.docs)if(r.data().isCorrect)await award(ctx,p,testId,r.id,week,current);
}
async function answer(ctx,p,data){
  const testId=id(data.testSessionId),q=id(data.questionId),choice=String(data.selectedChoiceId);
  const before=await getDocFromServer(ref(ctx.db,`${base(p.teacherUid,p.studentId)}/awardedQuestions/${q}`));
  await submit(ctx,p,testId,q,choice);const result=await grade(ctx,p,testId,q);await settle(ctx,p,testId);
  const test=await quizDTO(ctx,p,testId),session=(await getDocFromServer(ref(ctx.db,quizPath(p.teacherUid,p.studentId,testId)))).data();
  const key=(await getDocFromServer(ref(ctx.db,`privateQuizKeys/${session.templateId}/answers/${q}`))).data();
  const awarded=(await getDocFromServer(ref(ctx.db,`${base(p.teacherUid,p.studentId)}/awardedQuestions/${q}`))).exists();
  const summary=(await getDocFromServer(ref(ctx.db,`${base(p.teacherUid,p.studentId)}/learning/summary`))).data();
  return {answer:{questionId:q,selectedChoiceId:choice,isCorrect:result.isCorrect,earnedXP:!before.exists()&&awarded?1:0,pendingXP:result.isCorrect&&!awarded&&test.status==='active',correctChoiceId:key.correctOptionId,explanation:key.explanation||''},test,totalXP:summary.totalXP};
}
const duelStarts=new Map();
export async function sparkCall(name,data,ctx){
  if(['createClass','deleteClass','permanentlyDeleteClass','updateClass','createStudent','bulkCreateStudents','rotateStudentCode','removeStudent','updateStudent','teacherAnalytics','listTeacherClasses','inviteTeacher','acceptTeacherInvitation','revokeTeacherInvitation','removeClassTeacher','transferClassOwnership','adjustStudentReward','saveClassActivity'].includes(name)){
    await teacher(ctx);const {sharedTeacherCall}=await import('./teacher-sharing.mjs');return sharedTeacherCall(ctx,name,data||{});
  }
  if(name==='studentLogin'){
    const c=codeCredentials(data.code);await signInWithEmailAndPassword(ctx.auth,c.email,c.password);
    try{await identity(ctx);return {userUid:ctx.auth.currentUser.uid};}catch(e){await signOut(ctx.auth);throw e;}
  }
  if(name==='syncQuestionBank'){
    if(!ctx.emulator)throw Error('Canlı soru importu yalnız güvenilir yerel importer üzerinden yapılır.');
    const response=await fetch('/__local/question-bank-sync',{method:'POST',headers:{Authorization:`Bearer ${await ctx.auth.currentUser.getIdToken()}`,'Content-Type':'application/json'},body:'{}'});
    if(!response.ok)throw Error('Local admin güncellemesi başarısız.');return response.json();
  }
  if(['createClass','deleteClass','createStudent','bulkCreateStudents','rotateStudentCode','removeStudent','updateStudent','teacherAnalytics'].includes(name)){
    const t=await teacher(ctx);
    if(name==='createClass'){const classId=crypto.randomUUID(),className=clean(data.className,60),defaultGradeLevel=Number(data.defaultGradeLevel);await setDoc(ref(ctx.db,`teachers/${t}/classes/${classId}`),{classId,className,defaultGradeLevel});return {classId};}
    if(name==='deleteClass'){
      const classId=id(data.classId),classRef=ref(ctx.db,`teachers/${t}/classes/${classId}`),token=crypto.randomUUID();
      // Freeze enrollment while checking the authoritative roster, including pending registrations.
      const locked=await runTransaction(ctx.db,async tx=>{
        const current=await tx.get(classRef);if(!current.exists())return false;
        const c=current.data();if(c.deletionToken&&Date.now()-c.deletionStartedAt?.toMillis()<60000)throw Object.assign(Error('Sınıf silme işlemi sürüyor. Bir dakika sonra yeniden dene.'),{code:'class-delete-busy'});
        tx.update(classRef,{deletionToken:token,deletionStartedAt:serverTimestamp()});return true;
      });
      if(!locked)return {classId};
      try{
        const roster=await getDocsFromServer(query(collection(ctx.db,`teachers/${t}/students`),where('classId','==',classId)));
        if(roster.docs.some(d=>d.data().status!=='removed'))throw Object.assign(Error('Sınıfta öğrenci var. Önce öğrencileri başka bir sınıfa taşı veya kaldır.'),{code:'class-not-empty'});
        await runTransaction(ctx.db,async tx=>{const current=await tx.get(classRef);if(!current.exists())return;if(current.data().deletionToken!==token)throw Object.assign(Error('Sınıf silme işlemi değişti. Yeniden dene.'),{code:'class-delete-busy'});tx.delete(classRef);});
        return {classId};
      }finally{
        await runTransaction(ctx.db,async tx=>{const current=await tx.get(classRef);if(current.exists()&&current.data().deletionToken===token)tx.update(classRef,{deletionToken:'',deletionStartedAt:serverTimestamp()});});
      }
    }
    if(name==='createStudent')return createStudent(ctx,t,data);
    if(name==='bulkCreateStudents'){
      const requestId=id(data.requestId),classId=id(data.classId),names=data.names;if(!Array.isArray(names)||!names.length||names.length>50)throw Error('1–50 öğrenci gerekli.');
      const results=[];for(const [i,n]of names.entries())try{const name=clean(n,80),parts=name.split(/\s+/),lastName=parts.length>1?parts.pop():'',firstName=parts.join(' ');results.push({name,...await createStudent(ctx,t,{classId,firstName,lastName},`${requestId}-${i}`)});}catch(e){results.push({name:String(n),error:e.message});}return {results};
    }
    if(name==='rotateStudentCode')return rotate(ctx,t,id(data.studentId));
    if(name==='removeStudent'){
      const s=id(data.studentId),p=(await getDocFromServer(ref(ctx.db,base(t,s)))).data(),batch=writeBatch(ctx.db);
      batch.update(ref(ctx.db,base(t,s)),{status:'removed',credentialVersion:p.credentialVersion+1});batch.delete(ref(ctx.db,`teachers/${t}/classes/${p.classId}/classMembers/${s}`));batch.delete(ref(ctx.db,`teachers/${t}/classes/${p.classId}/leaderboard/${s}`));await batch.commit();return {};
    }
    if(name==='updateStudent'){
      const s=id(data.studentId),classId=id(data.classId),[c,p]=await Promise.all([getDocFromServer(ref(ctx.db,`teachers/${t}/classes/${classId}`)),getDocFromServer(ref(ctx.db,base(t,s)))]),batch=writeBatch(ctx.db);
      batch.update(ref(ctx.db,base(t,s)),{classId,className:c.data().className,gradeLevel:Number(data.gradeLevel)});
      if(p.data().classId!==classId){batch.delete(ref(ctx.db,`teachers/${t}/classes/${p.data().classId}/classMembers/${s}`));batch.delete(ref(ctx.db,`teachers/${t}/classes/${p.data().classId}/leaderboard/${s}`));}
      batch.set(ref(ctx.db,`teachers/${t}/classes/${classId}/classMembers/${s}`),{studentId:s});await batch.commit();await refreshRow(ctx,t,s);return {};
    }
    const {sparkAnalytics}=await import('./spark-analytics.mjs');return sparkAnalytics(ctx,t,data,await serverPeriod(ctx));
  }
  const p=await identity(ctx);
  if(name==='recordQuizBehavior'){
    const {saveQuizBehavior}=await import('./quiz-behavior.mjs');return saveQuizBehavior(ctx,p,data);
  }
  if(name==='prepareArena')return {...await serverPeriod(ctx),classId:p.classId,className:p.className};
  if(name==='quizCatalog')return catalog(ctx,p);
  if(name==='startDuelTest'){
    const key=`${ctx.auth.currentUser.uid}:${id(data.duelId)}`;
    if(duelStarts.has(key))return duelStarts.get(key);
    const work=(async()=>{
    const duelId=id(data.duelId),duel=(await getDocFromServer(ref(ctx.db,`teachers/${p.teacherUid}/classes/${p.classId}/duels/${duelId}`))).data();
    if(!duel||!['active','completed'].includes(duel.status)||!duel.participants.includes(p.studentId))throw Error('Aktif düello bulunamadı.');
    const testId=`${duelId}-${p.studentId}`,path=quizPath(p.teacherUid,p.studentId,testId);
    await runTransaction(ctx.db,async tx=>{const quiz=ref(ctx.db,path);if(!(await tx.get(quiz)).exists())tx.set(quiz,{templateId:duel.templateId,classId:p.classId,resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:serverTimestamp(),completedAt:null});});
    return quizDTO(ctx,p,testId);
    })();duelStarts.set(key,work);try{return await work;}finally{duelStarts.delete(key);}
  }
  if(name==='startTest'){
    const c=await catalog(ctx,p),subject=c.curricula.find(x=>x.grade===data.grade)?.subjects.find(s=>s.id===data.subjectId),unit=subject?.units.find(u=>u.id===data.unitId);
    const packs=subject?.navigationModel==='theme-test'?unit?.packs:unit?.topics.find(t=>t.id===data.topicId)?.packs,pack=packs?.find(v=>v.id===data.packId);
    if(!pack)throw Error('Geçerli test paketi bulunamadı.');
    const testId=crypto.randomUUID();await setDoc(ref(ctx.db,quizPath(p.teacherUid,p.studentId,testId)),{templateId:pack.templateId,classId:p.classId,resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:serverTimestamp(),completedAt:null});return quizDTO(ctx,p,testId);
  }
  if(name==='getTestSession'){const testId=id(data.testSessionId),session=await getDocFromServer(ref(ctx.db,quizPath(p.teacherUid,p.studentId,testId)));if(session.exists())await settle(ctx,p,testId);return quizDTO(ctx,p,testId);}
  if(name==='submitAnswer')return answer(ctx,p,data);
  if(name==='finishTest'){
    const testId=id(data.testSessionId),quiz=await quizDTO(ctx,p,testId);if(quiz.legacyReadOnly)throw Error('Eski test geçmişi salt okunurdur. Yeni test seç.');
    for(const q of quiz.questions)if(!quiz.answeredQuestionIds.includes(q.questionId)){await submit(ctx,p,testId,q.questionId,'');await grade(ctx,p,testId,q.questionId);}
    await settle(ctx,p,testId);return quizDTO(ctx,p,testId);
  }
  throw Error(`Desteklenmeyen veri işlemi: ${name}`);
}
