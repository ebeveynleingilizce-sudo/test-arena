const manifests=new Map();
export async function staticQuestionPack(id,baseUrl){
 if(!/^[a-f0-9]{64}$/.test(id)||typeof fetch!=='function'||!baseUrl)return null;
 try{
  let pending=manifests.get(baseUrl);if(!pending){pending=fetch(baseUrl+'question-packs/manifest.json',{cache:'no-cache'}).then(async r=>r.ok?r.json():null).catch(()=>null);manifests.set(baseUrl,pending);}
  const manifest=await pending,digest=manifest?.packs?.[id];if(!digest)return null;
  const response=await fetch(baseUrl+'question-packs/'+id+'.json',{cache:'force-cache'});if(!response.ok)return null;
  const raw=await response.text(),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)),hash=Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');if(hash!==digest)return null;
  const pack=JSON.parse(raw);if(!Array.isArray(pack.questionIds)||!Array.isArray(pack.questions)||pack.questions.some(q=>!Array.isArray(q.choices)))return null;
  return pack;
 }catch{return null;}
}
