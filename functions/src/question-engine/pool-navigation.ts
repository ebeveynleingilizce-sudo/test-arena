import type { DocumentData } from 'firebase-admin/firestore';

interface PoolScope {grade:number;subjectId:string;unitId:string;topicId?:string;sourceDatasetId?:string}
// Published, server-validated prepared banks can extend an exact curriculum scope.
// Navigation remains unchanged; source, grade, subject, unit and topic must match.
export function poolScopeIds(curatedIds:string[],questions:DocumentData[],scope:PoolScope):string[] {
  return [...new Set([...curatedIds,...questions.filter(q=>(q.source==='ai_verified'||!!scope.sourceDatasetId&&q.sourceDatasetId===scope.sourceDatasetId)&&q.status==='published'&&q.isDemo===false&&
    q.gradeLevel===scope.grade&&q.subject===scope.subjectId&&q.unitId===scope.unitId&&
    (scope.topicId===undefined||q.topic===scope.topicId)).map(q=>q.questionId)])];
}
export function poolNavigation(tree:DocumentData,questions:DocumentData[]):DocumentData {
  return {...tree,subjects:tree.subjects.map((s:DocumentData)=>({...s,units:s.units.map((u:DocumentData)=>({...u,
    questionIds:poolScopeIds(u.questionIds,questions,{grade:tree.grade,subjectId:s.id,unitId:u.id,sourceDatasetId:tree.sourceDatasetId}),
    topics:u.topics.map((t:DocumentData)=>({...t,questionIds:poolScopeIds(t.questionIds,questions,
      {grade:tree.grade,subjectId:s.id,unitId:u.id,topicId:t.id,sourceDatasetId:tree.sourceDatasetId})}))
  }))}))};
}
