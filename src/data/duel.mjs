import {collection,doc,getDocFromServer,onSnapshot,query,where,runTransaction,setDoc,updateDoc,serverTimestamp} from 'firebase/firestore';
const root=p=>`teachers/${p.teacherUid}/classes/${p.classId}`;
export const roundSeconds=30;
export const duelStart=d=>d.acceptedAt?.toMillis()+10000;
export const duelEnd=d=>duelStart(d)+300000;
export function duelScore(d,answers,s){return answers.filter(a=>a.studentId===s&&a.isCorrect).reduce((n,a)=>n+1000+Math.max(0,300-Math.floor((a.submittedAt.toMillis()-duelStart(d)-a.index*30000)/1000)*10),0);}
export function watchLobby(db,p,next,error){
 const path=root(p),state={presence:[],duels:[],busyDuels:[]};const emit=()=>next({...state});
 const stops=[onSnapshot(collection(db,`${path}/presence`),s=>{state.presence=s.docs.map(d=>({...d.data(),studentId:d.id}));emit();},error),
 onSnapshot(query(collection(db,`${path}/duels`),where('participants','array-contains',p.studentId)),s=>{state.duels=s.docs.map(d=>({...d.data(),id:d.id}));emit();},error),
 onSnapshot(query(collection(db,`${path}/duels`),where('status','in',['pending','active'])),s=>{state.busyDuels=s.docs.map(d=>({...d.data(),id:d.id}));emit();},error)];return()=>stops.forEach(s=>s());
}
export function watchAnswers(db,p,id,next,error){return onSnapshot(collection(db,`${root(p)}/duels/${id}/answers`),s=>next(s.docs.map(d=>d.data())),error);}
export async function heartbeat(db,p){await setDoc(doc(db,`${root(p)}/presence/${p.studentId}`),{at:serverTimestamp()});}
export async function closeExpired(db,p,duels,now){for(const d of duels){const done=d.status==='pending'&&d.createdAt?.toMillis()+60000<=now||d.status==='active'&&d.acceptedAt&&duelEnd(d)<=now;if(done)await updateDoc(doc(db,`${root(p)}/duels/${d.id}`),{status:d.status==='pending'?'expired':'completed'});}}
export async function invite(db,p,to,templateId){
 const id=crypto.randomUUID(),path=root(p);
 await runTransaction(db,async tx=>{
  const locks=await Promise.all([p.studentId,to].map(s=>tx.get(doc(db,`${path}/duelSlots/${s}`))));
  for(const lock of locks)if(lock.exists()){const old=(await tx.get(doc(db,`${path}/duels/${lock.data().duelId}`))).data();if(old && (old.status==='pending' ? old.createdAt.toMillis()+60000 : old.status==='active' ? duelEnd(old) : 0)>Date.now())throw Error('Öğrencilerden biri meşgul.');}
  tx.set(doc(db,`${path}/duels/${id}`),{participants:[p.studentId,to],from:p.studentId,to,templateId,status:'pending',createdAt:serverTimestamp(),acceptedAt:null});
  for(const s of [p.studentId,to])tx.set(doc(db,`${path}/duelSlots/${s}`),{duelId:id});
 });return id;
}
export async function respond(db,p,id,accept){
 const path=root(p),ref=doc(db,`${path}/duels/${id}`);
 await runTransaction(db,async tx=>{
  const d=(await tx.get(ref)).data();if(!d||d.status!=='pending')throw Error('Davet artık geçerli değil.');
  tx.update(ref,{status:accept?'active':'declined',acceptedAt:accept?serverTimestamp():null});
 });
}
export async function publishAnswer(db,p,d,index){
 const sessionId=`${d.id}-${p.studentId}`,q=(await getDocFromServer(doc(db,`quizTemplates/${d.templateId}`))).data().questionIds[index];
 const path=`teachers/${p.teacherUid}/students/${p.studentId}/quizzes/${sessionId}`;
 const [result,submission]=await Promise.all([getDocFromServer(doc(db,`${path}/results/${q}`)),getDocFromServer(doc(db,`${path}/submissions/${q}`))]);
 if(!result.exists())return;
 const ref=doc(db,`${root(p)}/duels/${d.id}/answers/${p.studentId}-${index}`);
 if((await getDocFromServer(ref)).exists())return;
 await setDoc(ref,{studentId:p.studentId,index,isCorrect:result.data().isCorrect,submittedAt:submission.data().submittedAt});
}
