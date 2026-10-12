import {recordReadMeasurement} from './read-measurement.mjs';
const stores=new WeakMap();
const studentStores=new WeakMap();
export function clearStudentOverviewCache(db){studentStores.delete(db);}
export function clearReportCache(db){stores.delete(db);clearStudentOverviewCache(db);}
// Reuse completed student summaries across the class and detail screens. Never
// share a pending request owned by another screen's cancellation signal.
export async function cachedStudentOverview(db,uid,key,work){
 let entries=studentStores.get(db);if(!entries){entries=new Map();studentStores.set(db,entries);}
 const id=JSON.stringify([uid,key]),old=entries.get(id);
 if(old&&Date.now()-old.at<60000){recordReadMeasurement(db,{type:'cache-hit',kind:'student-overview'});return structuredClone(old.value);}
 const value=await work();
 if(studentStores.get(db)===entries){entries.set(id,{at:Date.now(),value:structuredClone(value)});if(entries.size>256)entries.delete(entries.keys().next().value);}
 return value;
}
export async function cachedReport(db,uid,key,work){
 let entries=stores.get(db);if(!entries){entries=new Map();stores.set(db,entries);}
 const id=JSON.stringify([uid,key]),old=entries.get(id);if(old&&Date.now()-old.at<60000){recordReadMeasurement(db,{type:'cache-hit',kind:'report'});return old.promise;}
 const promise=work().catch(e=>{if(entries.get(id)?.promise===promise)entries.delete(id);throw e;});
 entries.set(id,{at:Date.now(),promise});if(entries.size>12)entries.delete(entries.keys().next().value);return promise;
}
