// Coalesce concurrent reads only. No completed results, failures or credentials
// persist here; every later request is fresh and Firestore rules still run.
const stores=new WeakMap();
export function sharePendingRead(scope,key,read){
 let requests=stores.get(scope);if(!requests){requests=new Map();stores.set(scope,requests);}
 if(requests.has(key))return requests.get(key);
 const promise=Promise.resolve().then(read).finally(()=>{if(requests.get(key)===promise)requests.delete(key);});
 requests.set(key,promise);return promise;
}
