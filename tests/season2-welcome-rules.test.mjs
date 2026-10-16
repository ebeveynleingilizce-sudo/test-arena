import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment, assertSucceeds, assertFails} from '@firebase/rules-unit-testing';
import {doc, setDoc, updateDoc, getDoc, setLogLevel} from 'firebase/firestore';

let env;
before(async()=>{
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8288');
  setLogLevel('silent');
  env=await initializeTestEnvironment({projectId:'demo-test-arena-season2',firestore:{host:'127.0.0.1',port:8288,rules:await readFile(process.env.SEASON2_RULES || 'firestore.rules','utf8')}});
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'teachers/t/classes/c'),{status:'active'});
    for(const s of ['a','b','c','d']){
      await setDoc(doc(db,`teachers/t/students/${s}`),{studentId:s,teacherUid:'t',classId:'c',firstName:s,lastName:'Test',gradeLevel:9,status:'active',credentialVersion:1});
      await setDoc(doc(db,`studentBindings/${s}`),{teacherUid:'t',studentId:s,version:1});
    }
  });
});
after(async()=>{await env?.cleanup();});

test('acknowledgment persists across authenticated devices and cannot be cleared',async()=>{
  const a=env.authenticatedContext('a').firestore(),otherDevice=env.authenticatedContext('a').firestore();
  await assertSucceeds(updateDoc(doc(a,'teachers/t/students/a'),{season2WelcomeSeen:true}));
  assert.equal((await getDoc(doc(otherDevice,'teachers/t/students/a'))).data().season2WelcomeSeen,true);
  await assertFails(updateDoc(doc(a,'teachers/t/students/a'),{season2WelcomeSeen:false}));
  await assertFails(updateDoc(doc(a,'teachers/t/students/a'),{season2WelcomeSeen:true}));
});
test('acknowledgment cannot change grade, XP, membership or credentials',async()=>{
  const db=env.authenticatedContext('b').firestore(),ref=doc(db,'teachers/t/students/b');
  for(const change of [{gradeLevel:8},{totalXP:99},{classId:'elsewhere'},{credentialVersion:2}])await assertFails(updateDoc(ref,{season2WelcomeSeen:true,...change}));
  await assertFails(updateDoc(ref,{season2WelcomeSeen:'true'}));
  await assertSucceeds(updateDoc(ref,{season2WelcomeSeen:true}));
});
test('other students, teachers and signed-out clients cannot mark a student',async()=>{
  for(const context of [env.authenticatedContext('b'),env.authenticatedContext('teacher'),env.unauthenticatedContext()])await assertFails(updateDoc(doc(context.firestore(),'teachers/t/students/c'),{season2WelcomeSeen:true}));
});
test('revoked credentials cannot mark an announcement',async()=>{
  await env.withSecurityRulesDisabled(context=>updateDoc(doc(context.firestore(),'studentBindings/d'),{version:0}));
  await assertFails(updateDoc(doc(env.authenticatedContext('d').firestore(),'teachers/t/students/d'),{season2WelcomeSeen:true}));
});
