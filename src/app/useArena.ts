import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useSession } from './Session';
import { call, db } from '../data/firebase';
import type { ArenaPeriod, ArenaRow } from '../domain/arena';
import { errorMessage } from '../ui/components';

export function useArena() {
  const { user, student } = useSession();
  const key = student ? `${user?.uid}:${student.teacherUid}:${student.classId}:${student.credentialVersion}` : '';
  const [state, setState] = useState<{ key: string; period?: ArenaPeriod; rows?: ArenaRow[]; error?: string }>({ key: '' });
  useEffect(() => {
    if (!student || !key) return;
    let alive = true, stop: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let expiresAt = 0;
    setState({ key });
    async function prepare() {
      try {
        const period = await call<ArenaPeriod>('prepareArena', {});
        if (!alive) return;
        const delay = Math.max(100, period.endsAt - period.serverNow + 100);
        expiresAt = Date.now() + delay;
        setState(previous => ({ ...previous, key, period, error: undefined }));
        clearTimeout(timer); timer = setTimeout(() => void prepare(), delay);
        if (!stop) stop = onSnapshot(collection(db, 'teachers', student!.teacherUid, 'classes', student!.classId, 'leaderboard'), { includeMetadataChanges: true }, snapshot => {
          if (!alive || snapshot.metadata.fromCache) return;
          setState(previous => ({ ...previous, key, rows: snapshot.docs.map(d => d.data() as ArenaRow), error: undefined }));
        }, e => { if (alive) setState({ key, error: errorMessage(e) }); });
      } catch (e) { if (alive) setState({ key, error: errorMessage(e) }); }
    }
    const visible = () => { if (document.visibilityState === 'visible' && Date.now() >= expiresAt) void prepare(); };
    document.addEventListener('visibilitychange', visible); void prepare();
    return () => { alive = false; clearTimeout(timer); stop?.(); document.removeEventListener('visibilitychange', visible); };
  }, [key]);
  return state.key === key ? state : { key };
}
