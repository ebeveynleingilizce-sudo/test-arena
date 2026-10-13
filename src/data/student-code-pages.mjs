import {collection,documentId,getDocsFromServer,query,where} from 'firebase/firestore';
import {measuredRead} from './read-measurement.mjs';

// Small ID pages keep per-student Rules dependencies within the query budget.
// No credential values are cached across teacher or screen lifetimes.
export async function readStudentCodePages(db,storageUid,ids,alive=()=>true){
 const codes={};
 for(let offset=0;offset<ids.length;offset+=5){
  if(!alive())return codes;
  const page=await measuredRead(db,()=>getDocsFromServer(query(collection(db,'teachers',storageUid,'studentCodes'),where(documentId(),'in',ids.slice(offset,offset+5)))));
  if(!alive())return codes;
  for(const d of page.docs)codes[storageUid+'~'+d.id]=d.data().code||'';
 }
 return codes;
}
