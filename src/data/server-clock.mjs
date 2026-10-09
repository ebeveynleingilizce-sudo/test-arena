import {doc,setDoc,getDocFromServer,serverTimestamp} from 'firebase/firestore';

// Concurrent reports must not overwrite the sample while another caller reads it.
const pending=new WeakMap();
export function readServerTime(ctx){
 const uid=ctx.auth.currentUser?.uid;if(!uid)throw Error('Giriş gerekli.');
 let byUser=pending.get(ctx.db);if(!byUser){byUser=new Map();pending.set(ctx.db,byUser);}
 if(byUser.has(uid))return byUser.get(uid);
 const request=(async()=>{const ref=doc(ctx.db,`clockSamples/${uid}`);await setDoc(ref,{at:serverTimestamp()});const sample=(await getDocFromServer(ref)).data()?.at;if(typeof sample?.toMillis!=='function')throw Error('Sunucu saati alınamadı. Yeniden dene.');return sample.toMillis();})().finally(()=>byUser.delete(uid));
 byUser.set(uid,request);return request;
}
