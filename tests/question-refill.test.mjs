import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {doc,getDoc,setDoc} from 'firebase/firestore';
import {seedCurriculum} from '../scripts/seed-curriculum.mjs';
import {client} from './helpers.mjs';
import {resolveCurriculumContext} from '../functions/lib/question-engine/curriculum.js';
import {resolveRefillPolicy} from '../functions/lib/question-engine/refill-policy.js';
import {refillPool} from '../functions/lib/question-engine/refill.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../functions/lib/question-engine/fixtures/base-ten.js';
import {validateCandidate} from '../functions/lib/question-engine/pipeline.js';
import {ValidatorRegistry} from '../functions/lib/question-engine/registry.js';

const canonical=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif.json',import.meta.url)));
const nav=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const config=JSON.parse(readFileSync(new URL('../data/question-engine/refill-policy.json',import.meta.url)));
const [math,life]=geminiDryRunProfiles;
const context=resolveCurriculumContext(canonical,nav,math.scope),lifeContext=resolveCurriculumContext(canonical,nav,life.scope);
const registry=new ValidatorRegistry().register(baseTenValidator([context]));
const created=new Set();let store,admin,baseline,lifeBefore,samples,tracked,cursor=0;
before(async()=>{
  await seedCurriculum();admin=getFirestore(getApps().find(a=>a.name==='curriculum-seed'));store=new EmulatorRefillStore();
  baseline=await store.summary(context);lifeBefore=await store.summary(lifeContext);
  const old=(await admin.collection('questions').where('source','==','ai_verified').get()).docs.map(d=>d.data());
  samples=Array.from({length:90},(_,i)=>({tens:1+Math.floor(i/10),ones:i%10})).filter(m=>!old.some(q=>q.subject==='matematik'&&q.unitId===math.scope.unitId&&q.visual?.tens===m.tens&&q.visual?.ones===m.ones));
  assert.ok(samples.length>=6);
  tracked={summary:(...args)=>store.summary(...args),acquire:(...args)=>store.acquire(...args),renew:(...args)=>store.renew(...args),release:(...args)=>store.release(...args),
    async publish(result){const p=await store.publish(result);if(p.newlyPublished)created.add(p.questionId);return p;}};
});
after(async()=>{
  for(const id of created){const q=(await admin.doc('questions/'+id).get()).data(),f=q.provenance.fingerprint;
    await Promise.all([admin.doc('questions/'+id).delete(),admin.doc('privateQuestionAnswers/'+id).delete(),
      admin.doc('questionFingerprints/content_'+f.content).delete(),admin.doc('questionFingerprints/structural_'+f.structural).delete()]);}
  if(store)await store.close();await Promise.all(getApps().map(deleteApp));
});
const policy=target=>resolveRefillPolicy({...config,defaults:{...config.defaults,targetVerifiedQuestions:target}},context,math.family);
function request(target,options={}) {
  const calls=[];
  return {calls,args:{context,family:math.family,policy:policy(target),mode:options.mode??'publish',verification:'deterministic',store:tracked,
    createRuntime(){return {verification:'deterministic',provider:{id:'refill-fixture',async generateQuestions(ctx,{count}) {
      calls.push(count);if(options.wait)await options.wait;
      const values=samples.slice(cursor,cursor+count);cursor+=count;
      return new BaseTenFixtureProvider(values).generateQuestions(ctx,{count});
    }},validate:async(c,duplicates)=>validateCandidate(context,c,math.capability,registry,duplicates,'refill-fixture')};}}};
}
test('curated usable contribution follows Test Builder: 10 mapped unit-2 questions, excludes retired pilot',async()=>{
  assert.equal(baseline.curated,10);assert.equal(baseline.count,baseline.curated+baseline.aiVerified);
  assert.equal(lifeBefore.curated,1);assert.ok(baseline.byDifficulty.easy>0);
});
test('already-full emulator run: zero provider/verifier calls and zero lease/publication writes',async()=>{
  const x=request(baseline.count),before=await admin.doc('curricula/2').get();
  x.args.createRuntime=()=>{throw new Error('must never be called');};
  const r=await refillPool(x.args);assert.equal(r.status,'ALREADY_FULL');assert.equal(r.generatorCalls,0);assert.equal(r.verifierCalls,0);assert.equal(r.published,0);
  assert.equal((await admin.collection('refillLeases').get()).size,0);assert.ok((await admin.doc('curricula/2').get()).updateTime.isEqual(before.updateTime));assert.equal(created.size,0);
});
test('local plan counts without generation, publication or lease',async()=>{
  const x=request(baseline.count+2,{mode:'plan'}),r=await refillPool(x.args);
  assert.equal(r.status,'PLANNED');assert.equal(r.initialGap,2);assert.equal(r.plannedFirstBatch,3);assert.equal(x.calls.length,0);assert.equal(created.size,0);
});
test('real Firestore refill publishes only gap; counts again and stops at target',async()=>{
  const x=request(baseline.count+2),r=await refillPool(x.args);
  assert.deepEqual(x.calls,[3]);assert.equal(r.generated,3);assert.equal(r.published,2);assert.equal(r.finalCount,baseline.count+2);assert.equal(r.status,'FILLED');
  assert.equal(created.size,2);assert.equal((await store.summary(lifeContext)).count,lifeBefore.count);assert.equal((await admin.collection('refillLeases').get()).size,0);
});
test('idempotent full rerun triggers no new runtime/calls/writes',async()=>{
  const x=request(baseline.count+2);x.args.createRuntime=()=>{throw new Error('must not run');};
  const r=await refillPool(x.args);assert.equal(r.status,'ALREADY_FULL');assert.equal(r.generatorCalls,0);assert.equal(created.size,2);
});
test('broken private key is excluded from usable count, then restored (test-owned AI record only)',async()=>{
  const id=[...created][0],ref=admin.doc('privateQuestionAnswers/'+id),key=(await ref.get()).data(),before=(await store.summary(context)).count;
  try {await ref.update({correctOptionId:'invalid'});assert.equal((await store.summary(context)).count,before-1);}
  finally {await ref.set(key);}
});
test('two concurrent refills: only lease owner generates, competitor stops with zero calls',async()=>{
  let unblock,started;const waiting=new Promise(resolve=>unblock=resolve),entered=new Promise(resolve=>started=resolve);
  const target=(await store.summary(context)).count+1,x=request(target,{wait:waiting});
  const factory=x.args.createRuntime;x.args.createRuntime=()=>{const runtime=factory();const generate=runtime.provider.generateQuestions;
    runtime.provider.generateQuestions=async(...args)=>{started();return generate(...args);};return runtime;};
  const first=refillPool(x.args);await entered;
  const competing=request(target),second=await refillPool(competing.args);
  assert.equal(second.stopReason,'REFILL_BUSY');assert.equal(second.generatorCalls,0);assert.equal(competing.calls.length,0);
  unblock();assert.equal((await first).status,'FILLED');assert.equal((await admin.collection('refillLeases').get()).size,0);
});
test('expired lease can be reclaimed; previous owner cannot renew/delete new owner',async()=>{
  const old=await store.acquire(context),doc=(await admin.collection('refillLeases').where('owner','==',old).get()).docs[0];
  await doc.ref.update({expiresAt:Timestamp.fromMillis(Date.now()-1000)});
  const next=await store.acquire(context);assert.ok(next);assert.notEqual(next,old);assert.equal(await store.renew(context,old),false);
  await store.release(context,old);assert.equal((await doc.ref.get()).data().owner,next);await store.release(context,next);
});
test('lease records are denied to clients by existing catch-all Rules',async()=>{
  const c=client();try {await assert.rejects(getDoc(doc(c.db,'refillLeases','fake')));await assert.rejects(setDoc(doc(c.db,'refillLeases','fake'),{owner:'client',expiresAt:999999}));}
  finally {await c.close();}
});
test('curated import and navigation remain immutable after refill',async()=>{
  const r=await seedCurriculum();assert.equal(r.createdDocuments,0);assert.equal(r.updatedNavigationDocuments,0);assert.equal((await store.summary(context)).curated,10);
});
