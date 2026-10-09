import {doc,collection,getDocFromServer,getDocs} from 'firebase/firestore';
import {behaviorReport,compareTestHistory} from '../domain/quiz-behavior.mjs';
const zero=()=>({solved:0,correct:0,wrong:0});
const add=(a,b)=>({solved:a.solved+b.solved,correct:a.correct+b.correct,wrong:a.wrong+b.wrong});
const at=v=>v?.toMillis?.()??null;
function rank(list,field,key){const sorted=[...list].sort((a,b)=>b[field]-a[field]||a.studentId.localeCompare(b.studentId));let rank=0;sorted.forEach((s,i)=>{if(!i||s[field]!==sorted[i-1][field])rank=i+1;s[key]=rank;});}
export async function sparkAnalytics(ctx,t,filter,period){
 const [classes,roster]=await Promise.all([getDocs(collection(ctx.db,`teachers/${t}/classes`)),getDocs(collection(ctx.db,`teachers/${t}/students`))]);
 const students=[],dimensions=new Map(),templates=new Map(),testHistory=[];
 for(const profile of roster.docs.filter(s=>s.data().status==='active')){
  const p=profile.data(),root=`teachers/${t}/students/${profile.id}`;
  const [old,learning,weekly,quizzes,oldDims]=await Promise.all([getDocFromServer(doc(ctx.db,`${root}/analytics/summary`)),getDocFromServer(doc(ctx.db,`${root}/learning/summary`)),getDocFromServer(doc(ctx.db,`${root}/academicWeeks/${period.weekKey}`)),getDocs(collection(ctx.db,`${root}/quizzes`)),getDocs(collection(ctx.db,`${root}/analyticsDimensions`))]);
  const legacy=old.data(),student={studentId:p.studentId,displayName:`${p.firstName} ${p.lastName}`.trim(),classId:p.classId,className:p.className,gradeLevel:p.gradeLevel,overall:legacy?.overall||zero(),weekly:legacy?.weekKey===period.weekKey?legacy.weekly:zero(),academicXP:learning.data()?.academicXP??learning.data()?.totalXP??0,weeklyAcademicXP:weekly.data()?.academicXP||0,lastAnswerAt:legacy?.lastAnswerAt||null,overallRank:0,weeklyRank:0,signals:[]};
  const selected=(!filter.classId||p.classId===filter.classId)&&(!filter.studentId||p.studentId===filter.studentId);
  const historyIds=new Set(filter.studentId===p.studentId?[...quizzes.docs].sort((a,b)=>(at(b.data().startedAt)||0)-(at(a.data().startedAt)||0)).slice(0,30).map(d=>d.id):[]);
  const merge=(key,d)=>{const old=dimensions.get(key)||{...d,overall:zero(),weekly:zero()};dimensions.set(key,{...old,overall:add(old.overall,d.overall),weekly:add(old.weekly,d.weekly)});};
  if(selected)for(const d of oldDims.docs){const v=d.data();merge(d.id,{...v,weekly:v.weekKey===period.weekKey?v.weekly:zero()});}
  for(const quiz of quizzes.docs){
   const templateId=quiz.data().templateId;if(!templates.has(templateId))templates.set(templateId,(await getDocFromServer(doc(ctx.db,`quizTemplates/${templateId}`))).data());
   const tpl=templates.get(templateId),results=await getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/results`));
   if(historyIds.has(quiz.id)&&tpl){
    const [behavior,submissions]=await Promise.all([getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/behavior`)),getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/submissions`))]);
    testHistory.push({testSessionId:quiz.id,gradeLevel:tpl.gradeLevel,subject:tpl.subject,subjectName:tpl.subjectName,unitId:tpl.unitId,unitName:tpl.unitName,packName:tpl.packName,status:quiz.data().status,startedAt:at(quiz.data().startedAt),completedAt:at(quiz.data().completedAt),questionCount:tpl.questionIds.length,correct:quiz.data().correct,wrong:quiz.data().wrong,blank:quiz.data().blank,
      ...behaviorReport(quiz.data(),tpl,behavior.docs.map(d=>d.data()),submissions.docs.map(d=>({questionId:d.id,...d.data()})))});
   }
   for(const result of results.docs){const r=result.data();if(r.skipped)continue;const delta={solved:1,correct:Number(r.isCorrect),wrong:Number(!r.isCorrect)},time=at(r.gradedAt),inWeek=time>=period.startsAt&&time<period.endsAt;
    student.overall=add(student.overall,delta);if(inWeek)student.weekly=add(student.weekly,delta);student.lastAnswerAt=Math.max(student.lastAnswerAt||0,time||0);
    if(selected){const q=tpl.questions.find(q=>q.questionId===result.id);for(const kind of ['subject','unit',...(q?.topic?['topic']:[])]){const key=[kind,tpl.gradeLevel,tpl.subject,...(kind==='subject'?[]:[kind==='unit'?tpl.unitId:q.topic])].join(':');merge(key,{kind,gradeLevel:tpl.gradeLevel,subject:tpl.subject,subjectName:tpl.subjectName,...(kind!=='subject'?{unitId:tpl.unitId,unitName:tpl.unitName}:{}),...(kind==='topic'?{topic:q.topic,topicName:q.topicName}:{}),overall:delta,weekly:inWeek?delta:zero()});}}
   }
  }students.push(student);
 }
 const grouped=classes.docs.map(c=>{const group=students.filter(s=>s.classId===c.id);rank(group,'academicXP','overallRank');rank(group,'weeklyAcademicXP','weeklyRank');
  const volumes=group.map(s=>s.weekly.solved).sort((a,b)=>a-b),median=volumes.length?(volumes[Math.floor((volumes.length-1)/2)]+volumes[Math.floor(volumes.length/2)])/2:0;
  for(const s of group){if(s.overall.solved>=20&&s.overall.correct/s.overall.solved<.6)s.signals.push('En az 20 cevapta başarı %60 altında.');if(s.overall.solved>=20&&s.lastAnswerAt&&period.serverNow-s.lastAnswerAt>=7*86400000)s.signals.push('Son kabul edilen cevap en az 7 gün önce.');const p=roster.docs.find(p=>p.id===s.studentId).data(),created=at(p.createdAt);if(group.length>=3&&median>=10&&period.serverNow-period.startsAt>=3*86400000&&created!==null&&period.serverNow-created>=3*86400000&&s.weekly.solved<median/4)s.signals.push(`Bu hafta ${s.weekly.solved} soru; sınıfın ortanca değeri ${median}.`);}
  return {...c.data(),studentCount:group.length,overall:group.reduce((a,s)=>add(a,s.overall),zero()),weekly:group.reduce((a,s)=>add(a,s.weekly),zero()),academicXP:group.reduce((n,s)=>n+s.academicXP,0),weeklyAcademicXP:group.reduce((n,s)=>n+s.weeklyAcademicXP,0)};
 });
 const selected=students.filter(s=>(!filter.classId||s.classId===filter.classId)&&(!filter.studentId||s.studentId===filter.studentId)),selectedClasses=grouped.filter(c=>!filter.classId||c.classId===filter.classId);
 return {...period,testHistory:compareTestHistory(testHistory),classes:selectedClasses,students:selected,totals:{overall:selected.reduce((a,s)=>add(a,s.overall),zero()),weekly:selected.reduce((a,s)=>add(a,s.weekly),zero()),academicXP:selected.reduce((n,s)=>n+s.academicXP,0),weeklyAcademicXP:selected.reduce((n,s)=>n+s.weeklyAcademicXP,0),studentCount:selected.length,classCount:selectedClasses.length},dimensions:[...dimensions.values()]};
}
