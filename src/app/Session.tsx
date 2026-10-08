import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../data/firebase';
import { ensureTeacher } from '../data/spark.mjs';
import type { Student, StudentSession } from '../domain/models';

interface SessionState { user: User | null; student: Student | null; role: 'teacher' | 'student' | null; loading: boolean; notice: string }
const Context = createContext<SessionState>({ user: null, student: null, role: null, loading: true, notice: '' });
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, student: null, role: null, loading: true, notice: '' });
  useEffect(() => {
    let generation = 0, unsubscribeStudent: (() => void) | undefined;
    const stop = onAuthStateChanged(auth, async user => {
      const run = ++generation;
      unsubscribeStudent?.(); unsubscribeStudent = undefined;
      if (!user) { setState(previous => ({ user: null, student: null, role: null, loading: false, notice: previous.notice })); return; }
      setState({ user: null, student: null, role: null, loading: true, notice: '' });
      let revoking = false;
      const revoke = async () => {
        if (run !== generation || revoking) return;
        revoking = true;
        unsubscribeStudent?.(); unsubscribeStudent = undefined;
        setState({ user: null, student: null, role: null, loading: true, notice: 'Oturumun sona erdi. Öğretmeninden güncel kodu iste.' });
        await signOut(auth);
      };
      try {
        const token = await user.getIdTokenResult();
        if (run !== generation) return;
        const sessionDoc = await getDoc(doc(db, 'studentBindings', user.uid));
        if (run !== generation) return;
        if (!sessionDoc.exists()) {
          if (!['password','google.com'].includes(token.signInProvider || '') || user.email?.endsWith('@students.testarena.invalid')) {await revoke(); return;}
          await ensureTeacher(db,user);
          if (run === generation) setState({ user, student: null, role: 'teacher', loading: false, notice: '' });
          return;
        }
        const binding = sessionDoc.data();
        const session = {...binding,credentialVersion:binding.version} as StudentSession;
        unsubscribeStudent = onSnapshot(doc(db, 'teachers', session.teacherUid, 'students', session.studentId), { includeMetadataChanges: true }, snapshot => {
          if (run !== generation) return;
          // After code rotation, the SDK may first emit the previous session's
          // cached profile. Only server-confirmed snapshots can unlock a session
          // or compare credential versions; offline cache is not authorization.
          if (snapshot.metadata.fromCache) return;
          const student = snapshot.data() as Student | undefined;
          if (!student || student.status !== 'active' || student.credentialVersion !== session.credentialVersion) { void revoke(); return; }
          setState({ user, student, role: 'student', loading: false, notice: '' });
        }, () => { void revoke(); });
      } catch { await revoke(); }
    });
    return () => { generation++; stop(); unsubscribeStudent?.(); };
  }, []);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
