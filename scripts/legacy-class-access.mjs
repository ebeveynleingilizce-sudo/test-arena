// Additive index backfill for groups created before shared-teacher access links.
// Group documents, students, credentials, results and XP are never rewritten.
export async function backfillLegacyClassAccess(db){
 const groups=await db.collectionGroup('classes').get();let created=0;
 for(const group of groups.docs){const path=group.ref.path.split('/'),v=group.data();
  if(path.length!==4||path[0]!=='teachers'||v.ownerUid||v.status==='deleting')continue;
  const t=path[1],c=path[3],link=db.doc(`teacherClassAccess/${t}/classes/${t}~${c}`);
  const added=await db.runTransaction(async tx=>{const old=await tx.get(link);if(old.exists)return false;tx.create(link,{storageUid:t,classId:c});return true;});
  if(added)created++;
 }
 return {createdAccessLinks:created};
}
