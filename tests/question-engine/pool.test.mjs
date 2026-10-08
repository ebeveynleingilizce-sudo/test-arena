import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../../functions/lib/question-engine/curriculum.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../../functions/lib/question-engine/fixtures/base-ten.js';
import {validateCandidate} from '../../functions/lib/question-engine/pipeline.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {requirePublicationEmulator} from '../../functions/lib/question-engine/publication.js';
import {poolScopeIds,poolNavigation} from '../../functions/lib/question-engine/pool-navigation.js';
import {testPacks} from '../../functions/lib/test-packs.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';

const context=resolveCurriculumContext(JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif.json',import.meta.url))),
  JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif-ui-v2.json',import.meta.url))),geminiDryRunProfiles[0].scope);
const registry=new ValidatorRegistry().register(baseTenValidator([context]));
const candidate=async()=> (await new BaseTenFixtureProvider().generateQuestions(context,{count:1}))[0];

test('only original engine ACCEPT has a receipt; serialized/forged/rejected results do not',async()=>{
  const c=await candidate(),r=validateCandidate(context,c,geminiDryRunProfiles[0].capability,registry);
  assert.ok(acceptedSnapshot(r));assert.equal(acceptedSnapshot(structuredClone(r)),null);
  assert.equal(acceptedSnapshot({...r,decision:'ACCEPT'}),null);
  c.correctOptionId='b';const rejected=validateCandidate(context,c,geminiDryRunProfiles[0].capability,registry);
  assert.equal(rejected.decision,'REJECT');assert.equal(acceptedSnapshot(rejected),null);
});
test('candidate cannot mint verification via a flag',async()=>{
  const c=await candidate();c.verified=true;
  const r=validateCandidate(context,c,geminiDryRunProfiles[0].capability,registry);
  assert.equal(r.decision,'REJECT');assert.equal(acceptedSnapshot(r),null);
});
test('receipt snapshots cannot be changed by candidate/result mutation or server inspection',async()=>{
  const c=await candidate(),r=validateCandidate(context,c,geminiDryRunProfiles[0].capability,registry);
  c.correctOptionId='b';c.question='Mutated';r.fingerprints.content='forged';r.solvedOptionId='b';
  const snapshot=acceptedSnapshot(r);assert.equal(snapshot.candidate.correctOptionId,'a');
  snapshot.candidate.correctOptionId='c';assert.equal(acceptedSnapshot(r).candidate.correctOptionId,'a');
});
test('publication guard refuses missing/remote endpoints and all live project IDs',()=>{
  const saved={host:process.env.FIRESTORE_EMULATOR_HOST,g:process.env.GCLOUD_PROJECT,p:process.env.GOOGLE_CLOUD_PROJECT};
  try {
    for(const [host,project] of [[undefined,'demo-test-arena'],['firestore.googleapis.com:443','demo-test-arena'],['127.0.0.1:8080','real-project']]) {
      if(host===undefined)delete process.env.FIRESTORE_EMULATOR_HOST;else process.env.FIRESTORE_EMULATOR_HOST=host;
      process.env.GCLOUD_PROJECT=project;delete process.env.GOOGLE_CLOUD_PROJECT;assert.throws(requirePublicationEmulator,/LOCAL_DEMO/);
    }
    process.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8080';process.env.GCLOUD_PROJECT='demo-test-arena';
    requirePublicationEmulator();process.env.GOOGLE_CLOUD_PROJECT='real-project';assert.throws(requirePublicationEmulator,/LOCAL_DEMO/);
  } finally {
    for(const [key,value] of Object.entries({FIRESTORE_EMULATOR_HOST:saved.host,GCLOUD_PROJECT:saved.g,GOOGLE_CLOUD_PROJECT:saved.p}))
      if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
});
const scope={grade:2,subjectId:'math',unitId:'u',topicId:'t'};
const q={questionId:'qe_ai_1',gradeLevel:2,subject:'math',unitId:'u',topic:'t',source:'ai_verified',status:'published',isDemo:false};
test('pool merges curated + AI only within exact published non-demo scope',()=>{
  const invalid=[{gradeLevel:3},{subject:'life'},{unitId:'other'},{topic:'other'},{status:'draft'},{source:'untrusted'},{isDemo:true}].map(change=>({...q,...change,questionId:'bad'}));
  assert.deepEqual(poolScopeIds(['curated'],[q,q,...invalid],scope),['curated','qe_ai_1']);
});
test('six questions form one partial pack without multiplication or AI calls',()=>{
  const ids=Array.from({length:6},(_,i)=>'q'+i);const packs=testPacks(ids);
  assert.equal(packs.length,1);assert.equal(packs[0].questionIds.length,6);assert.equal(new Set(packs[0].questionIds).size,6);
});
test('AI IDs append after current curated g2 IDs; existing full pack preserved',()=>{
  const ids=Array.from({length:10},(_,i)=>'g2-curated-'+i);
  assert.deepEqual(testPacks([...ids,'qe_ai_new'])[0].questionIds,testPacks(ids)[0].questionIds);
});
test('navigation merge is ephemeral and does not modify original source tree',()=>{
  const tree={grade:2,subjects:[{id:'math',units:[{id:'u',questionIds:['curated'],topics:[{id:'t',questionIds:['curated']}]}]}]};
  const before=structuredClone(tree),merged=poolNavigation(tree,[q]);
  assert.deepEqual(tree,before);assert.deepEqual(merged.subjects[0].units[0].topics[0].questionIds,['curated','qe_ai_1']);
});
