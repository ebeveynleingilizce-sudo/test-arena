import {doc,collection,getDoc,getDocs,setDoc,runTransaction,serverTimestamp} from 'firebase/firestore';
const root=(t,s)=>`teachers/${t}/students/${s}`;
const quiz=(t,s,id)=>`${root(t,s)}/quizzes/${id}`;
export async function startQuiz(db,t,s,id,templateId) {
  const existing=await getDoc(doc(db,quiz(t,s,id)));
  if(existing.exists()) return existing.data();
  const profile=(await getDoc(doc(db,root(t,s)))).data();
  await setDoc(doc(db,quiz(t,s,id)),{templateId,classId:profile.classId,resolved:0,correct:0,wrong:0,blank:0,lastQuestionId:'',status:'active',startedAt:serverTimestamp(),completedAt:null});
  return (await getDoc(doc(db,quiz(t,s,id)))).data();
}
export async function submitQuiz(db,t,s,id,q,selectedChoiceId) {
  return setDoc(doc(db,`${quiz(t,s,id)}/submissions/${q}`),{selectedChoiceId,submittedAt:serverTimestamp()});
}
export async function gradeQuiz(db,t,s,id,q) {
  const path=quiz(t,s,id), result=doc(db,`${path}/results/${q}`);
  const submission=(await getDoc(doc(db,`${path}/submissions/${q}`))).data();
  const skipped=submission?.selectedChoiceId==='';
  for(let retry=0;retry<3;retry++) {
    for(const isCorrect of skipped?[false]:[true,false]) {
      try { return await runTransaction(db,async tx=>{
        const [old,test]=await Promise.all([tx.get(result),tx.get(doc(db,path))]);
        if(old.exists()) return old.data();
        const data=test.data(),resolved=data.resolved+1;
        tx.set(result,{isCorrect,skipped,gradedAt:serverTimestamp()});
        tx.update(doc(db,path),{resolved,correct:data.correct+Number(isCorrect),wrong:data.wrong+Number(!isCorrect&&!skipped),blank:data.blank+Number(skipped),lastQuestionId:q,status:resolved===10?'completed':'active',completedAt:resolved===10?serverTimestamp():null});
        return {isCorrect,skipped};
      }); } catch(error) { if(!['permission-denied','aborted'].includes(error.code)) throw error; }
    }
  }
  throw Error('Result denied; no trusted result recorded');
}
export async function awardQuiz(db,t,s,id,q,weekKey,displayWeekKey=weekKey) {
  const base=root(t,s),award=doc(db,`${base}/awardedQuestions/${q}`);
  for(let retry=0;retry<3;retry++) {
    try { return await runTransaction(db,async tx=>{
      const summary=doc(db,`${base}/learning/summary`),weekly=doc(db,`${base}/academicWeeks/${weekKey}`);
      const [old,total,week,profile,currentWeek]=await Promise.all([tx.get(award),tx.get(summary),tx.get(weekly),tx.get(doc(db,base)),
        weekKey===displayWeekKey?Promise.resolve(null):tx.get(doc(db,`${base}/academicWeeks/${displayWeekKey}`))]);
      if(old.exists()) return 0;
      const academicXP=total.data().totalXP+1,weeklyAcademicXP=(week.data()?.academicXP||0)+1;
      const classId=profile.data().classId;
      tx.set(award,{testSessionId:id,weekKey,xp:1,awardedAt:serverTimestamp()});
      tx.update(summary,{totalXP:academicXP,academicXP,lastAwardQuestionId:q});
      tx.set(weekly,{academicXP:weeklyAcademicXP,lastAwardQuestionId:q});
      tx.set(doc(db,`teachers/${t}/classes/${classId}/leaderboard/${s}`),{studentId:s,classId,academicXP,
        weeklyAcademicXP:weekKey===displayWeekKey?weeklyAcademicXP:currentWeek.data()?.academicXP||0,
        weekKey:displayWeekKey,lastAwardQuestionId:q});
      return 1;
    }); } catch(error) {
      if(!['permission-denied','aborted'].includes(error.code)) throw error;
      if((await getDoc(award)).exists()) return 0;
    }
  }
  throw Error('Award denied; no XP increment confirmed');
}
export async function readArena(db,t,c,weekKey) {
  const snapshot=await getDocs(collection(db,`teachers/${t}/classes/${c}/leaderboard`));
  const rows=snapshot.docs.map(d=>({...d.data(),weeklyAcademicXP:d.data().weekKey===weekKey?d.data().weeklyAcademicXP:0}));
  const rank=field=>{
    const sorted=rows.map(r=>({...r})).sort((a,b)=>b[field]-a[field]||a.studentId.localeCompare(b.studentId));
    let position=0;
    return sorted.map((r,i)=>{if(!i||r[field]!==sorted[i-1][field])position=i+1;return {...r,rank:position};});
  };
  return {overall:rank('academicXP'),weekly:rank('weeklyAcademicXP')};
}
