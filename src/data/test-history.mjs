import {collection,doc,query,orderBy,documentId,limit,startAfter,Timestamp,getDocFromServer,getDocs} from 'firebase/firestore';
import {behaviorReport,compareTestHistory} from '../domain/quiz-behavior.mjs';
import {readQuizTemplate} from './quiz-template.mjs';
const id=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(v))throw Error('Geçersiz kimlik.');return v;};
const at=v=>v?.toMillis?.()??null;
export async function testHistoryPage(ctx,data){
 const t=id(data.storageUid||ctx.auth.currentUser.uid),s=id(data.studentId),root=`teachers/${t}/students/${s}`;
 // A current authorized server read is required on every page, including after
 // teacher access is revoked. A cursor cannot grant access to another student.
 await getDocFromServer(doc(ctx.db,root));
 const clauses=[orderBy('startedAt','desc'),orderBy(documentId(),'desc')];
 if(data.cursor){if(!Number.isSafeInteger(data.cursor.at))throw Error('Geçersiz sayfa.');clauses.push(startAfter(Timestamp.fromMillis(data.cursor.at),id(data.cursor.id)));}
 const snapshot=await getDocs(query(collection(ctx.db,`${root}/quizzes`),...clauses,limit(11))),docs=snapshot.docs.slice(0,10),history=[];
 for(const quiz of docs){
  const q=quiz.data(),tpl=await readQuizTemplate(ctx.db,q.templateId,ctx.auth.currentUser.uid);
  const [behavior,submissions]=await Promise.all([getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/behavior`)),getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/submissions`))]);
  history.push({testSessionId:quiz.id,gradeLevel:tpl.gradeLevel,subject:tpl.subject,subjectName:tpl.subjectName,unitId:tpl.unitId,unitName:tpl.unitName,packName:tpl.packName,status:q.status,startedAt:at(q.startedAt),completedAt:at(q.completedAt),questionCount:tpl.questionIds.length,correct:q.correct,wrong:q.wrong,blank:q.blank,...behaviorReport(q,tpl,behavior.docs.map(d=>d.data()),submissions.docs.map(d=>({questionId:d.id,...d.data()})))});
 }
 const last=docs.at(-1);
 return {history:compareTestHistory(history),cursor:snapshot.size>10?{at:at(last.data().startedAt),id:last.id}:null};
}
