import {doc,getDocFromServer} from 'firebase/firestore';
import {staticQuestionPack} from './public-question-pack.mjs';
// Only immutable public quiz snapshots are reused. Session, role, grades and
// private answer keys always remain server reads with current rules enforced.
const stores=new WeakMap();
export function readQuizTemplate(db,id,uid=''){
 let cache=stores.get(db);if(!cache){cache=new Map();stores.set(db,cache);}
 const key=`${uid}:${id}`,old=cache.get(key);if(old&&Date.now()-old.at<300000)return old.promise;
 const base=typeof location==='undefined'||location.hostname==='127.0.0.1'||location.hostname==='localhost'?null:new URL(import.meta.env?.BASE_URL||'/',location.origin).href;
 const promise=staticQuestionPack(id,base).then(async pack=>{if(pack)return pack;const d=await getDocFromServer(doc(db,`quizTemplates/${id}`));if(!d.exists())throw Error('Soru paketi bulunamadı.');return d.data();}).catch(e=>{cache.delete(key);throw e;});
 cache.set(key,{at:Date.now(),promise});if(cache.size>32)cache.delete(cache.keys().next().value);return promise;
}
