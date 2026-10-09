import {doc,runTransaction,serverTimestamp} from 'firebase/firestore';
import {validBehavior} from '../domain/quiz-behavior.mjs';
export async function saveQuizBehavior(ctx,p,data) {
  if(!/^[-A-Za-z0-9_]{1,128}$/.test(data.testSessionId)||!/^[-A-Za-z0-9_]{1,64}$/.test(data.streamId)||!validBehavior(data.snapshot))throw Error('Geçersiz davranış kaydı.');
  const root=`teachers/${p.teacherUid}/students/${p.studentId}/quizzes/${data.testSessionId}`;
  const slots=data.slot===undefined?Array.from({length:8},(_,i)=>String(i)):[String(data.slot)];
  for(const slot of slots) {
    if(!/^[0-7]$/.test(slot))throw Error('Geçersiz kayıt alanı.');
    const saved=await runTransaction(ctx.db,async tx=>{
      const target=doc(ctx.db,`${root}/behavior/${slot}`),old=await tx.get(target),v=old.data();
      if(v&&v.streamId!==data.streamId)return false;
      if(v?.revision>=120)throw Error('Bu testin davranış kaydı sınırına ulaşıldı.');
      tx.set(target,{...data.snapshot,streamId:data.streamId,revision:(v?.revision||0)+1,startedAt:v?.startedAt||serverTimestamp(),updatedAt:serverTimestamp()});return true;
    });
    if(saved)return {slot};
  }
  throw Error('Bu testte en fazla 8 tarayıcı kaydı tutulabilir.');
}
