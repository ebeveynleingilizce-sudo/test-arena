// Cumulative snapshots remain authoritative only for the behavior report.
// XP and answers never depend on this queue. Terminal/lifecycle flushes bypass
// batching; identical successfully saved snapshots are not written twice.
export function behaviorCheckpoints(snapshot,save,{interval=30000,every=3}={}){
 let pending=Promise.resolve(),last='',count=0,timer;
 const flush=()=>{
  clearTimeout(timer);timer=undefined;count=0;
  pending=pending.catch(()=>{}).then(async()=>{
   const value=snapshot(),signature=JSON.stringify(value);
   if(signature===last)return;
   await save(value);last=signature;
  });return pending;
 };
 return {flush,checkpoint(){count++;if(count>=every)return flush();if(!timer)timer=setTimeout(()=>{void flush().catch(()=>{});},interval);return pending;}};
}
