import { useEffect, useState } from 'react';
import { collection, getDocsFromServer, onSnapshot } from 'firebase/firestore';
import { useSession } from './Session';
import { call, db } from '../data/firebase';
import type { ArenaPeriod, ArenaRow } from '../domain/arena';
import { errorMessage } from '../ui/components';
import {cachedArenaRows,saveArenaRows} from '../data/arena-row-cache.mjs';
import {measuredListener,measuredRead} from '../data/read-measurement.mjs';

export function useArena(live = true) {
  const { user, student } = useSession();
  const key = student ? `${user?.uid}:${student.teacherUid}:${student.classId}:${student.credentialVersion}:${student.gradeLevel}` : '';
  const [state, setState] = useState<{ key: string; period?: ArenaPeriod; rows?: ArenaRow[]; error?: string }>({ key: '' });
  useEffect(() => {
    if (!student || !key) return;
    let alive = true, stop: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let expiresAt = 0,preparing=false,weekKey='';
    setState({ key });
    const leaderboard = collection(db, 'teachers', student.teacherUid, 'classes', student.classId, 'leaderboard');
    async function loadRows(){
      if(!alive||document.visibilityState!=='visible')return;
      if(!live){
        try{const rows=await cachedArenaRows(db,key+':'+weekKey,async()=>{const snapshot=await measuredRead(db,()=>getDocsFromServer(leaderboard));return snapshot.docs.map(d=>d.data() as ArenaRow);});if(alive)setState(previous=>({...previous,key,rows,error:undefined}));}
        catch(e){if(alive)setState(previous=>({...previous,key,error:errorMessage(e)}));}
      }else if(!stop)stop=measuredListener(db,`teachers/${student!.teacherUid}/classes/${student!.classId}/leaderboard`,observe=>onSnapshot(leaderboard,{includeMetadataChanges:true},snapshot=>{
        observe(snapshot);if(!alive||snapshot.metadata.fromCache)return;
        const rows=snapshot.docs.map(d=>d.data() as ArenaRow);if(!snapshot.metadata.hasPendingWrites)saveArenaRows(db,key+':'+weekKey,rows);
        setState(previous=>({...previous,key,rows,error:undefined}));
      },e=>{if(alive)setState(previous=>({...previous,key,error:errorMessage(e)}));}));
    }
    async function prepare() {
      if(preparing||!alive||document.visibilityState!=='visible')return;preparing=true;
      try {
        const period = await call<ArenaPeriod>('prepareArena', {});
        if (!alive) return;
        weekKey=period.weekKey;
        const delay = Math.max(100, period.endsAt - period.serverNow + 100);
        expiresAt = Date.now() + delay;
        setState(previous => ({ ...previous, key, period, error: undefined }));
        clearTimeout(timer); timer = setTimeout(() => void prepare(), delay);
        await loadRows();
      } catch (e) { if (alive) setState({ key, error: errorMessage(e) }); }finally{preparing=false;}
    }
    const visible = () => {
      if(document.visibilityState!=='visible'){stop?.();stop=undefined;return;}
      // Reattach rows without a new clockSamples write when the period is valid.
      if(Date.now()>=expiresAt)void prepare();else void loadRows();
    };
    document.addEventListener('visibilitychange', visible); void prepare();
    return () => { alive = false; clearTimeout(timer); stop?.(); document.removeEventListener('visibilitychange', visible); };
  }, [key, live]);
  return state.key === key ? state : { key };
}
