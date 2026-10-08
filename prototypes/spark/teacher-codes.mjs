// Isolated Spark experiment. Only client Auth/Firestore SDKs; no Admin operations.
import {createUserWithEmailAndPassword} from 'firebase/auth';
import {doc,getDoc,setDoc,writeBatch,runTransaction} from 'firebase/firestore';
import {codeCredentials} from './client.mjs';
const base=(t,s)=>`teachers/${t}/students/${s}`;
function isolated(db){
  if(db.app.options.projectId!=='demo-test-arena-spark-prototype')throw Error('Isolated prototype only');
}
export function makeStudentCode(){
  const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>alphabet[b&31]).join('');
}
export async function createStudentProfile(db,t,s,classId,gradeLevel) {
  isolated(db);
  await setDoc(doc(db,base(t,s)),{teacherUid:t,studentId:s,classId,gradeLevel,status:'pending',credentialVersion:0});
  const batch=writeBatch(db);
  batch.set(doc(db,`${base(t,s)}/learning/summary`),{totalXP:0,academicXP:0,lastAwardQuestionId:''});
  batch.set(doc(db,`teachers/${t}/classes/${classId}/leaderboard/${s}`),{studentId:s,classId,academicXP:0,weeklyAcademicXP:0,weekKey:'',lastAwardQuestionId:''});
  await batch.commit();
}
export async function issueCode(teacherDb,enrollmentAuth,enrollmentDb,t,s,code=makeStudentCode()) {
  isolated(teacherDb);isolated(enrollmentDb);
  if(enrollmentAuth.app.options.projectId!=='demo-test-arena-spark-prototype'
    || enrollmentAuth.emulatorConfig?.host!=='127.0.0.1' || enrollmentAuth.emulatorConfig?.port!==9199)throw Error('Isolated Auth emulator required');
  // Enrollment uses a separate Firebase app; teacher's session stays intact.
  const credentials=codeCredentials(code);
  const profile=(await getDoc(doc(teacherDb,base(t,s)))).data();
  const version=profile.credentialVersion+1;
  await setDoc(doc(teacherDb,`codeTickets/${code}`),{teacherUid:t,studentId:s,version,email:credentials.email});
  const {user}=await createUserWithEmailAndPassword(enrollmentAuth,credentials.email,credentials.password);
  await setDoc(doc(enrollmentDb,`enrollmentProofs/${user.uid}`),{teacherUid:t,studentId:s,version,code});
  await runTransaction(teacherDb,async tx=>{
    const ref=doc(teacherDb,base(t,s));
    const current=(await tx.get(ref)).data();
    if(current.credentialVersion!==version-1)throw Error('Concurrent code renewal; retry with a fresh code');
    tx.set(doc(teacherDb,`studentBindings/${user.uid}`),{teacherUid:t,studentId:s,version});
    tx.set(doc(teacherDb,`roles/${user.uid}`),{role:'student'});
    tx.update(ref,{status:'active',credentialVersion:version,authUid:user.uid});
  });
  return {uid:user.uid,code,version};
}
