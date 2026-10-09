import {useEffect,useRef,useState} from 'react';
import {call} from '../data/firebase';
import type {Quiz} from '../domain/quiz';
import {createBehaviorCollector} from '../domain/quiz-behavior.mjs';
export function useQuizBehavior(quiz:Quiz|undefined,index:number,answered:boolean) {
  const state=useRef<{collector:ReturnType<typeof createBehaviorCollector>;flush:()=>Promise<void>;finish:()=>void}|null>(null);
  const [warning,setWarning]=useState('');
  useEffect(()=>{
    if(!quiz||quiz.legacyReadOnly||quiz.status==='completed')return;
    const collector=createBehaviorCollector(undefined,document.hidden),streamId=crypto.randomUUID();
    let slot:string|undefined,active=true,pending=Promise.resolve();
    const flush=()=>{
      const snapshot=collector.snapshot();
      pending=pending.catch(()=>{}).then(async()=>{
        try {const saved=await call<{slot:string}>('recordQuizBehavior',{testSessionId:quiz.testSessionId,streamId,slot,snapshot});slot=saved.slot;if(active)setWarning('');}
        catch {if(active)setWarning('Davranış kaydı eksik olabilir. Cevap ve XP işlemleri bundan etkilenmez.');}
      });return pending;
    };
    state.current={collector,flush,finish:()=>{if(!active)return;collector.stop();void flush();active=false;}};setWarning('');
    const visibility=()=>{if(!active)return;collector.visibility(document.hidden);void flush();};
    const leaving=()=>{if(!active)return;collector.visibility(true);void flush();};
    document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leaving);
    return ()=>{active=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leaving);collector.stop();void flush();state.current=null;};
    // One recorder per mounted quiz, not per answer or Firestore refresh.
  },[quiz?.testSessionId]);
  useEffect(()=>{
    if(quiz?.status==='completed')state.current?.finish();
    else state.current?.collector.question(quiz?.status==='active'&&!answered?index:null);
  },[quiz?.testSessionId,quiz?.status,index,answered]);
  return {warning,change:(previous:string,next:string)=>state.current?.collector.change(index,previous,next),
    checkpoint:()=>state.current?.flush()||Promise.resolve()};
}
