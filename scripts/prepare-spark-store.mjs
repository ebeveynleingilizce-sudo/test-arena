import {createHash} from 'node:crypto';
import {Timestamp} from 'firebase-admin/firestore';
import {arenaPeriod} from '../shared/arena-period.mjs';
// Trusted importer projection only. No credentials/answer keys in browser assets.
export async function prepareSparkStore(db){
  const [trees,pool,keys]=await Promise.all([db.collection('curricula').get(),db.collection('questions').where('status','==','published').where('isDemo','==',false).get(),db.collection('privateQuestionAnswers').get()]);
  const publicFields=['questionId','gradeLevel','subject','unitId','topic','topicName','questionText','content','choices','visual','visualPlacement','sourceDatasetId','status','isDemo'];
  const questions=new Map(pool.docs.map(d=>[d.id,Object.fromEntries(publicFields.filter(k=>k in d.data()).map(k=>[k,d.data()[k]]))])),answers=new Map(keys.docs.map(d=>[d.id,d.data()]));
  const writes=[],activeTemplates=new Set();
  for(const tree of trees.docs){
    const c=tree.data(),subjects=[];
    for(const s of c.subjects){const units=[];
      for(const u of s.units){
        const ids=scope=>[...new Set([...(scope.questionIds||[]),...pool.docs.filter(d=>{const q=d.data();return q.gradeLevel===c.grade&&q.subject===s.id&&q.unitId===u.id&&q.sourceDatasetId===c.sourceDatasetId&&(scope===u||q.topic===scope.id);}).map(d=>d.id)])].filter(id=>questions.has(id)&&answers.has(id)).sort();
        const packs=(list,topic)=>Array.from({length:Math.ceil(list.length/10)},(_,i)=>{
          const selected=list.slice(i*10,i*10+10),packId=`pack-${i+1}`;
          const metadata={active:true,gradeLevel:c.grade,subject:s.id,subjectName:s.name,unitId:u.id,unitName:u.displayName||u.name,topic:topic?.id||'',topicName:topic?.name||'',packId,packName:`Test ${i+1}`,questionIds:selected,choiceIdsByQuestionId:Object.fromEntries(selected.map(id=>[id,questions.get(id).choices.map(c=>c.choiceId)])),questions:selected.map(id=>questions.get(id))};
          const templateId=createHash('sha256').update(JSON.stringify([metadata,selected.map(id=>answers.get(id))])).digest('hex');
          activeTemplates.add(templateId);writes.push([`quizTemplates/${templateId}`,metadata]);
          for(const id of selected)writes.push([`privateQuizKeys/${templateId}/answers/${id}`,answers.get(id)]);
          return {id:packId,name:metadata.packName,count:selected.length,templateId};
        });
        const list=ids(u),theme=s.navigationModel==='theme-test';
        units.push({id:u.id,name:u.name,displayName:u.displayName||u.name,count:list.length,packs:theme?packs(list):[],topics:theme?[]:u.topics.map(t=>{const q=ids(t);return {id:t.id,name:t.name,count:q.length,packs:packs(q,t)};})});
      }
      subjects.push({id:s.id,name:s.name,navigationModel:s.navigationModel,sectionLabel:s.sectionLabel,count:units.reduce((n,u)=>n+u.count,0),units});
    }
    writes.push([`sparkCatalog/${c.grade}`,{grade:c.grade,subjects}]);
  }
  const previous=await db.collection('quizTemplates').get();
  for(const old of previous.docs)if(!activeTemplates.has(old.id))writes.push([old.ref.path,{...old.data(),active:false}]);
  // Trusted weeks are fixed by local import, never by a student's clock.
  const now=new Date();for(let offset=-370;offset<=5*366;offset+=7){const p=arenaPeriod(new Date(now.getTime()+offset*86400000));writes.push([`arenaWeeks/${p.weekKey}`,{startsAt:Timestamp.fromMillis(p.startsAt),endsAt:Timestamp.fromMillis(p.endsAt)}]);}
  for(let i=0;i<writes.length;i+=350){const batch=db.batch();for(const [path,data]of writes.slice(i,i+350))batch.set(db.doc(path),data);await batch.commit();}
  return {grades:trees.size,questions:questions.size};
}
