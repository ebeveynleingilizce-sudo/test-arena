import {collection,doc,documentId,getDocFromServer,getDocs,query,where,writeBatch,runTransaction,serverTimestamp} from 'firebase/firestore';
import {bankProjection,normalizeBankRecord,importBankRecords,reportTypes,reportStatuses} from '../../shared/question-bank.mjs';
import {readServerTime} from './server-clock.mjs';
const ref=(ctx,path)=>doc(ctx.db,path),uid=ctx=>ctx.auth.currentUser.uid;
const safeId=v=>{if(typeof v!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(v))throw Error('Geçersiz soru kimliği.');return v;};
export async function bankPermissions(ctx){const role=(await getDocFromServer(ref(ctx,`roles/${uid(ctx)}`))).data(),token=await ctx.auth.currentUser.getIdTokenResult();return {canManage:role?.questionBankAdmin===true||role?.admin===true||token.claims.questionBankAdmin===true||token.claims.admin===true||(ctx.emulator&&ctx.auth.currentUser.email==='demo.ogretmen@testarena.local')};}
async function records(ctx,grade){const list=await getDocs(query(collection(ctx.db,'questions'),where('gradeLevel','==',grade))),groups=[],answers=new Map();for(let i=0;i<list.docs.length;i+=30)groups.push(list.docs.slice(i,i+30).map(d=>d.id));for(let i=0;i<groups.length;i+=4){const batches=await Promise.all(groups.slice(i,i+4).map(ids=>getDocs(query(collection(ctx.db,'privateQuestionAnswers'),where(documentId(),'in',ids)))));for(const batch of batches)for(const d of batch.docs)answers.set(d.id,d.data());}return list.docs.map(d=>({question:d.data(),answer:answers.get(d.id)||null}));}
async function tree(ctx,grade){const value=(await getDocFromServer(ref(ctx,`curricula/${grade}`))).data();if(!value)throw Error('Bu kademede henüz soru bankası yok.');return value;}
async function publish(ctx,input){
 if(!(await bankPermissions(ctx)).canManage)throw Error('Soru bankası yönetim yetkisi gerekli.');
 const grade=Number(input.grade),stateRef=ref(ctx,'questionBankState/live'),token=crypto.randomUUID(),at=await readServerTime(ctx);
 await runTransaction(ctx.db,async tx=>{const v=(await tx.get(stateRef)).data();if(v?.lockId&&v.lockedAt.toMillis()+600000>at)throw Error('Başka bir soru bankası güncellemesi sürüyor. Biraz sonra yeniden dene.');tx.set(stateRef,{revision:v?.revision||0,lockId:token,lockedBy:uid(ctx),lockedAt:serverTimestamp()});});
 try{
  const curriculum=await tree(ctx,grade),oldRecords=await records(ctx,grade),byId=new Map(oldRecords.map(r=>[r.question.questionId,r]));let changes;
  // Published navigation intentionally omits outcome codes. Recover only codes
  // already approved in this exact canonical scope; never trust imported codes.
  for(const s of curriculum.subjects)for(const u of s.units)for(const t of u.topics||[])t.outcomeCodes=[...new Set([...(t.outcomeCodes||[]),...oldRecords.filter(r=>r.question.subject===s.id&&r.question.unitId===u.id&&r.question.topic===t.id&&r.answer?.outcomeCode).map(r=>r.answer.outcomeCode)])];
  if(!['create','update','import','delete'].includes(input.operation))throw Error('Geçersiz yönetim işlemi.');
  if(input.operation==='delete'){const old=byId.get(safeId(input.questionId));if(!old)throw Error('Soru bulunamadı.');changes=[{...old,question:{...old.question,status:'archived'}}];}
  else if(input.operation==='import'){changes=importBankRecords(input.bank,curriculum);for(const r of changes)if(byId.has(r.question.questionId))throw Error(`Soru ID zaten var: ${r.question.questionId}. Yükleme mevcut soruları değiştirmez; düzenleme ekranını kullan.`);}
  else{changes=[normalizeBankRecord(input.record,curriculum)];const id=changes[0].question.questionId,old=byId.get(id);if(input.operation==='create'&&old)throw Error('Bu soru ID zaten kullanılıyor.');if(input.operation==='update'&&(!old||(old.question.bankRevision||0)!==(input.expectedRevision||0)))throw Error('Soru başka bir işlemde değişmiş. Yenileyip tekrar düzenle.');}
  const actionId=crypto.randomUUID();for(const r of changes){const old=byId.get(r.question.questionId);r.question.bankRevision=(old?.question.bankRevision||0)+1;r.question.bankActionId=actionId;byId.set(r.question.questionId,r);}
  const projection=await bankProjection(curriculum,[...byId.values()].filter(r=>r.answer));
  const existing=await getDocs(query(collection(ctx.db,'quizTemplates'),where('gradeLevel','==',grade))),oldTemplates=new Map(existing.docs.map(d=>[d.id,d.data()])),groups=[];
  for(const t of projection.templates)if(!oldTemplates.has(t.id)){groups.push([[`quizTemplates/${t.id}`,{...t.data,active:false}],...t.answers.map(a=>[`privateQuizKeys/${t.id}/answers/${a.id}`,a.data])]);}
  // Stage new immutable packs before the atomic catalog switch. Existing packs/keys stay intact.
  // A pack and all its answer keys commit together, even if staging is interrupted.
  for(let i=0;i<groups.length;i+=12){const b=writeBatch(ctx.db);for(const [path,data]of groups.slice(i,i+12).flat())b.set(ref(ctx,path),data);await b.commit();}
  const ids=new Set(projection.templates.map(t=>t.id)),toggles=[...existing.docs.filter(d=>d.data().active&&!ids.has(d.id)).map(d=>[d.ref,false]),...projection.templates.filter(t=>oldTemplates.get(t.id)?.active!==true).map(t=>[ref(ctx,`quizTemplates/${t.id}`),true])];
  if(changes.length*3+toggles.length+3>490)throw Error('Bu kademe tek yayın için çok büyük. Değişiklik kaydedilmedi; daha küçük bir banka kullan.');
  await runTransaction(ctx.db,async tx=>{const state=(await tx.get(stateRef)).data();if(state?.lockId!==token)throw Error('Yayın kilidi değişti. İşlemi yeniden dene.');
   for(const r of changes){const id=r.question.questionId;tx.set(ref(ctx,`questionBankRevisions/${actionId}/records/${id}`),{questionId:id,before:oldRecords.find(o=>o.question.questionId===id)||null,at:serverTimestamp()});tx.set(ref(ctx,`questions/${id}`),r.question);tx.set(ref(ctx,`privateQuestionAnswers/${id}`),r.answer);}
   for(const [r,active]of toggles)tx.update(r,{active});tx.set(ref(ctx,`sparkCatalog/${grade}`),projection.catalog);
   tx.set(ref(ctx,`questionBankAudit/${actionId}`),{actorUid:uid(ctx),operation:input.operation,grade,questionIds:changes.map(r=>r.question.questionId),at:serverTimestamp()});tx.set(stateRef,{revision:state.revision+1,lockId:'',lockedBy:'',lockedAt:null});
  });return {changed:changes.length};
 }finally{await runTransaction(ctx.db,async tx=>{const v=(await tx.get(stateRef)).data();if(v?.lockId===token)tx.set(stateRef,{revision:v.revision,lockId:'',lockedBy:'',lockedAt:null});});}
}
export async function questionBankCall(ctx,name,data){
 if(name==='teacherBankPermissions')return bankPermissions(ctx);
 if(name==='teacherQuestionBank'){const grade=Number(data.grade);return {permissions:await bankPermissions(ctx),curriculum:(await getDocFromServer(ref(ctx,`curricula/${grade}`))).data()||null,records:await records(ctx,grade)};}
 if(name==='getBankQuestion'){const id=safeId(data.questionId);return {question:(await getDocFromServer(ref(ctx,`questions/${id}`))).data(),answer:(await getDocFromServer(ref(ctx,`privateQuestionAnswers/${id}`))).data()};}
 if(name==='manageQuestionBank')return publish(ctx,data);
 if(name==='questionReports')return (await getDocs(collection(ctx.db,'questionReports'))).docs.map(d=>({id:d.id,...d.data()}));
 if(name==='updateQuestionReport'){if(!reportStatuses[data.status])throw Error('Geçersiz durum.');const b=writeBatch(ctx.db);b.update(ref(ctx,`questionReports/${safeId(data.reportId)}`),{status:data.status,updatedAt:serverTimestamp(),updatedBy:uid(ctx)});await b.commit();return {};}
 if(name==='reportQuestion'){
  if(!reportTypes.includes(data.type)||typeof data.description!=='string'||data.description.length>2000)throw Error('Bildirim türü veya açıklama geçersiz.');
  const id=safeId(data.questionId),binding=(await getDocFromServer(ref(ctx,`studentBindings/${uid(ctx)}`))).data();let source,templateId='',testSessionId='';
  if(binding){testSessionId=safeId(data.testSessionId);const session=(await getDocFromServer(ref(ctx,`teachers/${binding.teacherUid}/students/${binding.studentId}/quizzes/${testSessionId}`))).data();if(!session)throw Error('Test bulunamadı.');templateId=session.templateId;source=(await getDocFromServer(ref(ctx,`quizTemplates/${templateId}`))).data();if(!source?.questionIds.includes(id))throw Error('Soru bu testte değil.');}
  else source=(await getDocFromServer(ref(ctx,`questions/${id}`))).data();
  if(!source)throw Error('Soru bulunamadı.');const reportId=crypto.randomUUID(),b=writeBatch(ctx.db);b.set(ref(ctx,`questionReports/${reportId}`),{questionId:id,gradeLevel:source.gradeLevel,subject:source.subject,subjectName:source.subjectName,unitId:source.unitId||'',unitName:source.unitName||'',type:data.type,description:data.description.trim(),reporterUid:uid(ctx),reporterRole:binding?'student':'teacher',testSessionId,templateId,status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),updatedBy:''});await b.commit();return {reportId};
 }
 throw Error('Bilinmeyen soru bankası işlemi.');
}
