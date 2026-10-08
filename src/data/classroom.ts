import {doc,getDocFromServer,type Firestore} from 'firebase/firestore';
import type {CurriculumSubject} from '../domain/quiz';
import type {ArenaQuestion} from '../domain/classroom.mjs';
export interface ClassroomCatalog {grade:number;subjects:ClassroomSubject[]}
interface Pack {id:string;name:string;templateId?:string;count:number}
interface ClassroomSubject extends Omit<CurriculumSubject,'units'> {units:(Omit<CurriculumSubject['units'][number],'packs'|'topics'> & {packs:Pack[];topics:{id:string;name:string;packs:Pack[]}[]})[]}
export async function classroomCatalog(db:Firestore){
 const snapshots=await Promise.all(Array.from({length:11},(_,i)=>getDocFromServer(doc(db,'sparkCatalog',String(i+2)))));
 return snapshots.filter(s=>s.exists()).map(s=>s.data() as ClassroomCatalog);
}
export async function classroomQuestions(db:Firestore,unit:ClassroomSubject['units'][number],packId:string){
 const packs=[...unit.packs,...unit.topics.flatMap(t=>t.packs)].filter(p=>!packId||p.templateId===packId);
 const questions=new Map<string,ArenaQuestion>();
 // Keep reads bounded in flight even for large question banks.
 for(const pack of packs){
  if(!pack.templateId)continue;
  const template=await getDocFromServer(doc(db,'quizTemplates',pack.templateId));
  if(!template.exists()||!template.data().active)continue;
  for(const question of template.data().questions){
   if(questions.has(question.questionId))continue;
   const key=await getDocFromServer(doc(db,'privateQuizKeys',pack.templateId,'answers',question.questionId));
   if(key.exists()&&question.choices.some((c:{choiceId:string})=>c.choiceId===key.data().correctOptionId))questions.set(question.questionId,{...question,...key.data()});
  }
 }
 return [...questions.values()];
}
