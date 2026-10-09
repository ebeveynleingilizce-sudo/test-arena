import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,createUserWithEmailAndPassword,setPersistence,inMemoryPersistence,signOut} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,collection,query,where,getDocFromServer,getDocs,setDoc,writeBatch,runTransaction,serverTimestamp,deleteDoc} from 'firebase/firestore';
import {arenaPeriod} from '../../shared/arena-period.mjs';
import {codeCredentials} from './spark.mjs';
import {classGradeConfig,studentGrade} from '../../shared/class-grades.mjs';
import {readServerTime} from './server-clock.mjs';
const text=(v,n=128)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>n)throw Error('Geçersiz değer.');return v.trim();};
const id=v=>{const s=text(v);if(!/^[-A-Za-z0-9_]{1,128}$/.test(s))throw Error('Geçersiz kimlik.');return s;};
const grade=v=>{const n=Number(v);if(!Number.isInteger(n)||n<2||n>12)throw Error('Kademe 2–12 arasında olmalı.');return n;};
const studentPath=(t,s)=>`teachers/${t}/students/${s}`;
const classPath=(t,c)=>`teachers/${t}/classes/${c}`;
export const accessKey=(t,c)=>`${t}~${c}`;
const r=(ctx,p)=>doc(ctx.db,p);
const actor=ctx=>ctx.auth.currentUser.uid;
const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const shortCode=()=>Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b&31]).join('');
export async function inviteHash(code){const value=text(code,64).toUpperCase().replace(/\s|-/g,'');if(!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{24}$/.test(value))throw Error('Öğretmen davet kodu 24 karakter olmalı.');return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
function log(ctx,b,t,c,operation,targetId,changes={}){const eventId=crypto.randomUUID();b.set(r(ctx,`${classPath(t,c)}/audit/${eventId}`),{actorUid:actor(ctx),actorEmail:ctx.auth.currentUser.email||'',operation,targetId,changes,at:serverTimestamp()});return eventId;}
async function profile(ctx,t,s){const snap=await getDocFromServer(r(ctx,studentPath(t,s)));if(!snap.exists())throw Error('Öğrenci bulunamadı.');return snap.data();}
async function classInfo(ctx,t,c,allowDeleting=false){const snap=await getDocFromServer(r(ctx,classPath(t,c)));if(!snap.exists()||(!allowDeleting&&snap.data().status==='deleting'))throw Error('Sınıf erişimi sona erdi.');return snap.data();}
const now=readServerTime;
export async function accessibleClasses(ctx){
 const uid=actor(ctx),[owned,refs]=await Promise.all([getDocs(collection(ctx.db,`teachers/${uid}/classes`)),getDocs(collection(ctx.db,`teacherClassAccess/${uid}/classes`))]);
 const classes=new Map(owned.docs.map(d=>[accessKey(uid,d.id),{...d.data(),classId:d.id,storageUid:uid}]));
 for(const link of refs.docs){const v=link.data(),key=accessKey(v.storageUid,v.classId);if(classes.has(key))continue;
  try{const c=await getDocFromServer(r(ctx,classPath(v.storageUid,v.classId)));if(c.exists())classes.set(key,{...c.data(),classId:c.id,storageUid:v.storageUid});}
  catch(e){if(e.code!=='permission-denied')throw e;}
 }return [...classes.values()];
}
async function enrollment(ctx,work){const app=initializeApp(ctx.app.options,`shared-enroll-${crypto.randomUUID()}`),auth=getAuth(app),db=getFirestore(app);if(ctx.emulator){connectAuthEmulator(auth,`http://127.0.0.1:${ctx.testPorts?.auth||9099}`,{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',ctx.testPorts?.firestore||8080);}await setPersistence(auth,inMemoryPersistence);try{return await work(auth,db);}finally{await signOut(auth);await deleteApp(app);}}
async function rotate(ctx,t,s){
 const p=await profile(ctx,t,s);if(p.status==='removed')throw Error('Öğrenci kaldırılmış.');const version=p.credentialVersion+1;
 for(let attempt=0;attempt<4;attempt++){
  const credentials=codeCredentials(shortCode());
  try{const reserve=writeBatch(ctx.db),reservedId=log(ctx,reserve,t,p.classId,'codeReserved',s,{code:credentials.code,version});
   reserve.set(r(ctx,`codeTickets/${credentials.code}`),{teacherUid:t,studentId:s,version,email:credentials.email,lastActionId:reservedId});await reserve.commit();
   return await enrollment(ctx,async(auth,db)=>{const {user}=await createUserWithEmailAndPassword(auth,credentials.email,credentials.password);await setDoc(doc(db,`enrollmentProofs/${user.uid}`),{teacherUid:t,studentId:s,version,code:credentials.code});
    await runTransaction(ctx.db,async tx=>{const ref=r(ctx,studentPath(t,s)),current=(await tx.get(ref)).data();if(current.credentialVersion!==version-1)throw Error('Kod aynı anda yenilendi. Yeniden dene.');const eventId=log(ctx,tx,t,current.classId,'studentCodeRotated',s,{version});
     tx.set(r(ctx,`studentBindings/${user.uid}`),{teacherUid:t,studentId:s,version});tx.set(r(ctx,`roles/${user.uid}`),{role:'student'});
     tx.update(ref,{status:'active',credentialVersion:version,authUid:user.uid,lastActionId:eventId});
     tx.set(r(ctx,`teachers/${t}/studentCodes/${s}`),{code:credentials.code,credentialVersion:version,lastActionId:eventId});
     tx.set(r(ctx,`${classPath(t,current.classId)}/classMembers/${s}`),{studentId:s,lastActionId:eventId});
    });return {studentId:s,code:credentials.code};
   });
  }catch(e){if(e.code!=='auth/email-already-in-use'||attempt===3)throw e;}
 }throw Error('Kod oluşturulamadı.');
}
async function addStudent(ctx,t,data,s=crypto.randomUUID()){
 const c=id(data.classId),cls=await classInfo(ctx,t,c),firstName=text(data.firstName,40),lastName=String(data.lastName||'').trim(),g=studentGrade(cls,data.gradeLevel);if(lastName.length>40)throw Error('Soyad çok uzun.');
 const ref=r(ctx,studentPath(t,s)),old=await getDocFromServer(ref);
 if(old.exists()){const p=old.data();if(p.classId!==c||p.firstName!==firstName||p.lastName!==lastName||p.gradeLevel!==g)throw Error('Önceki işlem farklı öğrenciye ait.');if(p.status==='active')return {studentId:s,code:(await getDocFromServer(r(ctx,`teachers/${t}/studentCodes/${s}`))).data().code};}
 else{const b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'studentCreated',s,{firstName,lastName,gradeLevel:g});b.set(ref,{studentId:s,teacherUid:t,classId:c,className:cls.className,firstName,lastName,gradeLevel:g,status:'pending',credentialVersion:0,lastActionId:eventId});await b.commit();}
 const summary=r(ctx,`${studentPath(t,s)}/learning/summary`);if(!(await getDocFromServer(summary)).exists()){
  const b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'studentInitialized',s);
  b.set(summary,{totalXP:0,academicXP:0,lastAwardQuestionId:'',answeredCount:0,correctCount:0,wrongCount:0,lastActionId:eventId});
  b.set(r(ctx,`${classPath(t,c)}/leaderboard/${s}`),{studentId:s,classId:c,displayName:`${firstName} ${lastName}`,academicXP:0,weeklyAcademicXP:0,weekKey:'',lastAwardQuestionId:'',lastActionId:eventId});await b.commit();
 }return rotate(ctx,t,s);
}
async function updateStudent(ctx,t,data){
 const s=id(data.studentId),c=id(data.classId),p=await profile(ctx,t,s),cls=await classInfo(ctx,t,c),firstName=data.firstName===undefined?p.firstName:text(data.firstName,40),lastName=data.lastName===undefined?p.lastName:String(data.lastName).trim();if(lastName.length>40)throw Error('Soyad çok uzun.');
 const period=arenaPeriod(new Date(await now(ctx))),[summary,week]=await Promise.all([getDocFromServer(r(ctx,`${studentPath(t,s)}/learning/summary`)),getDocFromServer(r(ctx,`${studentPath(t,s)}/academicWeeks/${period.weekKey}`))]);
 const b=writeBatch(ctx.db),g=c===p.classId&&Number(data.gradeLevel)===p.gradeLevel?p.gradeLevel:studentGrade(cls,data.gradeLevel),eventId=log(ctx,b,t,p.classId,'studentUpdated',s,{firstName,lastName,classId:c,gradeLevel:g});
 b.update(r(ctx,studentPath(t,s)),{classId:c,className:cls.className,firstName,lastName,gradeLevel:g,lastActionId:eventId});
 if(c!==p.classId){b.set(r(ctx,`${classPath(t,c)}/audit/${eventId}`),{actorUid:actor(ctx),actorEmail:ctx.auth.currentUser.email||'',operation:'studentUpdated',targetId:s,changes:{firstName,lastName,classId:c,gradeLevel:g},at:serverTimestamp()});b.delete(r(ctx,`${classPath(t,p.classId)}/classMembers/${s}`));b.delete(r(ctx,`${classPath(t,p.classId)}/leaderboard/${s}`));}
 b.set(r(ctx,`${classPath(t,c)}/classMembers/${s}`),{studentId:s,lastActionId:eventId});
 b.set(r(ctx,`${classPath(t,c)}/leaderboard/${s}`),{studentId:s,classId:c,displayName:`${firstName} ${lastName}`,academicXP:summary.data().academicXP??summary.data().totalXP,weeklyAcademicXP:week.data()?.academicXP||0,weekKey:period.weekKey,lastAwardQuestionId:summary.data().lastAwardQuestionId,lastActionId:eventId});await b.commit();return {};
}
async function deleteCollection(ctx,path,children=[]){const rows=await getDocs(collection(ctx.db,path));for(const row of rows.docs){for(const sub of children)await deleteCollection(ctx,`${path}/${row.id}/${sub}`);await deleteDoc(row.ref);}}
async function permanentlyDelete(ctx,t,c){
 const cls=await classInfo(ctx,t,c,true);
 if(cls.status!=='deleting'){const b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'classDeletionStarted',c);b.update(r(ctx,classPath(t,c)),{status:'deleting',lastActionId:eventId});b.set(r(ctx,`deletedClassArchives/${accessKey(t,c)}`),{storageUid:t,classId:c,ownerUid:actor(ctx),at:serverTimestamp()});await b.commit();}
 const roster=await getDocs(query(collection(ctx.db,`teachers/${t}/students`),where('classId','==',c)));
 for(const row of roster.docs){const s=row.id;for(const sub of ['learning','academicWeeks','awardedQuestions','answerReceipts','analytics','analyticsDimensions','behaviorEvents','testBehavior','testResults'])await deleteCollection(ctx,`${studentPath(t,s)}/${sub}`);
  await deleteCollection(ctx,`${studentPath(t,s)}/quizzes`,['submissions','results','behavior']);await deleteCollection(ctx,`${studentPath(t,s)}/testSessions`,['answers']);
  if(row.data().authUid)await deleteDoc(r(ctx,`studentBindings/${row.data().authUid}`));await deleteDoc(r(ctx,`teachers/${t}/studentCodes/${s}`));await deleteDoc(row.ref);
 }
 const members=await getDocs(collection(ctx.db,`${classPath(t,c)}/teacherMembers`));for(const m of members.docs)if(m.id!==actor(ctx))await deleteDoc(r(ctx,`teacherClassAccess/${m.id}/classes/${accessKey(t,c)}`));
 const invitations=await getDocs(query(collection(ctx.db,'teacherInvitations'),where('storageUid','==',t),where('classId','==',c)));for(const inv of invitations.docs)await deleteDoc(inv.ref);
 for(const sub of ['teacherMembers','classMembers','leaderboard','presence','duelSlots','activities'])await deleteCollection(ctx,`${classPath(t,c)}/${sub}`);await deleteCollection(ctx,`${classPath(t,c)}/duels`,['answers']);
 const finish=writeBatch(ctx.db);finish.delete(r(ctx,`teacherClassAccess/${actor(ctx)}/classes/${accessKey(t,c)}`));finish.delete(r(ctx,classPath(t,c)));await finish.commit();return {};
}
export async function sharedTeacherCall(ctx,name,data={}){
 const uid=actor(ctx),t=data.storageUid?id(data.storageUid):uid;
 if(name==='createClass'){const c=crypto.randomUUID(),className=text(data.className,60),config=classGradeConfig(data),b=writeBatch(ctx.db),eventId=log(ctx,b,uid,c,'classCreated',c,{className,...config});b.set(r(ctx,classPath(uid,c)),{classId:c,className,...config,ownerUid:uid,createdBy:uid,status:'active',lastActionId:eventId});b.set(r(ctx,`teacherClassAccess/${uid}/classes/${accessKey(uid,c)}`),{storageUid:uid,classId:c});b.set(r(ctx,`${classPath(uid,c)}/teacherMembers/${uid}`),{uid,email:ctx.auth.currentUser.email||'',status:'active',lastActionId:eventId});await b.commit();return {classId:c,storageUid:uid};}
 if(name==='createStudent')return addStudent(ctx,t,data);
 if(name==='bulkCreateStudents'){const req=id(data.requestId),c=id(data.classId);if(!Array.isArray(data.names)||!data.names.length||data.names.length>50)throw Error('1–50 öğrenci gerekli.');const results=[];for(const [i,n]of data.names.entries())try{const name=text(n,80),parts=name.split(/\s+/),lastName=parts.length>1?parts.pop():'',firstName=parts.join(' ');results.push({name,...await addStudent(ctx,t,{classId:c,firstName,lastName,gradeLevel:data.gradeLevel},`${req}-${i}`)});}catch(e){results.push({name:String(n),error:e.message});}return {results};}
 if(name==='rotateStudentCode')return rotate(ctx,t,id(data.studentId));
 if(name==='updateStudent')return updateStudent(ctx,t,data);
 if(name==='removeStudent'){const s=id(data.studentId),p=await profile(ctx,t,s),b=writeBatch(ctx.db),eventId=log(ctx,b,t,p.classId,'studentRemoved',s);b.update(r(ctx,studentPath(t,s)),{status:'removed',credentialVersion:p.credentialVersion+1,lastActionId:eventId});b.delete(r(ctx,`${classPath(t,p.classId)}/classMembers/${s}`));b.delete(r(ctx,`${classPath(t,p.classId)}/leaderboard/${s}`));await b.commit();return {};}
 if(name==='teacherAnalytics'){const {sparkAnalytics}=await import('./spark-analytics.mjs');const at=await now(ctx),period=arenaPeriod(new Date(at)),classes=await accessibleClasses(ctx);return sparkAnalytics(ctx,t,data,{...period,serverNow:at},classes);}
 if(name==='listTeacherClasses')return accessibleClasses(ctx);
 if(name==='inviteTeacherClasses'){
  const classIds=data.classIds;
  if(!Array.isArray(classIds)||!classIds.length||classIds.length>5||new Set(classIds).size!==classIds.length)throw Error('Bir davet için 1–5 farklı sınıf seç.');
  classIds.forEach(id);for(const c of classIds)await classInfo(ctx,uid,c);
  const code=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>alphabet[b&31]).join(''),hash=await inviteHash(code),b=writeBatch(ctx.db),eventId=log(ctx,b,uid,classIds[0],'teacherInvited',hash,{classIds});
  b.set(r(ctx,`teacherInvitations/${hash}`),{storageUid:uid,classId:classIds[0],classIds,createdBy:uid,createdAt:serverTimestamp(),consumedBy:'',consumedAt:null,revoked:false,lastActionId:eventId});await b.commit();return {code,invitationId:hash};
 }
 if(name==='acceptTeacherInvitation'){
  const hash=await inviteHash(data.code);return runTransaction(ctx.db,async tx=>{
   const invRef=r(ctx,`teacherInvitations/${hash}`),snapshot=await tx.get(invRef);if(!snapshot.exists())throw Error('Davet bulunamadı.');
   const inv=snapshot.data(),ct=inv.storageUid,classIds=inv.classIds||[inv.classId];
   if(inv.createdBy===uid)throw Error('Kendi oluşturduğun davete katılamazsın.');
   if(inv.revoked||inv.consumedBy||inv.createdAt.toMillis()+86400000<Date.now())throw Error('Davet kullanılmış veya süresi dolmuş.');
   const members=await Promise.all(classIds.map(c=>tx.get(r(ctx,`${classPath(ct,c)}/teacherMembers/${uid}`))));
   if(members.every(m=>m.exists()&&m.data().status==='active'))throw Error('Bu sınıflarda zaten yetkilisin.');
   tx.update(invRef,{consumedBy:uid,consumedAt:serverTimestamp()});
   for(const c of classIds){const eventId=log(ctx,tx,ct,c,'teacherJoined',uid,{invitationId:hash});tx.set(r(ctx,`${classPath(ct,c)}/teacherMembers/${uid}`),{uid,email:ctx.auth.currentUser.email||'',status:'active',lastActionId:eventId,invitationId:hash});tx.set(r(ctx,`teacherClassAccess/${uid}/classes/${accessKey(ct,c)}`),{storageUid:ct,classId:c});}
   return {classId:inv.classId,classIds,storageUid:ct};
  });
 }
 const c=id(data.classId);if(name==='deleteClass'){
  const current=await getDocFromServer(r(ctx,classPath(t,c)));if(!current.exists())return {classId:c};const cls=current.data();
  if(cls.status!=='deleting'){const b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'classDeletionStarted',c);b.update(r(ctx,classPath(t,c)),{status:'deleting',deletionToken:crypto.randomUUID(),lastActionId:eventId});b.set(r(ctx,`deletedClassArchives/${accessKey(t,c)}`),{storageUid:t,classId:c,ownerUid:uid,at:serverTimestamp()});await b.commit();}
  const roster=await getDocs(query(collection(ctx.db,`teachers/${t}/students`),where('classId','==',c)));
  if(roster.docs.some(d=>d.data().status!=='removed')){const cancel=writeBatch(ctx.db),a=log(ctx,cancel,t,c,'classDeletionCancelled',c);cancel.update(r(ctx,classPath(t,c)),{status:'active',deletionToken:'',lastActionId:a});await cancel.commit();throw Object.assign(Error('Sınıfta öğrenci var. Önce öğrencileri taşı veya kaldır.'),{code:'class-not-empty'});}
  const members=await getDocs(collection(ctx.db,`${classPath(t,c)}/teacherMembers`));for(const m of members.docs)if(m.id!==uid)await deleteDoc(r(ctx,`teacherClassAccess/${m.id}/classes/${accessKey(t,c)}`));const finish=writeBatch(ctx.db);finish.delete(r(ctx,`teacherClassAccess/${uid}/classes/${accessKey(t,c)}`));finish.delete(r(ctx,classPath(t,c)));await finish.commit();return {classId:c};
 }
 const cls=await classInfo(ctx,t,c,name==='permanentlyDeleteClass');
 if(name==='inviteTeacher'){const code=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>alphabet[b&31]).join(''),hash=await inviteHash(code),b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'teacherInvited',hash);b.set(r(ctx,`teacherInvitations/${hash}`),{storageUid:t,classId:c,createdBy:uid,createdAt:serverTimestamp(),consumedBy:'',consumedAt:null,revoked:false,lastActionId:eventId});await b.commit();return {code,invitationId:hash};}
 if(name==='revokeTeacherInvitation'){const hash=text(data.invitationId,64),b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'invitationRevoked',hash);b.update(r(ctx,`teacherInvitations/${hash}`),{revoked:true,lastActionId:eventId});await b.commit();return {};}
 if(name==='removeClassTeacher'){const member=id(data.teacherUid),b=writeBatch(ctx.db);if(member===(cls.ownerUid||t)||member===(cls.createdBy||t))throw Error('Sınıf sahibi veya sınıfı oluşturan öğretmen kaldırılamaz.');const eventId=log(ctx,b,t,c,'teacherRemoved',member);b.update(r(ctx,`${classPath(t,c)}/teacherMembers/${member}`),{status:'revoked',lastActionId:eventId});b.delete(r(ctx,`teacherClassAccess/${member}/classes/${accessKey(t,c)}`));await b.commit();return {};}
 if(name==='transferClassOwnership'){const target=id(data.teacherUid),b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'ownershipTransferred',c,{ownerUid:target});b.update(r(ctx,classPath(t,c)),{ownerUid:target,lastActionId:eventId});await b.commit();return {};}
 if(name==='permanentlyDeleteClass'){if(data.confirmName!==cls.className)throw Error('Sınıf adını birebir yazarak onayla.');return permanentlyDelete(ctx,t,c);}
 if(name==='updateClass'){const className=text(data.className,60),config=classGradeConfig({...cls,...data}),b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'classUpdated',c,{className,...config});b.update(r(ctx,classPath(t,c)),{className,...config,lastActionId:eventId});await b.commit();const roster=await getDocs(query(collection(ctx.db,`teachers/${t}/students`),where('classId','==',c),where('status','==','active')));for(const s of roster.docs)await updateStudent(ctx,t,{...s.data(),className,classId:c});return {};}
 if(name==='adjustStudentReward'){const s=id(data.studentId),amount=Number(data.amount),kind=data.kind;if(!Number.isInteger(amount)||!amount||Math.abs(amount)>10000||!['xp','stars'].includes(kind))throw Error('Geçerli bir XP/yıldız değişikliği gir.');return runTransaction(ctx.db,async tx=>{const p=(await tx.get(r(ctx,studentPath(t,s)))).data();if(p.classId!==c||p.status!=='active')throw Error('Öğrenci bu sınıfta değil.');const ref=r(ctx,`${studentPath(t,s)}/learning/summary`),v=(await tx.get(ref)).data(),next=kind==='xp'?(v.teacherXP||0)+amount:(v.stars||0)+amount;if((kind==='xp'&&(v.academicXP??v.totalXP)+next<0)||(kind==='stars'&&next<0))throw Error('Bakiye sıfırın altına inemez.');const eventId=log(ctx,tx,t,c,'rewardAdjusted',s,{kind,amount,reason:text(data.reason,300)});tx.update(ref,{...(kind==='xp'?{teacherXP:next,totalXP:(v.academicXP??v.totalXP)+next}:{stars:next}),lastActionId:eventId});return {};});}
 if(name==='saveClassActivity'){const activityId=data.activityId?id(data.activityId):crypto.randomUUID(),b=writeBatch(ctx.db),eventId=log(ctx,b,t,c,'activitySaved',activityId,{title:text(data.title,100),status:data.status});if(!['planned','active','completed','cancelled'].includes(data.status))throw Error('Geçersiz etkinlik durumu.');b.set(r(ctx,`${classPath(t,c)}/activities/${activityId}`),{title:text(data.title,100),status:data.status,updatedAt:serverTimestamp(),lastActionId:eventId});await b.commit();return {activityId};}
 throw Error(`Desteklenmeyen öğretmen işlemi: ${name}`);
}
