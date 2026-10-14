import {collection,getDocs,query,where} from 'firebase/firestore';

export function summarizePackProgress(sessions){
 const progress={};
 for(const session of sessions){
  if(!session.templateId||session.duelId)continue;
  if(session.status==='completed')progress[session.templateId]='completed';
  else if(session.status==='active'&&progress[session.templateId]!=='completed')progress[session.templateId]='active';
 }
 return progress;
}

export async function readPackProgress(ctx,profile,templateIds){
 const ids=[...new Set(templateIds.filter(Boolean))],sessions=[];
 for(let offset=0;offset<ids.length;offset+=30){
  const snapshot=await getDocs(query(collection(ctx.db,`teachers/${profile.teacherUid}/students/${profile.studentId}/quizzes`),where('templateId','in',ids.slice(offset,offset+30))));
  sessions.push(...snapshot.docs.map(doc=>doc.data()));
 }
 return summarizePackProgress(sessions);
}
