import { initializeApp, getApps, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { loadCurriculumBank } from './curriculum-bank.mjs';

export async function seedCurriculum({navigationOnly=false}={}) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== 'demo-test-arena') throw new Error('Only localhost demo emulator allowed.');
  const app = getApps().find(a => a.name === 'curriculum-seed') || initializeApp({ projectId: 'demo-test-arena' }, 'curriculum-seed'), db = getFirestore(app);
  const currentPool=navigationOnly?await db.collection('questions').where('gradeLevel','==',2).where('status','==','published').where('isDemo','==',false).get():null;
  const { curricula, records:bankRecords } = navigationOnly?loadCurriculumBank(undefined,{records:currentPool.docs.map(d=>({question:d.data(),answer:{}}))}):loadCurriculumBank();
  // Startup loads navigation only. Prepared bank files remain an explicit import.
  const records=navigationOnly?[]:bankRecords;
  const documents = [...curricula.map(c => ({ ref: db.doc('curricula/' + c.grade), value: c })), ...records.flatMap(r => [
    { ref: db.doc('questions/' + r.question.questionId), value: r.question }, { ref: db.doc('privateQuestionAnswers/' + r.question.questionId), value: r.answer }
  ])];
  return db.runTransaction(async tx => {
    const existing = await tx.getAll(...documents.map(d => d.ref)); let created = 0, updated = 0;
    for (const [i, document] of documents.entries()) {
      if (existing[i].exists) {
        if (!isDeepStrictEqual(existing[i].data(), document.value)) {
          const old = existing[i].data();
          if (document.ref.parent.id !== 'curricula' || old.grade !== document.value.grade || old.sourceDatasetId !== document.value.sourceDatasetId) throw new Error('Existing source content differs: ' + document.ref.path);
          // Local navigation-only replacement; questions, private keys and student history are immutable.
          tx.set(document.ref, document.value); updated++;
        }
      }
      else { tx.create(document.ref, document.value); created++; }
    }
    return { questions: records.length, curricula: curricula.length, createdDocuments: created, updatedNavigationDocuments: updated };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log('Curriculum import:', await seedCurriculum({navigationOnly:process.argv.includes('--navigation-only')})); }
  finally { await Promise.all(getApps().map(deleteApp)); }
}
