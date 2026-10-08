import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parsePresentation, resolveStimulus } from '../functions/visuals/contract.mjs';
import { projectId } from './helpers.mjs';

export const examples = JSON.parse(readFileSync(new URL('./fixtures/visual-questions.json',import.meta.url),'utf8'));
export async function visualFixture(source=examples,questionCount=10) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || projectId !== 'demo-test-arena') throw new Error('Local emulator only.');
  const tag = randomUUID(), topic = 'visual-' + tag, topicName = 'Görsel Motor Testi ' + tag.slice(0,8);
  const app = initializeApp({projectId}, 'visual-' + tag), db = getFirestore(app);
  const records = source.questions.map(q => ({question:{
    questionId:'demo_visual_' + tag + '_' + q.id, gradeLevel:2,subject:'matematik',subjectName:'Matematik',
    topic,topicName,status:'published',isDemo:true,
    ...parsePresentation(q.question,q.options.map(o=>({choiceId:o.id,text:o.text,visual:o.visual})),resolveStimulus(q.visual,q.stimulusId,source.stimuli),q.visualPlacement)
  },answer:{correctChoiceId:q.correctOptionId,explanation:q.explanation}}));
  const batch=db.batch();
  for (const r of records) {batch.create(db.doc('questions/'+r.question.questionId),r.question);batch.create(db.doc('privateQuestionAnswers/'+r.question.questionId),r.answer);}
  await batch.commit();
  return {records,topic,topicName,db,params:{gradeLevel:2,subject:'matematik',topic,questionCount},async close(){
    const batch=db.batch();for(const r of records){batch.delete(db.doc('questions/'+r.question.questionId));batch.delete(db.doc('privateQuestionAnswers/'+r.question.questionId));}
    await batch.commit();await deleteApp(app);
  }};
}
