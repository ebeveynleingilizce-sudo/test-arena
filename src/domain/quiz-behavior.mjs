// Reported browser measurements, never an authority for XP or correctness.
export const MAX_BEHAVIOR_MS = 86400000;
export function validBehavior(v) {
  const count = n => Number.isInteger(n) && n >= 0 && n <= 10000;
  const time = n => Number.isInteger(n) && n >= 0 && n <= MAX_BEHAVIOR_MS;
  const list = (a, check) => Array.isArray(a) && a.length === 10 && a.every(check);
  return !!v && time(v.visibleMs) && time(v.hiddenMs) && v.visibleMs + v.hiddenMs <= MAX_BEHAVIOR_MS
    && count(v.exitCount) && list(v.questionMs,time) && list(v.questionChanges,count);
}
export function createBehaviorCollector(now = () => performance.now(), initiallyHidden = false) {
  let last = now(), hidden = initiallyHidden, index = null, stopped = false;
  const data = {visibleMs:0,hiddenMs:0,exitCount:0,questionMs:Array(10).fill(0),questionChanges:Array(10).fill(0)};
  function tick() {
    if(stopped)return;
    const time = now(), delta = Math.min(Math.max(0,Math.round(time-last)),MAX_BEHAVIOR_MS-data.visibleMs-data.hiddenMs); last=time;
    data[hidden?'hiddenMs':'visibleMs'] += delta;
    if(!hidden && index!==null)data.questionMs[index] += delta;
  }
  return {
    question(i) {tick();index=Number.isInteger(i)&&i>=0&&i<10?i:null;},
    visibility(value) {if(stopped)return;tick();if(value&&!hidden)data.exitCount=Math.min(10000,data.exitCount+1);hidden=value;},
    change(i,previous,next) {if(!stopped&&i>=0&&i<10&&previous&&next!==previous)data.questionChanges[i]=Math.min(10000,data.questionChanges[i]+1);},
    stop() {tick();stopped=true;index=null;},
    snapshot() {tick();return {...data,questionMs:[...data.questionMs],questionChanges:[...data.questionChanges]};}
  };
}
export function behaviorReport(quiz,template,streams,submissions) {
  const at = v => v?.toMillis?.() ?? null;
  const valid = streams.filter(v=>validBehavior(v)),start=at(quiz.startedAt),end=at(quiz.completedAt);
  const total = key => valid.reduce((n,v)=>n+v[key],0);
  return {serverDurationMs:start!==null&&end!==null?Math.max(0,end-start):null,
    visibleMs:total('visibleMs'),hiddenMs:total('hiddenMs'),exitCount:total('exitCount'),
    changeCount:valid.reduce((n,v)=>n+v.questionChanges.reduce((a,b)=>a+b,0),0),
    streamCount:valid.length,reported:valid.length>0,
    questions:template.questionIds.map((questionId,i)=>({questionId,number:i+1,
      visibleMs:valid.length?valid.reduce((n,v)=>n+v.questionMs[i],0):null,
      changes:valid.length?valid.reduce((n,v)=>n+v.questionChanges[i],0):null,
      submittedAfterStartMs:start!==null&&at(submissions.find(v=>v.questionId===questionId)?.submittedAt)!==null
        ?Math.max(0,at(submissions.find(v=>v.questionId===questionId).submittedAt)-start):null}))};
}
export function compareTestHistory(history) {
  const rows=history.map(t=>({...t})).sort((a,b)=>(a.startedAt||0)-(b.startedAt||0));
  for(const [i,current] of rows.entries()){
    const previous=rows.slice(0,i).filter(t=>t.status==='completed'&&t.gradeLevel===current.gradeLevel&&t.subject===current.subject&&t.unitId===current.unitId).slice(-3);
    current.previousTestCount=previous.length;
    current.accuracyChange=previous.length>=3&&current.status==='completed'?Math.round(100*(current.correct/current.questionCount-previous.reduce((n,t)=>n+t.correct,0)/previous.reduce((n,t)=>n+t.questionCount,0))):null;
  }
  return rows.reverse();
}
