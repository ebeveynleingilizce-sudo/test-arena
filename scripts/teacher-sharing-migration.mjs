import {createHash,randomUUID} from 'node:crypto';
import {FieldValue} from '@google-cloud/firestore';
const normalize=v=>v?.toMillis?{timestamp:v.toMillis()}:Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
export async function studentFingerprint(db){
 const hash=createHash('sha256'),counts={};for(const group of ['students','studentCodes','learning','studentBindings','awardedQuestions']){const snap=await db.collectionGroup(group).get();counts[group]=snap.size;for(const d of snap.docs.sort((a,b)=>a.ref.path.localeCompare(b.ref.path)))hash.update(JSON.stringify([d.ref.path,normalize(d.data())]));}return {counts,sha256:hash.digest('hex')};
}
export async function migrateTeacherSharing(db,auth,{apply=false,backup=async()=>{}}={}){
 const classes=(await db.collectionGroup('classes').get()).docs.filter(d=>/^teachers\/[^/]+\/classes\/[^/]+$/.test(d.ref.path)&&d.data().status!=='deleting');
 const before=await studentFingerprint(db),plan=[];
 for(const cls of classes){const t=cls.ref.parent.parent.id,c=cls.id,v=cls.data(),ownerUid=v.ownerUid||t;const user=await auth.getUser(ownerUid);if(!user.email)throw Error('Sınıf sahibinin e-posta adresi eksik. Geçiş durduruldu.');
  const members=await cls.ref.collection('teacherMembers').get(),active=members.docs.filter(d=>d.data().status==='active');if(members.docs.some(d=>d.id===ownerUid&&d.data().status!=='active'))throw Error('Sınıf sahibi üyelik durumu tutarsız.');
  const links=await Promise.all([...new Set([ownerUid,...active.map(d=>d.id)])].map(async uid=>{const ref=db.doc(`teacherClassAccess/${uid}/classes/${t}~${c}`),old=await ref.get();return {uid,ref,old};}));
  const fields={...(!v.ownerUid?{ownerUid}:{}),...(!v.createdBy?{createdBy:t}:{}),...(!v.status?{status:'active'}:{})},missingOwner=!members.docs.some(d=>d.id===ownerUid),missingLinks=links.filter(l=>!l.old.exists);
  if(Object.keys(fields).length||missingOwner||missingLinks.length)plan.push({cls,t,c,ownerUid,email:user.email,fields,missingOwner,missingLinks,before:{path:cls.ref.path,data:normalize(v),members:members.docs.map(d=>({path:d.ref.path,data:normalize(d.data())})),links:links.map(l=>({path:l.ref.path,exists:l.old.exists,data:l.old.exists?normalize(l.old.data()):null}))}});
 }
 if(apply&&plan.length){await backup({before,classes:plan.map(p=>p.before)});for(const p of plan){await db.runTransaction(async tx=>{const current=await tx.get(p.cls.ref);if(!current.exists||current.data().ownerUid&&current.data().ownerUid!==p.ownerUid)throw Error('Sınıf sahipliği geçiş sırasında değişti.');const eventId=randomUUID();tx.set(p.cls.ref,{...p.fields,lastActionId:eventId},{merge:true});if(p.missingOwner)tx.create(p.cls.ref.collection('teacherMembers').doc(p.ownerUid),{uid:p.ownerUid,email:p.email,status:'active',lastActionId:eventId});for(const l of p.missingLinks)tx.create(l.ref,{storageUid:p.t,classId:p.c});tx.create(p.cls.ref.collection('audit').doc(eventId),{actorUid:p.ownerUid,actorEmail:p.email,operation:'sharingEnabled',targetId:p.c,changes:{storageUid:p.t},at:FieldValue.serverTimestamp()});});}}
 const after=await studentFingerprint(db);if(before.sha256!==after.sha256)throw Error('Geçiş sırasında öğrenci verileri değişti. Yedek ve eş zamanlı işlemler kontrol edilmeli.');return {apply,classCount:classes.length,classesToUpdate:plan.length,studentDataPreserved:true,before,after};
}
