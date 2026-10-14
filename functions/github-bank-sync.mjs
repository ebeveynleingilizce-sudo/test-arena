import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {getAuth} from 'firebase-admin/auth';
import {Timestamp} from 'firebase-admin/firestore';
import {prepareQuestionBank,loadCurriculumBank} from './runtime/scripts/curriculum-bank.mjs';
import {bankProjection} from './runtime/shared/question-bank.mjs';

const dataRoot=fileURLToPath(new URL('./runtime/data/',import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const matches=(actual,expected)=>!!actual&&Object.entries(expected).every(([key,value])=>isDeepStrictEqual(actual[key],value));
const sourceKey=repository=>hash(repository.toLowerCase());
export async function authorizeBankSync(db,auth,getUser=uid=>getAuth().getUser(uid)){
 if(!auth||!['password','google.com'].includes(String(auth.token?.firebase?.sign_in_provider)))throw Error('ADMIN_REQUIRED');
 const user=await getUser(auth.uid);
 if(user.disabled||user.email?.toLowerCase()!=='tunc@test.com'||user.tokensValidAfterTime&&Number(auth.token.auth_time)*1000<Date.parse(user.tokensValidAfterTime))throw Error('ADMIN_REQUIRED');
 const [role,binding]=await db.getAll(db.doc('roles/'+auth.uid),db.doc('studentBindings/'+auth.uid));
 if(binding.exists||role.data()?.role!=='teacher'||!(role.data()?.questionBankAdmin===true||role.data()?.admin===true||user.customClaims?.questionBankAdmin===true||user.customClaims?.admin===true))throw Error('ADMIN_REQUIRED');
 return auth.uid;
}
function publicFileError(error){
 const code=error?.message;
 if(code==='ID_CONFLICT')return 'Bu soru ID farklı içerikle zaten var. Mevcut kayda dokunulmadı; değişen soru için yeni ID kullan.';
 if(code==='INVALID_JSON')return 'JSON dosyası okunamadı.';
 if(code==='UNKNOWN_GRADE')return 'Bu kademenin güvenilir müfredatı canlıda bulunmuyor.';
 if(code==='SOURCE_AUTHORIZATION'||code==='SOURCE_NOT_FOUND')return 'Özel GitHub deposuna sunucu erişimi sağlanamadı.';
 if(code==='IMAGE_PUBLICATION_REQUIRED')return 'Paket görselleri için ayrıca güvenli görsel yayını gerekir; kontrollü JSON görselleri kullanılabilir.';
 return 'Dosya şema, müfredat veya güvenli içe aktarma kontrolünden geçemedi.';
}
// Add-only questions/keys; immutable templates are staged before a fenced catalog switch.
// Source markers are written only with the catalog switch, so lost responses are recoverable.
export async function syncGithubBank({db,source,actorUid,maxFiles=20,now=()=>Date.now(),hooks={}}){
 const head=await source.head(),stateRef=db.doc('questionBankGithubState/'+sourceKey(source.repository));
 const previous=(await stateRef.get()).data();
 const empty={scanned:0,validBanks:0,imported:0,unchanged:0,unchangedFiles:0,remainingFiles:0,conflicts:0,failed:0,files:[],completedAt:new Date(now()).toISOString(),commit:head.commit};
 if(previous?.commit===head.commit&&previous.complete===true)return {...empty,scanned:previous.scanned||0,unchangedFiles:previous.scanned||0,upToDate:true};
 const files=await source.list(head.tree),markers=files.map(file=>db.doc('questionBankGithubFiles/'+hash(source.repository.toLowerCase()+':'+file.path)));
 const saved=[];for(let i=0;i<markers.length;i+=100)saved.push(...await db.getAll(...markers.slice(i,i+100)));
 const pending=files.map((file,i)=>({...file,marker:markers[i],old:saved[i]?.data()})).filter(file=>file.old?.sha!==file.sha);
 const report={...empty,scanned:files.length,unchangedFiles:files.length-pending.length,remainingFiles:Math.max(0,pending.length-maxFiles)};
 const lockRef=db.doc('questionBankState/live'),lockId=randomUUID(),prepared=[],grades=new Set();
 await db.runTransaction(async tx=>{
  const value=(await tx.get(lockRef)).data();
  if(value?.lockId&&value.lockedAt?.toMillis()+600000>now())throw Error('SYNC_BUSY');
  tx.set(lockRef,{revision:value?.revision||0,lockId,lockedBy:actorUid,lockedAt:Timestamp.fromMillis(now())});
 });
 try{
  for(const file of pending.slice(0,maxFiles)){
   try{
    const bank=await source.read(file);
    // Raster paths are never turned into broken public URLs or copied to an open repo.
    const containsImage=value=>value&&typeof value==='object'&&((value.type==='image'||value.kind==='image')||Object.values(value).some(v=>typeof v==='object'&&containsImage(v)));
    if(containsImage(bank))throw Error('IMAGE_PUBLICATION_REQUIRED');
    const normalized=prepareQuestionBank(bank,dataRoot),grade=normalized.curricula[0].grade;
    const live=await db.doc('curricula/'+grade).get();
    if(!live.exists||live.data().sourceDatasetId!==normalized.curricula[0].sourceDatasetId)throw Error('UNKNOWN_GRADE');
    if(normalized.records.length>200)throw Error('FILE_LIMIT');
    const refs=normalized.records.flatMap(r=>[db.doc('questions/'+r.question.questionId),db.doc('privateQuestionAnswers/'+r.question.questionId)]);
    const counts=await db.runTransaction(async tx=>{
     const lock=await tx.get(lockRef);if(lock.data()?.lockId!==lockId)throw Error('LOCK_LOST');
     const existing=await tx.getAll(...refs);let imported=0,unchanged=0;
     for(let i=0;i<normalized.records.length;i++){
      const row=normalized.records[i],[q,a]=existing.slice(i*2,i*2+2);
      if(q.exists||a.exists){if(!q.exists||!a.exists||!matches(q.data(),row.question)||!matches(a.data(),row.answer))throw Error('ID_CONFLICT');unchanged++;}
      else imported++;
     }
     for(let i=0;i<normalized.records.length;i++)if(!existing[i*2].exists){tx.create(refs[i*2],normalized.records[i].question);tx.create(refs[i*2+1],normalized.records[i].answer);}
     return {imported,unchanged};
    });
    report.imported+=counts.imported;report.unchanged+=counts.unchanged;report.validBanks++;if(counts.imported||!file.old)grades.add(grade);prepared.push(file);
    report.files.push({file:file.path,ok:true});
   }catch(error){if(['LOCK_LOST','SYNC_BUSY'].includes(error?.message))throw error;report.failed++;if(error?.message==='ID_CONFLICT')report.conflicts++;report.files.push({file:file.path,ok:false,reason:publicFileError(error)});}
  }
  const projections=[];
  for(const grade of grades){
   const pool=await db.collection('questions').where('gradeLevel','==',grade).where('status','==','published').get();
   const docs=pool.docs.filter(d=>d.data().isDemo===false),keys=[];
   for(let i=0;i<docs.length;i+=100)keys.push(...await db.getAll(...docs.slice(i,i+100).map(d=>db.doc('privateQuestionAnswers/'+d.id))));
   if(keys.some(d=>!d.exists))throw Error('POOL_KEY_MISSING');
   const records=docs.map((d,i)=>({question:d.data(),answer:keys[i].data()}));
   const tree=loadCurriculumBank(dataRoot,{grade,records}).curricula[0],projection=await bankProjection(tree,records);
   const live=(await db.doc('curricula/'+grade).get()).data();if(live?.sourceDatasetId!==tree.sourceDatasetId)throw Error('CURRICULUM_CHANGED');
   const activate=[];
   for(const template of projection.templates){
    const target=db.doc('quizTemplates/'+template.id),old=await target.get();
    if(old.exists){const {active:ignored,...oldData}=old.data(),{active:unused,...newData}=template.data;if(!isDeepStrictEqual(oldData,newData))throw Error('TEMPLATE_CONFLICT');if(!old.data().active)activate.push(target);continue;}
    const batch=db.batch();batch.create(target,{...template.data,active:false});
    for(const answer of template.answers)batch.create(db.doc(`privateQuizKeys/${template.id}/answers/${answer.id}`),answer.data);
    await batch.commit();activate.push(target);
   }
   projections.push({grade,tree,catalog:projection.catalog,activate});
  }
  const changes=projections.reduce((n,p)=>n+2+p.activate.length,0)+prepared.length+3;
  if(changes>480)throw Error('PUBLICATION_LIMIT');
  await hooks.beforeSwitch?.();
  await db.runTransaction(async tx=>{
   const lock=(await tx.get(lockRef)).data();if(lock?.lockId!==lockId)throw Error('LOCK_LOST');
   for(const p of projections){tx.set(db.doc('curricula/'+p.grade),p.tree);tx.set(db.doc('sparkCatalog/'+p.grade),p.catalog);for(const ref of p.activate)tx.update(ref,{active:true});}
   for(const file of prepared)tx.set(file.marker,{sha:file.sha,repository:source.repository,path:file.path,commit:head.commit});
   report.completedAt=new Date(now()).toISOString();
   tx.set(stateRef,{commit:head.commit,complete:!report.failed&&!report.remainingFiles,scanned:files.length,completedAt:report.completedAt});
   if(prepared.length)tx.create(db.doc('questionBankAudit/'+lockId),{actorUid,operation:'github-import',repository:source.repository,commit:head.commit,imported:report.imported,files:prepared.length,at:Timestamp.fromMillis(now())});
   tx.set(lockRef,{revision:(lock.revision||0)+(prepared.length?1:0),lockId:'',lockedBy:'',lockedAt:null});
  });
  await hooks.afterSwitch?.();
  return report;
 }finally{
  await db.runTransaction(async tx=>{const lock=(await tx.get(lockRef)).data();if(lock?.lockId===lockId)tx.set(lockRef,{revision:lock.revision,lockId:'',lockedBy:'',lockedAt:null});});
 }
}
