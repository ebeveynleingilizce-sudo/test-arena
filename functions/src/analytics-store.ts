import { type DocumentData, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { arenaPeriod } from './arena-store.js';

export interface Counts { solved: number; correct: number; wrong: number }
export interface Summary { version: number; overall: Counts; weekly: Counts; weekKey: string; lastAnswerAt: number | null }
export interface Dimension extends Summary { kind: 'subject' | 'topic' | 'unit'; unitId?: string; unitName?: string; gradeLevel: number; subject: string; subjectName: string; topic?: string; topicName?: string }
export const zero = (): Counts => ({ solved: 0, correct: 0, wrong: 0 });
export const add = (a: Counts, b: Counts): Counts => ({ solved: a.solved + b.solved, correct: a.correct + b.correct, wrong: a.wrong + b.wrong });
export const accuracy = (a: Counts) => a.solved ? a.correct / a.solved * 100 : null;
export function supportSignals(student: { overall: Counts; weekly: Counts; lastAnswerAt: number | null; createdAt: number | null }, volumes: number[], now: Date) {
  const sorted = [...volumes].sort((a,b) => a-b), signals: string[] = [];
  const median = sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : 0;
  if (student.overall.solved >= 20 && accuracy(student.overall)! < 60) signals.push('En az 20 cevapta başarı %60 altında.');
  if (sorted.length >= 3 && median >= 10 && now.getTime() - arenaPeriod(now).startsAt >= 3 * 86400000
    && student.createdAt !== null && now.getTime() - student.createdAt >= 3 * 86400000 && student.weekly.solved < median / 4) {
    signals.push(`Bu hafta ${student.weekly.solved} soru; sınıfın ortanca değeri ${median}.`);
  }
  if (student.overall.solved >= 20 && student.lastAnswerAt !== null && now.getTime() - student.lastAnswerAt >= 7 * 86400000) signals.push('Son kabul edilen cevap en az 7 gün önce.');
  return signals;
}
export const emptySummary = (now = new Date()): Summary => ({ version: 2, overall: zero(), weekly: zero(), weekKey: arenaPeriod(now).weekKey, lastAnswerAt: null });
export function currentSummary(data: Summary, now: Date): Summary {
  const weekKey = arenaPeriod(now).weekKey;
  return { ...data, weekly: data.weekKey === weekKey ? data.weekly : zero(), weekKey };
}
// ':' cannot occur in validated bank identifiers. Unlike '_' concatenation,
// this preserves the boundary between subject and topic without collisions.
export const dimensionIds = (test: DocumentData) => [`subject:${test.gradeLevel}:${test.subject}`, `topic:${test.gradeLevel}:${test.subject}:${test.topic}`, ...(test.unitId ? [`unit:${test.gradeLevel}:${test.subject}:${test.unitId}`] : [])];
const dimensionKind = (index: number): 'subject' | 'topic' | 'unit' => index === 0 ? 'subject' : index === 1 ? 'topic' : 'unit';
function dimension(test: DocumentData, kind: 'subject' | 'topic' | 'unit', now: Date): Dimension {
  return { ...emptySummary(now), kind, gradeLevel: test.gradeLevel, subject: test.subject, subjectName: test.subjectName,
    ...(kind === 'topic' ? { topic: test.topic, topicName: test.topicName } : {}),
    ...(kind !== 'subject' && test.unitId ? { unitId: test.unitId, unitName: test.unitName } : {}) };
}
function accept<T extends Summary>(data: T, correct: boolean, at: number, now: Date): T {
  const next = currentSummary(data, now), delta = { solved: 1, correct: correct ? 1 : 0, wrong: correct ? 0 : 1 };
  const period = arenaPeriod(now);
  return { ...data, ...next, overall: add(next.overall, delta),
    weekly: at >= period.startsAt && at < period.endsAt ? add(next.weekly, delta) : next.weekly,
    lastAnswerAt: Math.max(data.lastAnswerAt ?? 0, at) };
}

// Read once for pre-M5 students, in the same transaction as initialization or
// the next accepted answer. Concurrent submissions conflict on this summary.
// No history is sent to the browser or scanned on subsequent dashboard reads.
export async function readAnalytics(tx: Transaction, root: DocumentReference, now: Date) {
  const ref = root.collection('analytics').doc('summary'), snap = await tx.get(ref);
  const initialized = !snap.exists || snap.data()!.version !== 2;
  let summary: Summary = initialized ? emptySummary(now) : currentSummary(snap.data() as Summary, now);
  const dimensions = new Map<string, Dimension>();
  const obsolete = initialized ? (await tx.get(root.collection('analyticsDimensions'))).docs.map(d => d.ref) : [];
  if (initialized) {
    const tests = await tx.get(root.collection('testSessions'));
    for (const test of tests.docs) {
      const answers = await tx.get(test.ref.collection('answers'));
      for (const answer of answers.docs) {
        const a = answer.data(), at = a.answeredAt.toMillis();
        summary = accept(summary, a.isCorrect, at, now);
        const context = { ...test.data(), ...test.data().questions?.find((q: DocumentData) => q.questionId === answer.id) };
        dimensionIds(context).forEach((key, i) => {
          dimensions.set(key, accept(dimensions.get(key) ?? dimension(context, dimensionKind(i), now), a.isCorrect, at, now));
        });
      }
    }
  }
  return { ref, summary, dimensions, initialized, obsolete };
}
export type AnalyticsPlan = Awaited<ReturnType<typeof readAnalytics>>;
export async function readAnswerAnalytics(tx: Transaction, root: DocumentReference, test: DocumentData, now: Date) {
  const plan = await readAnalytics(tx, root, now), ids = dimensionIds(test);
  if (!plan.initialized) {
    const docs = await tx.getAll(...ids.map(key => root.collection('analyticsDimensions').doc(key)));
    docs.forEach((doc, i) => plan.dimensions.set(ids[i], doc.exists ? doc.data() as Dimension : dimension(test, dimensionKind(i), now)));
  } else ids.forEach((key, i) => { if (!plan.dimensions.has(key)) plan.dimensions.set(key, dimension(test, dimensionKind(i), now)); });
  return plan;
}
export function writeAnalytics(tx: Transaction, root: DocumentReference, plan: AnalyticsPlan) {
  plan.obsolete.forEach(ref => { if (!plan.dimensions.has(ref.id)) tx.delete(ref); });
  tx.set(plan.ref, plan.summary);
  plan.dimensions.forEach((data, key) => tx.set(root.collection('analyticsDimensions').doc(key), data));
}
export function acceptAnswer(plan: AnalyticsPlan, test: DocumentData, isCorrect: boolean, now: Date) {
  plan.summary = accept(plan.summary, isCorrect, now.getTime(), now);
  for (const key of dimensionIds(test)) plan.dimensions.set(key, accept(plan.dimensions.get(key)!, isCorrect, now.getTime(), now));
}
