import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';
import { demoQuestions } from './demo-questions.mjs';

export async function seedDemo() {
  // Hard local guard; no credentials or live-project fallback.
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    || (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== 'demo-test-arena')) throw new Error('Demo localhost emulator required.');
  const app = getApps().find(a => a.name === 'demo-seed') || initializeApp({ projectId: 'demo-test-arena' }, 'demo-seed');
  const db = getFirestore(app);
  return db.runTransaction(async tx => {
    const records = demoQuestions.flatMap(({ question, answer }) => [
      { ref: db.collection('questions').doc(question.questionId), value: question },
      { ref: db.collection('privateQuestionAnswers').doc(question.questionId), value: answer }
    ]);
    const existing = await tx.getAll(...records.map(r => r.ref));
    let created = 0;
    records.forEach((record, i) => {
      if (existing[i].exists) {
        if (!isDeepStrictEqual(existing[i].data(), record.value)) throw new Error(`Immutable demo fixture changed: ${record.ref.path}`);
      } else { tx.create(record.ref, record.value); created++; }
    });
    return { questions: demoQuestions.length, createdDocuments: created };
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log('Emulator demo seed:', await seedDemo()); }
  finally { const { deleteApp } = await import('firebase-admin/app'); await Promise.all(getApps().map(a => deleteApp(a))); }
}
