import {doc,collection,query,where,orderBy,limit,getDocFromServer,getDocs} from 'firebase/firestore';
import {behaviorReport,compareTestHistory} from '../domain/quiz-behavior.mjs';
import {sharePendingRead} from './pending-read.mjs';
import {reportReadQueue} from './report-request.mjs';
import {cachedStudentOverview} from './report-cache.mjs';
import {measuredRead,recordReadMeasurement} from './read-measurement.mjs';
const zero=()=>({solved:0,correct:0,wrong:0});
const add=(a,b)=>({solved:a.solved+b.solved,correct:a.correct+b.correct,wrong:a.wrong+b.wrong,...(a.blank!==undefined||b.blank!==undefined?{blank:(a.blank||0)+(b.blank||0)}:{})});
const at=v=>v?.toMillis?.()??null;
function summaryCounts(value){
 if(!value||![value.answeredCount,value.correctCount,value.wrongCount].every(n=>Number.isSafeInteger(n)&&n>=0)||value.answeredCount!==value.correctCount+value.wrongCount)return null;
 // Positive counters without the grading receipt belong to an older layout.
 if(value.answeredCount&&!value.lastResultSessionId)return null;
 return {solved:value.answeredCount,correct:value.correctCount,wrong:value.wrongCount};
}
function rank(list,field,key){const sorted=[...list].sort((a,b)=>b[field]-a[field]||a.studentId.localeCompare(b.studentId));let rank=0;sorted.forEach((s,i)=>{if(!i||s[field]!==sorted[i-1][field])rank=i+1;s[key]=rank;});}
export async function sparkAnalytics(ctx,t,filter,period,accessible){
 const overallOnly=filter.summaryPeriod==='overall'&&filter.includeDimensions===false&&filter.includeHistory===false;
 const reads=reportReadQueue(ctx.signal,overallOnly?24:6);const read=work=>reads.read(()=>measuredRead(ctx.db,work));
 recordReadMeasurement(ctx.db,{type:'report-open',listeners:0});
 try{
 if(filter.gradeLevel!==undefined&&(!Number.isInteger(filter.gradeLevel)||filter.gradeLevel<1||filter.gradeLevel>12))throw Error('Geçersiz kademe filtresi.');
 const gradeMatches=p=>filter.gradeLevel===undefined||p.gradeLevel===filter.gradeLevel;
 const classList=(accessible||[]).filter(c=>(!filter.classId||c.classId===filter.classId)&&(!filter.storageUid||c.storageUid===filter.storageUid));
 const classes={docs:classList.map(c=>({id:c.classId,data:()=>c}))};
 const rosters=await Promise.all(classList.map(c=>read(()=>getDocs(query(collection(ctx.db,`teachers/${c.storageUid}/students`),where('classId','==',c.classId)))))),roster={docs:rosters.flatMap(r=>r.docs)};
 const dimensions=new Map(),templates=new Map(),testHistory=[];
 const dimensionQuery=path=>{const scope=collection(ctx.db,path),constraints=[];if(filter.subject)constraints.push(where('subject','==',filter.subject));if(filter.unitId)constraints.push(where('unitId','==',filter.unitId));if(filter.gradeLevel!==undefined)constraints.push(where('gradeLevel','==',filter.gradeLevel));return constraints.length?query(scope,...constraints):scope;};
 const buildStudent=async profile=>{
  const p=profile.data(),root=`teachers/${p.teacherUid}/students/${profile.id}`;
  const selected=(!filter.classId||p.classId===filter.classId)&&(!filter.studentId||p.studentId===filter.studentId)&&gradeMatches(p);
  const details=selected&&filter.includeDimensions!==false;
  const [old,learning,weekly,oldDims]=await Promise.all([read(()=>getDocFromServer(doc(ctx.db,`${root}/analytics/summary`))),read(()=>getDocFromServer(doc(ctx.db,`${root}/learning/summary`))),read(()=>getDocFromServer(doc(ctx.db,`${root}/academicWeeks/${period.weekKey}`))),details?read(()=>getDocs(dimensionQuery(`${root}/analyticsDimensions`))):Promise.resolve({docs:[]})]);
  const legacy=old.data(),student={storageUid:p.teacherUid,studentId:p.studentId,displayName:`${p.firstName} ${p.lastName}`.trim(),classId:p.classId,className:p.className,gradeLevel:p.gradeLevel,overall:legacy?.overall||zero(),weekly:legacy?.weekKey===period.weekKey?legacy.weekly:zero(),academicXP:learning.data()?.academicXP??learning.data()?.totalXP??0,weeklyAcademicXP:weekly.data()?.academicXP||0,lastAnswerAt:legacy?.lastAnswerAt||null,overallRank:0,weeklyRank:0,signals:[]};
  const merge=(key,d)=>{const old=dimensions.get(key)||{...d,overall:zero(),weekly:zero()};dimensions.set(key,{...old,overall:add(old.overall,d.overall),weekly:add(old.weekly,d.weekly)});};
  // XP ranks still use every class member. Unselected peers need no history or
  // dimensions in a selected-student / grade report.
  if(!gradeMatches(p))return student;
  // Production activation is explicit and must accompany the approved backend,
  // rules and historical coverage rollout. A Hosting-only release stays safe.
  const projectionEnabled=ctx.emulator===true||import.meta.env?.VITE_NATIVE_PERFORMANCE==='true';
  const projection=overallOnly||!projectionEnabled||filter.useNativePerformance===false?null:(await read(()=>getDocFromServer(doc(ctx.db,`${root}/nativePerformance/summary`)))).data();
  const trusted=summaryCounts(learning.data());
  const usable=projection?.version===1&&projection.baselineComplete===true&&trusted
    &&['solved','correct','wrong'].every(k=>projection.overall?.[k]===trusted[k])
    &&projection.lastResultSessionId===learning.data()?.lastResultSessionId
    &&projection.lastResultQuestionId===learning.data()?.lastResultQuestionId;
  if(usable&&filter.includeHistory===false){
   student.overall=add(student.overall,projection.overall);
   student.weekly=add(student.weekly,projection.weekKey===period.weekKey?projection.weekly:zero());
   student.lastAnswerAt=Math.max(student.lastAnswerAt||0,projection.lastAnswerAt||0)||null;
   if(details){
    for(const d of oldDims.docs){const v=d.data();merge(d.id,{...v,weekly:v.weekKey===period.weekKey?v.weekly:zero()});}
    const values=await read(()=>getDocs(dimensionQuery(`${root}/nativePerformanceDimensions`)));
    for(const d of values.docs){const v=d.data();merge(d.id,{...v,weekly:v.weekKey===period.weekKey?v.weekly:zero()});}
   }
   return student;
  }
  const counters=overallOnly?summaryCounts(learning.data()):null;
  let latestReceipt=false;
  if(counters){
   student.overall=add(student.overall,counters);student.weekly=zero();
   if(!counters.solved)return student;
   const value=learning.data();
   if(value.lastResultSessionId&&value.lastResultQuestionId){
    const result=(await read(()=>getDocFromServer(doc(ctx.db,`${root}/quizzes/${value.lastResultSessionId}/results/${value.lastResultQuestionId}`)))).data();
    if(result&&!result.skipped&&at(result.gradedAt)!==null){student.lastAnswerAt=Math.max(student.lastAnswerAt||0,at(result.gradedAt));latestReceipt=true;}
    else if(result?.skipped){
     const latest=await read(()=>getDocs(query(collection(ctx.db,`${root}/quizzes/${value.lastResultSessionId}/results`),where('skipped','==',false),orderBy('gradedAt','desc'),limit(1))));
     student.lastAnswerAt=Math.max(student.lastAnswerAt||0,at(latest.docs[0]?.data().gradedAt)||0)||null;
    }
   }
   if(latestReceipt)return student;
  }
  // Older summaries, or a last receipt that was a blank, retain the exact
  // history calculation. Normal overview requests never enumerate old tests.
  const quizzes=await read(()=>getDocs(collection(ctx.db,`${root}/quizzes`)));
  const historyIds=new Set(filter.includeHistory!==false&&filter.studentId===p.studentId?[...quizzes.docs].sort((a,b)=>(at(b.data().startedAt)||0)-(at(a.data().startedAt)||0)).slice(0,30).map(d=>d.id):[]);
  if(selected)for(const d of oldDims.docs){const v=d.data();merge(d.id,{...v,weekly:v.weekKey===period.weekKey?v.weekly:zero()});}
  await Promise.all(quizzes.docs.map(async quiz=>{
   const templateId=quiz.data().templateId;if((details||historyIds.has(quiz.id))&&!templates.has(templateId)){
    // Store the promise before awaiting it: parallel tests using the same pack
    // must not each queue a new Firestore read.
    templates.set(templateId,sharePendingRead(ctx.db,ctx.auth.currentUser.uid+':template:'+templateId,()=>read(()=>getDocFromServer(doc(ctx.db,`quizTemplates/${templateId}`)))).then(s=>s.data()));
   }
   const tpl=await templates.get(templateId),session=quiz.data(),started=at(session.startedAt),completed=at(session.completedAt);
   const quizDetails=details&&(!filter.subject||tpl?.subject===filter.subject)&&(!filter.unitId||tpl?.unitId===filter.unitId);
   const sameWeek=started!==null&&started>=period.startsAt&&started<period.endsAt&&(completed===null?period.serverNow<period.endsAt:completed<period.endsAt);
   const outsideWeek=completed!==null&&completed<period.startsAt||started!==null&&started>=period.endsAt;
   if(!quizDetails){
    const counts={solved:session.correct+session.wrong,correct:session.correct,wrong:session.wrong};
    if(!counters)student.overall=add(student.overall,counts);
    if(sameWeek)student.weekly=add(student.weekly,counts);
    // A completed test cannot contain a graded answer later than completion.
    // With a trusted summary, only newer completions or open tests can improve
    // the candidate recovered from a last receipt that was blank.
    if(counts.solved&&(!counters||completed===null||completed>=(student.lastAnswerAt||0))){
     const latest=await read(()=>getDocs(query(collection(ctx.db,`${root}/quizzes/${quiz.id}/results`),where('skipped','==',false),orderBy('gradedAt','desc'),limit(1))));
     student.lastAnswerAt=Math.max(student.lastAnswerAt||0,at(latest.docs[0]?.data().gradedAt)||0);
    }
   }
   const results=quizDetails||!overallOnly&&!sameWeek&&!outsideWeek?await read(()=>getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/results`))):{docs:[]};
   if(historyIds.has(quiz.id)&&tpl){
    const [behavior,submissions]=await Promise.all([read(()=>getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/behavior`))),read(()=>getDocs(collection(ctx.db,`${root}/quizzes/${quiz.id}/submissions`)))]);
    testHistory.push({testSessionId:quiz.id,gradeLevel:tpl.gradeLevel,subject:tpl.subject,subjectName:tpl.subjectName,unitId:tpl.unitId,unitName:tpl.unitName,packName:tpl.packName,status:quiz.data().status,startedAt:at(quiz.data().startedAt),completedAt:at(quiz.data().completedAt),questionCount:tpl.questionIds.length,correct:quiz.data().correct,wrong:quiz.data().wrong,blank:quiz.data().blank,
      ...behaviorReport(quiz.data(),tpl,behavior.docs.map(d=>d.data()),submissions.docs.map(d=>({questionId:d.id,...d.data()})))});
   }
   for(const result of results.docs){const r=result.data();if(r.skipped)continue;const delta={solved:1,correct:Number(r.isCorrect),wrong:Number(!r.isCorrect)},time=at(r.gradedAt),inWeek=time>=period.startsAt&&time<period.endsAt;
    if(quizDetails)student.overall=add(student.overall,delta);if(inWeek&&(quizDetails||!sameWeek&&!outsideWeek))student.weekly=add(student.weekly,delta);student.lastAnswerAt=Math.max(student.lastAnswerAt||0,time||0);
    if(quizDetails){const q=tpl.questions.find(q=>q.questionId===result.id);for(const kind of ['subject','unit',...(q?.topic?['topic']:[])]){const key=[kind,tpl.gradeLevel,tpl.subject,...(kind==='subject'?[]:[kind==='unit'?tpl.unitId:q.topic])].join(':');merge(key,{kind,gradeLevel:tpl.gradeLevel,subject:tpl.subject,subjectName:tpl.subjectName,...(kind!=='subject'?{unitId:tpl.unitId,unitName:tpl.unitName}:{}),...(kind==='topic'?{topic:q.topic,topicName:q.topicName}:{}),overall:delta,weekly:inWeek?delta:zero()});}}
   }
  }));return student;
 };
 const students=await Promise.all(roster.docs.filter(s=>s.data().status==='active').map(profile=>{
  if(!overallOnly||filter.cacheKey===undefined)return buildStudent(profile);
  const p=profile.data(),cls=classList.find(c=>c.classId===p.classId&&c.storageUid===p.teacherUid);
  return cachedStudentOverview(ctx.db,ctx.auth.currentUser.uid,['student-overview',p.teacherUid,profile.id,p.classId,p.gradeLevel,p.firstName,p.lastName,p.lastActionId,cls?.lastActionId,filter.cacheKey,period.weekKey],()=>buildStudent(profile));
 }));
 const grouped=classes.docs.map(c=>{const all=students.filter(s=>s.classId===c.id&&s.storageUid===c.data().storageUid);rank(all,'academicXP','overallRank');rank(all,'weeklyAcademicXP','weeklyRank');const group=all.filter(gradeMatches);
  const volumes=group.map(s=>s.weekly.solved).sort((a,b)=>a-b),median=volumes.length?(volumes[Math.floor((volumes.length-1)/2)]+volumes[Math.floor(volumes.length/2)])/2:0;
  for(const s of group){if(s.overall.solved>=20&&s.overall.correct/s.overall.solved<.6)s.signals.push('En az 20 cevapta başarı %60 altında.');if(s.overall.solved>=20&&s.lastAnswerAt&&period.serverNow-s.lastAnswerAt>=7*86400000)s.signals.push('Son kabul edilen cevap en az 7 gün önce.');const p=roster.docs.find(p=>p.id===s.studentId&&p.data().teacherUid===s.storageUid).data(),created=at(p.createdAt);if(!overallOnly&&group.length>=3&&median>=10&&period.serverNow-period.startsAt>=3*86400000&&created!==null&&period.serverNow-created>=3*86400000&&s.weekly.solved<median/4)s.signals.push(`Bu hafta ${s.weekly.solved} soru; sınıfın ortanca değeri ${median}.`);}
  return {...c.data(),studentCount:group.length,overall:group.reduce((a,s)=>add(a,s.overall),zero()),weekly:group.reduce((a,s)=>add(a,s.weekly),zero()),academicXP:group.reduce((n,s)=>n+s.academicXP,0),weeklyAcademicXP:group.reduce((n,s)=>n+s.weeklyAcademicXP,0)};
 });
 const selected=students.filter(s=>(!filter.classId||s.classId===filter.classId)&&(!filter.studentId||s.studentId===filter.studentId)&&gradeMatches(s)),selectedClasses=grouped.filter(c=>!filter.classId||c.classId===filter.classId);
 return {...period,availablePeriods:overallOnly?['overall']:['overall','weekly'],testHistory:compareTestHistory(testHistory),classes:selectedClasses,students:selected,totals:{overall:selected.reduce((a,s)=>add(a,s.overall),zero()),weekly:selected.reduce((a,s)=>add(a,s.weekly),zero()),academicXP:selected.reduce((n,s)=>n+s.academicXP,0),weeklyAcademicXP:selected.reduce((n,s)=>n+s.weeklyAcademicXP,0),studentCount:selected.length,classCount:selectedClasses.length},dimensions:[...dimensions.values()].filter(d=>(!filter.subject||d.subject===filter.subject)&&(!filter.unitId||d.unitId===filter.unitId)).map(d=>filter.unitId&&d.kind==='unit'?{...d,kind:'subject'}:d)};
 }finally{reads.dispose();recordReadMeasurement(ctx.db,{type:'report-close',aborted:ctx.signal?.aborted===true,listeners:0});}
}
