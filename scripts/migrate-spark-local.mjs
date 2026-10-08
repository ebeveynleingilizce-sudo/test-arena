import {existsSync} from 'node:fs';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {arenaPeriod} from '../shared/arena-period.mjs';
import {codeCredentials} from '../src/data/spark.mjs';
import {prepareSparkStore} from './prepare-spark-store.mjs';

// One-time, idempotent LOCAL conversion. Existing codes and all history remain.
if(process.env.GCLOUD_PROJECT!=='demo-test-arena'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Only demo-test-arena local emulators are permitted.');
const app=initializeApp({projectId:'demo-test-arena'}),db=getFirestore(app),auth=getAuth(app);
async function snapshot(){const names=['questions','privateQuestionAnswers','teachers'];const counts={};for(const n of names)counts[n]=(await db.collection(n).get()).size;for(const n of ['students','classes','awardedQuestions'])counts[n]=(await db.collectionGroup(n).get()).size;const learning=await db.collectionGroup('learning').get();counts.totalXP=learning.docs.reduce((n,d)=>n+(d.id==='summary'?(d.data().totalXP||0):0),0);return counts;}
const before=await snapshot(),profiles=await db.collectionGroup('students').get(),period=arenaPeriod(new Date());let migrated=0,alreadyBound=0,withoutCode=0;
for(const doc of profiles.docs){
 const p=doc.data(),t=doc.ref.parent.parent.id,s=doc.id;
 if(p.status!=='active')continue;
 const oldBinding=p.authUid?await db.doc(`studentBindings/${p.authUid}`).get():null;
 if(oldBinding?.exists&&oldBinding.data().teacherUid===t&&oldBinding.data().studentId===s&&oldBinding.data().version===p.credentialVersion){alreadyBound++;continue;}
 if(!existsSync(new URL('../.firebase/emulator-data/before-spark-migration/firebase-export-metadata.json',import.meta.url)))throw Error('Export Auth + Firestore before migrating existing accounts.');
 const saved=await db.doc(`teachers/${t}/studentCodes/${s}`).get();
 if(!saved.exists){withoutCode++;continue;}
 const credentials=codeCredentials(saved.data().code),version=(p.credentialVersion||0)+1;
 const ticket=await db.doc(`codeTickets/${credentials.code}`).get();
 if(ticket.exists&&(ticket.data().teacherUid!==t||ticket.data().studentId!==s))throw Error('Code ownership conflict; migration stopped without deleting data.');
 let user;try{user=await auth.getUserByEmail(credentials.email);}catch(e){if(e.code!=='auth/user-not-found')throw e;user=await auth.createUser({email:credentials.email,password:credentials.password});}
 const binding=await db.doc(`studentBindings/${user.uid}`).get();
 if(binding.exists&&(binding.data().teacherUid!==t||binding.data().studentId!==s))throw Error('Auth ownership conflict; migration stopped without deleting data.');
 const summaryRef=doc.ref.collection('learning').doc('summary'),summary=await summaryRef.get();
 const values=summary.data()||{},xp=values.totalXP??values.academicXP??0;
 const week=await doc.ref.collection('academicWeeks').doc(period.weekKey).get();
 const batch=db.batch();
 batch.set(db.doc(`roles/${t}`),{role:'teacher'},{merge:true});
 batch.set(db.doc(`codeTickets/${credentials.code}`),{teacherUid:t,studentId:s,version,email:credentials.email});
 batch.set(db.doc(`enrollmentProofs/${user.uid}`),{teacherUid:t,studentId:s,version,code:credentials.code});
 batch.set(db.doc(`studentBindings/${user.uid}`),{teacherUid:t,studentId:s,version});
 batch.set(db.doc(`roles/${user.uid}`),{role:'student'});
 batch.update(doc.ref,{authUid:user.uid,credentialVersion:version});
 batch.set(saved.ref,{credentialVersion:version},{merge:true});
 batch.set(summaryRef,{totalXP:xp,academicXP:values.academicXP??xp,lastAwardQuestionId:values.lastAwardQuestionId||'',answeredCount:values.answeredCount||0,correctCount:values.correctCount||0,wrongCount:values.wrongCount||0},{merge:true});
 batch.set(db.doc(`teachers/${t}/classes/${p.classId}/classMembers/${s}`),{studentId:s});
 batch.set(db.doc(`teachers/${t}/classes/${p.classId}/leaderboard/${s}`),{studentId:s,classId:p.classId,displayName:`${p.firstName} ${p.lastName}`,academicXP:xp,weeklyAcademicXP:week.data()?.academicXP||0,weekKey:period.weekKey,lastAwardQuestionId:values.lastAwardQuestionId||''});
 await batch.commit();migrated++;
}
await prepareSparkStore(db);
const after=await snapshot();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Preservation check failed; retain the migration backup.');
console.log(JSON.stringify({before,after,migrated,alreadyBound,withoutCode}));
