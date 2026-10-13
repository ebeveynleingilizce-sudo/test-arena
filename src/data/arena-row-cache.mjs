import {recordReadMeasurement} from './read-measurement.mjs';
const stores=new WeakMap();
const epochs=new WeakMap();
export function clearArenaRows(db){stores.delete(db);epochs.set(db,(epochs.get(db)||0)+1);}
export function saveArenaRows(db,key,rows){let entries=stores.get(db);if(!entries){entries=new Map();stores.set(db,entries);}entries.set(key,{at:Date.now(),rows:structuredClone(rows)});if(entries.size>16)entries.delete(entries.keys().next().value);}
export async function cachedArenaRows(db,key,load){
 const saved=stores.get(db)?.get(key);
 if(saved&&Date.now()-saved.at<30000){recordReadMeasurement(db,{type:'cache-hit',kind:'arena-rows'});return structuredClone(saved.rows);}
 const generation=epochs.get(db)||0;const rows=await load();
 // A mutation during the request must not repopulate invalidated rows.
 if((epochs.get(db)||0)===generation)saveArenaRows(db,key,rows);
 return rows;
}
