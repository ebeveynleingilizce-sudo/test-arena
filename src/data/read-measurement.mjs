// Opt-in, local diagnostic counters. Returned documents are NOT billed reads:
// rules, empty-query minimums, indexes and SDK retries are outside this metric.
const observers=new WeakMap();
export function beginReadMeasurement(db){
 const events=[];const observer=e=>events.push(e);observers.set(db,observer);
 return {snapshot:()=>({calls:events.filter(e=>e.type==='read').length,returnedDocuments:events.filter(e=>e.type==='read').reduce((n,e)=>n+(e.documents||0),0),cacheHits:events.filter(e=>e.type==='cache-hit').length,listenerOpens:events.filter(e=>e.type==='listener-open').length,listenerCloses:events.filter(e=>e.type==='listener-close').length,snapshots:events.filter(e=>e.type==='snapshot').length,changedDocuments:events.reduce((n,e)=>n+(e.changedDocuments||0),0),events:structuredClone(events)}),stop:()=>{if(observers.get(db)===observer)observers.delete(db);}};
}
export function measuredListener(db,path,subscribe){
 recordReadMeasurement(db,{type:'listener-open',path});let closed=false;
 try{const stop=subscribe(s=>recordReadMeasurement(db,{type:'snapshot',path,documents:s.docs?.length??Number(s.exists()),changedDocuments:s.docs?s.docChanges().length:1,fromCache:s.metadata.fromCache,hasPendingWrites:s.metadata.hasPendingWrites}));
 return()=>{if(closed)return;closed=true;stop();recordReadMeasurement(db,{type:'listener-close',path});};
 }catch(e){recordReadMeasurement(db,{type:'listener-close',path});throw e;}
}
export function recordReadMeasurement(db,event){observers.get(db)?.(event);}
export async function measuredRead(db,work){
 if(!observers.has(db))return work();
 const started=performance.now();
 try{const value=await work();const docs=value?.docs;
  recordReadMeasurement(db,{type:'read',kind:docs?'query':'document',path:docs?.[0]?.ref.parent.path||value?.ref?.path||'(empty query)',documents:docs?docs.length:Number(value?.exists?.()===true),fromCache:value?.metadata?.fromCache??null,durationMs:Math.round(performance.now()-started)});return value;
 }catch(e){recordReadMeasurement(db,{type:'read-error',code:e.code||'unknown'});throw e;}
}
