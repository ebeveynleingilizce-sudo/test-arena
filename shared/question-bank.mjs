import {parsePresentation} from '../functions/visuals/contract.mjs';
export const reportTypes=Object.freeze(['Yanlış cevap anahtarı','Hatalı veya eksik soru','Müfredat / kazanım uyumsuzluğu','Birden fazla doğru cevap','Doğru cevap bulunmuyor','Yazım / dil bilgisi hatası','Anlaşılmayan soru','Görsel hatası','Diğer']);
export const reportStatuses=Object.freeze({pending:'Bekliyor',reviewing:'İnceleniyor',fixed:'Düzeltildi',rejected:'Reddedildi'});
const check=(v,message)=>{if(!v)throw Error(message);};
const identifier=v=>typeof v==='string'&&/^[-A-Za-z0-9_]{1,128}$/.test(v);
export function normalizeBankRecord(input,tree){
 const q=input.question,a=input.answer;check(q&&a&&identifier(q.questionId),'Soru ID veya cevap kaydı geçersiz.');
 check(q.gradeLevel===tree.grade,'Soru ve müfredat kademesi uyuşmuyor.');
 const subject=tree.subjects.find(s=>s.id===q.subject),unit=subject?.units.find(u=>u.id===q.unitId);
 check(unit,'Ders veya ünite mevcut müfredatta bulunamadı.');
 const topic=unit.topics?.find(t=>t.id===q.topic);
 check(subject.navigationModel==='theme-test'||topic,'Konu mevcut müfredatta bulunamadı.');
 check(typeof q.questionText==='string'&&q.questionText.trim().length>0&&q.questionText.length<=6000,'Soru metni boş veya çok uzun.');
 check(Array.isArray(q.choices)&&[3,4].includes(q.choices.length)&&new Set(q.choices.map(c=>c.choiceId)).size===q.choices.length&&q.choices.every(c=>identifier(c.choiceId)),'Üç veya dört farklı seçenek gerekli.');
 check(q.choices.some(c=>c.choiceId===a.correctOptionId)&&typeof a.explanation==='string'&&a.explanation.length<=6000,'Doğru seçenek veya açıklama geçersiz.');
 if(a.outcomeCode)check(topic?.outcomeCodes?.includes(a.outcomeCode),'Kazanım kodu seçilen konuyla uyuşmuyor.');
 const presentation=parsePresentation(q.questionText,q.choices,q.visual,q.visualPlacement,q.content);
 return {question:{...Object.fromEntries(['themeId','skillId'].filter(k=>typeof q[k]==='string').map(k=>[k,q[k]])),questionId:q.questionId,gradeLevel:tree.grade,grade:tree.grade,subject:subject.id,subjectId:subject.id,subjectName:subject.name,unitId:unit.id,unitName:unit.name,topic:topic?.id||unit.id,topicId:topic?.id||unit.id,topicName:topic?.name||unit.name,...presentation,type:q.type||'multiple_choice',difficulty:q.difficulty||'medium',status:'published',isDemo:false,sourceDatasetId:tree.sourceDatasetId},answer:{correctChoiceId:a.correctOptionId,correctOptionId:a.correctOptionId,explanation:a.explanation,...(a.outcomeId?{outcomeId:a.outcomeId}:{}),...(a.outcomeCode?{outcomeCode:a.outcomeCode,outcomeMappingStatus:'exact'}:{outcomeMappingStatus:'theme-level-only'}),...(a.candidateOutcomeCodes?{candidateOutcomeCodes:a.candidateOutcomeCodes}: {})}};
}
export function importBankRecords(value,tree){
 const rows=Array.isArray(value)?value:value.records||value.questions;
 check(Array.isArray(rows)&&rows.length>=1&&rows.length<=50,'Bir yüklemede 1–50 soru olmalı.');
 const result=rows.map(row=>{
  if(row.question&&typeof row.question==='object')return normalizeBankRecord(row,tree);
  const subject=row.subject||row.subjectId||value.subjectId,unitId=row.unitId||row.themeId||value.unitId;
  const unit=tree.subjects.find(s=>s.id===subject)?.units.find(u=>u.id===unitId);
  return normalizeBankRecord({question:{questionId:row.id,gradeLevel:row.gradeLevel||value.grade||tree.grade,subject,unitId,topic:row.topicId||row.skillId||value.topicId||unit?.id,questionText:row.question,choices:row.options?.map(o=>({choiceId:o.id,text:o.text,...(o.visual?{visual:o.visual}:{})})),...(row.visual?{visual:row.visual}:{}),...(row.content?{content:row.content}:{}),...(row.visualPlacement?{visualPlacement:row.visualPlacement}:{}),type:row.type,difficulty:row.difficulty},answer:{correctOptionId:row.correctOptionId,explanation:row.explanation||'',...(row.outcomeCode?{outcomeCode:row.outcomeCode}:{})}},tree);
 });
 check(new Set(result.map(r=>r.question.questionId)).size===result.length,'JSON içinde yinelenen soru ID var.');return result;
}
const publicFields=['questionId','gradeLevel','subject','unitId','topic','topicName','questionText','content','choices','visual','visualPlacement','sourceDatasetId','status','isDemo'];
export async function bankProjection(tree,records){
 const questions=new Map(records.filter(r=>r.question.status==='published'&&!r.question.isDemo&&r.question.sourceDatasetId===tree.sourceDatasetId).map(r=>[r.question.questionId,r])),templates=[];
 async function packs(ids,subject,unit,topic){const out=[];for(let i=0;i<ids.length;i+=10){const selected=ids.slice(i,i+10),packId=`pack-${i/10+1}`,metadata={active:true,gradeLevel:tree.grade,subject:subject.id,subjectName:subject.name,unitId:unit.id,unitName:unit.displayName||unit.name,topic:topic?.id||'',topicName:topic?.name||'',packId,packName:`Test ${i/10+1}`,questionIds:selected,choiceIdsByQuestionId:Object.fromEntries(selected.map(id=>[id,questions.get(id).question.choices.map(c=>c.choiceId)])),questions:selected.map(id=>Object.fromEntries(publicFields.filter(k=>k in questions.get(id).question).map(k=>[k,questions.get(id).question[k]])))};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([metadata,selected.map(id=>questions.get(id).answer)]))),templateId=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');templates.push({id:templateId,data:metadata,answers:selected.map(id=>({id,data:questions.get(id).answer}))});out.push({id:packId,name:metadata.packName,count:selected.length,templateId});}return out;}
 const subjects=[];for(const s of tree.subjects){const units=[];for(const u of s.units){const ids=t=>[...questions].filter(([,r])=>r.question.subject===s.id&&r.question.unitId===u.id&&(!t||r.question.topic===t.id)).map(([id])=>id).sort(),list=ids(),theme=s.navigationModel==='theme-test',topics=[];if(!theme)for(const t of u.topics||[]){const selected=ids(t);topics.push({id:t.id,name:t.name,count:selected.length,packs:await packs(selected,s,u,t)});}units.push({id:u.id,name:u.name,displayName:u.displayName||u.name,count:list.length,packs:theme?await packs(list,s,u):[],topics});}subjects.push({id:s.id,name:s.name,navigationModel:s.navigationModel,...(s.sectionLabel?{sectionLabel:s.sectionLabel}:{}),count:units.reduce((n,u)=>n+u.count,0),units});}
 return {catalog:{grade:tree.grade,subjects},templates};
}
