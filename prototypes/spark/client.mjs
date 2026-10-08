// Prototype transport only. Production UI, quiz and importer do not import this.
import {signInWithEmailAndPassword} from 'firebase/auth';
import {doc, getDoc, setDoc, serverTimestamp, runTransaction} from 'firebase/firestore';

export function codeCredentials(code) {
  if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) throw Error('Invalid code');
  // Internal Auth identifier, not an email requested from the child.
  return {email: `${code.toLowerCase()}@students.testarena.invalid`, password: code};
}
export async function loginWithCode(auth, code) {
  const {email, password} = codeCredentials(code);
  return signInWithEmailAndPassword(auth, email, password);
}
const student = (t, s) => `teachers/${t}/students/${s}`;
export async function submit(db, t, s, a, questionId, selectedChoiceId) {
  await setDoc(doc(db, `${student(t, s)}/attempts/${a}`), {
    questionId, selectedChoiceId, submittedAt: serverTimestamp()
  });
}
export async function grade(db, t, s, a) {
  const ref = doc(db, `${student(t, s)}/results/${a}`);
  const previous = await getDoc(ref);
  if (previous.exists()) return previous.data().isCorrect;
  // Neither boolean is trusted: Rules compare with the immutable submission
  // and the unreadable answer key. Denial is not interpreted as "wrong".
  for (const isCorrect of [true, false]) {
    try {
      await setDoc(ref, {isCorrect, gradedAt: serverTimestamp()});
      return isCorrect;
    } catch (error) {
      if (error.code !== 'permission-denied') throw error;
    }
  }
  throw Error('Grading denied; no result or XP awarded');
}
export async function award(db, t, s, a, q) {
  const root = student(t, s), awardRef = doc(db, `${root}/awardedQuestions/${q}`);
  try { return await runTransaction(db, async tx => {
    const summaryRef = doc(db, `${root}/learning/summary`);
    const [prior, summary] = await Promise.all([tx.get(awardRef), tx.get(summaryRef)]);
    if (prior.exists()) return 0;
    tx.set(awardRef, {attemptId: a, xp: 1, awardedAt: serverTimestamp()});
    tx.update(summaryRef, {totalXP: summary.data().totalXP + 1, lastAwardQuestionId: q});
    return 1;
  }); } catch (error) {
    // With racing commits Rules may reject the loser before the SDK retries.
    // Return zero ONLY when a persisted, immutable award can be read back.
    if (error.code === 'permission-denied' && (await getDoc(awardRef)).exists()) return 0;
    throw error;
  }
}
