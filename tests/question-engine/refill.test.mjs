import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../../functions/lib/question-engine/curriculum.js';
import {refillPool} from '../../functions/lib/question-engine/refill.js';
import {resolveRefillPolicy} from '../../functions/lib/question-engine/refill-policy.js';
import {geminiRefillRuntime} from '../../functions/lib/question-engine/refill-runtime.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../../functions/lib/question-engine/fixtures/base-ten.js';
import {validateCandidate} from '../../functions/lib/question-engine/pipeline.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {fingerprint} from '../../functions/lib/question-engine/fingerprint.js';
import {parseRefillArgs} from '../../scripts/question-engine-refill-args.mjs';

const canonical=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif.json',import.meta.url)));
const nav=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const config=JSON.parse(readFileSync(new URL('../../data/question-engine/refill-policy.json',import.meta.url)));
const [math,life]=geminiDryRunProfiles;
const context=resolveCurriculumContext(canonical,nav,math.scope),lifeContext=resolveCurriculumContext(canonical,nav,life.scope);
const policy=patch=>resolveRefillPolicy({...config,defaults:{...config.defaults,...patch}},context,math.family);
class MemoryStore {
  constructor(base=25){this.base=base;this.published=new Map();this.writes=0;this.lock=null;this.fail=false;this.duplicate=false;}
  async summary(){return {count:this.base+this.published.size,curated:this.base,aiVerified:this.published.size,byDifficulty:{},byFamily:{},fingerprints:[...this.published.values()]};}
  async acquire(){if(this.lock)return null;this.lock='owner';this.writes++;return this.lock;}
  async renew(){return !!this.lock;}
  async release(){this.lock=null;this.writes++;}
  async publish(result){
    if(this.fail)throw new Error('secret remote error');
    assert.ok(acceptedSnapshot(result));const f=fingerprint(acceptedSnapshot(result).candidate);
    if(this.duplicate||[...this.published.values()].some(p=>p.content===f.content||p.structural===f.structural))return {newlyPublished:false,duplicate:true};
    this.published.set(f.content,f);this.writes+=4;return {newlyPublished:true,duplicate:false};
  }
}
function request({base=25,patch={},mode='publish',mutate,constant=false,throwProvider=false}={}) {
  const store=new MemoryStore(base),p=policy(patch),counts=[],created={runtime:0};let cursor=0;
  return {store,counts,created,args:{context,family:math.family,policy:p,mode,verification:'deterministic',store,
    createRuntime(){created.runtime++;const reg=new ValidatorRegistry().register(baseTenValidator([context]));
      return {verification:'deterministic',provider:{id:'mock-fixture',async generateQuestions(ctx,{count}) {
        counts.push(count);if(throwProvider)throw new Error('provider unavailable');
        const samples=Array.from({length:count},()=>constant?{tens:3,ones:7}:{tens:1+Math.floor(cursor/10),ones:cursor++%10});
        const qs=await new BaseTenFixtureProvider(samples).generateQuestions(ctx,{count});if(mutate)mutate(qs,counts.length);return qs;
      }},validate:async(c,duplicates)=>validateCandidate(context,c,math.capability,reg,duplicates,'mock-fixture')};
    }}};
}

test('ALREADY_FULL: 30/30 does not construct runtime, call providers or write anything',async()=>{
  const x=request({base:30});const r=await refillPool(x.args);
  assert.equal(r.status,'ALREADY_FULL');assert.equal(r.generatorCalls,0);assert.equal(r.verifierCalls,0);assert.equal(x.created.runtime,0);assert.equal(x.store.writes,0);
});
test('untrusted provider exception text does not become report diagnostics',async()=>{
 const x=request({throwProvider:true}),r=await refillPool(x.args);
 assert.equal(r.stopReason,'PROVIDER_FAILURE');assert.equal(r.providerError,null);
 assert.equal(JSON.stringify(r).includes('provider unavailable'),false);
});
test('count above target also stops with zero calls/writes',async()=>{
  const x=request({base:33});const r=await refillPool(x.args);assert.equal(r.remainingGap,0);assert.equal(r.status,'ALREADY_FULL');assert.equal(x.store.writes,0);
});
test('25/30 fills only gap: one bounded batch, five new questions',async()=>{
  const x=request(),r=await refillPool(x.args);assert.equal(r.initialGap,5);assert.deepEqual(x.counts,[5]);
  assert.equal(r.published,5);assert.equal(r.finalCount,30);assert.equal(r.status,'FILLED');assert.equal(r.verifierCalls,0);
});

test('CLI max-batches 1 publishes first five only, preserving target/policy and releasing lease',async()=>{
  const cli=parseRefillArgs(['life-studies-planning','--gemini','--publish','--max-batches','1']);
  const x=request({base:1}),snapshot=JSON.stringify(x.args.policy);
  const r=await refillPool({...x.args,mode:cli.mode,maxBatches:cli.maxBatches});
  assert.equal(r.initialCount,1);assert.equal(r.targetCount,30);assert.equal(r.initialGap,29);
  assert.deepEqual(x.counts,[5]);assert.equal(r.generated,5);assert.equal(r.accepted,5);assert.equal(r.published,5);
  assert.equal(r.finalCount,6);assert.equal(r.remainingGap,24);assert.equal(r.status,'PARTIAL');assert.equal(r.stopReason,'RUN_BATCH_LIMIT');
  assert.equal(r.runMaxBatches,1);assert.equal(JSON.stringify(x.args.policy),snapshot);assert.equal(x.store.lock,null);
});

test('run limit never raises policy hard limit',async()=>{
  const x=request({base:1,patch:{maxBatches:1}}),r=await refillPool({...x.args,maxBatches:100});
  assert.deepEqual(x.counts,[5]);assert.equal(r.runMaxBatches,1);assert.equal(r.status,'PARTIAL');assert.equal(r.stopReason,'HARD_LIMIT');
});

test('plan with CLI max-batches reports unchanged target, zero AI and writes',async()=>{
  const cli=parseRefillArgs(['life-studies-planning','--plan','--max-batches','1']),x=request({base:1});
  const r=await refillPool({...x.args,mode:cli.mode,maxBatches:cli.maxBatches});
  assert.equal(r.status,'PLANNED');assert.equal(r.targetCount,30);assert.equal(r.initialGap,29);assert.equal(r.plannedFirstBatch,5);
  assert.equal(r.runMaxBatches,1);assert.equal(r.generatorCalls,0);assert.equal(r.verifierCalls,0);assert.equal(x.created.runtime,0);assert.equal(x.store.writes,0);
});

test('target reached in first batch still returns FILLED with run limit',async()=>{
  const x=request(),r=await refillPool({...x.args,maxBatches:1});assert.equal(r.status,'FILLED');assert.equal(r.finalCount,30);
});

test('CLI defaults stay plan without a run override',()=>{
  assert.deepEqual(parseRefillArgs(['math-base-ten']),{id:'math-base-ten',mode:'plan',maxBatches:undefined});
});

for(const value of ['0','-1','1.5','NaN','Infinity','9007199254740992',undefined])
test('CLI rejects invalid max-batches '+value,()=>{
  assert.throws(()=>parseRefillArgs(['math-base-ten','--max-batches',...(value===undefined?[]:[value])]),/INVALID_RUN_MAX_BATCHES/);
});

test('CLI preserves explicit Gemini requirement and rejects duplicate/conflicting flags',()=>{
  assert.throws(()=>parseRefillArgs(['math-base-ten','--publish','--max-batches','1']),/EXPLICIT_GEMINI_REQUIRED/);
  assert.throws(()=>parseRefillArgs(['math-base-ten','--max-batches','1','--max-batches','2']),/INVALID_REFILL_FLAGS/);
  assert.throws(()=>parseRefillArgs(['math-base-ten','--plan','--publish']),/INVALID_REFILL_FLAGS/);
  assert.throws(()=>parseRefillArgs(['math-base-ten','--unknown']),/INVALID_REFILL_FLAGS/);
});

test('core rejects invalid run limit before store/runtime access',async()=>{
  for(const maxBatches of [0,-1,1.5,NaN,Infinity]) {
    const x=request();x.store.summary=()=>assert.fail('must not read store');
    await assert.rejects(refillPool({...x.args,maxBatches}),/INVALID_RUN_MAX_BATCHES/);
    assert.equal(x.store.writes,0);assert.equal(x.created.runtime,0);
  }
});
test('overgeneration is gap-based; stop publishing exactly at target',async()=>{
  const x=request({patch:{targetVerifiedQuestions:27}}),r=await refillPool(x.args);
  assert.deepEqual(x.counts,[3]);assert.equal(r.generated,3);assert.equal(r.published,2);assert.equal(r.unprocessed,1);assert.equal(r.finalCount,27);
});
test('rejection causes only a smaller second batch (5 then 2)',async()=>{
  const x=request({mutate:(qs,batch)=>{if(batch===1)qs[0].correctOptionId='b';}}),r=await refillPool(x.args);
  assert.deepEqual(x.counts,[5,2]);assert.equal(r.rejected,1);assert.equal(r.published,5);assert.equal(r.finalCount,30);assert.equal(r.status,'FILLED');
});
test('same refill rerun on full pool costs zero extra calls/writes',async()=>{
  const x=request();await refillPool(x.args);const writes=x.store.writes,created=x.created.runtime;
  const r=await refillPool(x.args);assert.equal(r.status,'ALREADY_FULL');assert.equal(r.generatorCalls,0);assert.equal(x.store.writes,writes);assert.equal(x.created.runtime,created);
});
test('duplicates are prefiltered and saturation stops without infinite retry',async()=>{
  const x=request({constant:true}),r=await refillPool(x.args);
  assert.equal(r.published,1);assert.equal(r.finalCount,26);assert.equal(r.status,'PARTIAL');assert.equal(r.stopReason,'NO_PROGRESS');
  assert.equal(r.batches,3);assert.equal(r.duplicatesSkipped,14);
});
test('publication duplicate skips do not count as newly published',async()=>{
  const x=request();x.store.duplicate=true;const r=await refillPool(x.args);
  assert.equal(r.status,'PARTIAL');assert.equal(r.published,0);assert.equal(r.finalCount,25);assert.equal(r.duplicatesSkipped,10);
});
for(const [limit,value] of [['maxBatches',1],['maxProviderCalls',1],['maxGeneratedCandidates',3]])
test('hard limit yields PARTIAL: '+limit,async()=>{
  const x=request({patch:{[limit]:value},mutate:qs=>qs[0].correctOptionId='b'}),r=await refillPool(x.args);
  assert.equal(r.status,'PARTIAL');assert.equal(r.stopReason,'HARD_LIMIT');assert.equal(r.generatorCalls,1);assert.ok(r.requestedCandidates<=x.args.policy.maxGeneratedCandidates);
});
test('provider failure stops, releases lease and preserves existing pool',async()=>{
  const x=request({throwProvider:true}),r=await refillPool(x.args);assert.equal(r.status,'FAILED');assert.equal(r.stopReason,'PROVIDER_FAILURE');assert.equal(r.finalCount,25);assert.equal(x.store.lock,null);
});
test('malformed batch stops without publication',async()=>{
  const x=request({mutate:qs=>qs.pop()}),r=await refillPool(x.args);assert.equal(r.status,'FAILED');assert.equal(r.stopReason,'INVALID_BATCH');assert.equal(r.published,0);
});
test('publication failure preserves progress/count, stops safely and releases lease',async()=>{
  const x=request();x.store.fail=true;const r=await refillPool(x.args);assert.equal(r.status,'FAILED');assert.equal(r.stopReason,'PUBLICATION_FAILURE');assert.equal(r.finalCount,25);assert.equal(x.store.lock,null);
});
test('lease busy prevents any generator/verifier invocation',async()=>{
  const x=request();x.store.lock='other';const r=await refillPool(x.args);assert.equal(r.stopReason,'REFILL_BUSY');assert.equal(r.generatorCalls,0);assert.equal(x.created.runtime,0);
});
test('lost lease stops before further API calls/publication',async()=>{
  const x=request();x.store.renew=async()=>false;const r=await refillPool(x.args);assert.equal(r.stopReason,'LEASE_LOST');assert.equal(r.generatorCalls,0);
});
test('default plan reads only: gap/count/verification/first batch, no writes',async()=>{
  const x=request({mode:'plan'}),r=await refillPool(x.args);assert.equal(r.status,'PLANNED');assert.equal(r.initialCount,25);assert.equal(r.plannedFirstBatch,5);assert.equal(x.created.runtime,0);assert.equal(x.store.writes,0);
});
test('dry-run validates one batch without leases or pool writes',async()=>{
  const x=request({mode:'dry-run'}),r=await refillPool(x.args);assert.equal(r.status,'DRY_RUN');assert.equal(r.accepted,5);assert.equal(r.published,0);assert.equal(x.store.writes,0);assert.equal(r.finalCount,25);
});
test('policy supports ordered grade/subject/topic/family/difficulty targets without subject branches',()=>{
  const p=resolveRefillPolicy({...config,targets:[{match:{grade:2},targetVerifiedQuestions:40},
    {match:{topicId:context.topicId,family:math.family,difficulty:'easy'},targetVerifiedQuestions:12}]},context,math.family,'easy');
  assert.equal(p.targetVerifiedQuestions,12);assert.equal(resolveRefillPolicy(config,context,math.family).targetVerifiedQuestions,30);
});
for(const patch of [{maxBatches:0},{maxGeneratedCandidates:1000},{overgenerationFactor:2},{batchSize:50}])
test('invalid/unbounded policy rejects: '+JSON.stringify(patch),()=>assert.throws(()=>policy(patch),/INVALID_REFILL_POLICY/));

function geminiMock({failVerifier=false,ambiguous=false}={}) {
  let cursor=0;const calls=[];
  const transport=async(url,init)=>{
    const input=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);calls.push(input);
    let data;
    if(input.count) data={questions:Array.from({length:input.count},()=>{const i=cursor++;return {scope:input.curriculum,type:'multiple-choice',difficulty:'easy',
      question:'Plan yapmak hangi yararı sağlar? Senaryo '+i,options:[{id:'a',text:'İşleri zamanında bitirmek '+i},{id:'b',text:'Ödevleri unutmak '+i},{id:'c',text:'Geç kalmak '+i}],
      correctOptionId:'a',explanation:'Zamanı planlamak işleri tamamlamaya yardımcı olur.',family:life.family,model:{}};})};
    else {
      assert.equal('correctOptionId' in input,false);assert.equal('explanation' in input,false);
      if(failVerifier)throw new Error('mock secret');
      data={selectedOptionId:'a',justification:'Planlamak zamanı düzenler.',hasSingleCorrectAnswer:!ambiguous,curriculumAligned:true,
        gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.97,issues:[]};
    }
    return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}],usageMetadata:{totalTokenCount:160}}));
  };
  return {transport,calls};
}
async function withMockKey(run){const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-only';try{return await run();}finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}}
function aiRequest(options={},patch={}) {
  const mock=geminiMock(options),p=policy(patch),store=new MemoryStore();
  return {mock,store,args:{context:lifeContext,family:life.family,policy:p,mode:'publish',verification:'independent_ai',store,
    createRuntime:budget=>geminiRefillRuntime(lifeContext,life,p,budget,mock.transport)}};
}
test('mock Gemini refill: generator + blind independent verifier, token totals and fill',()=>withMockKey(async()=>{
  const x=aiRequest(),r=await refillPool(x.args);assert.equal(r.status,'FILLED');assert.equal(r.verifierCalls,5);assert.equal(r.generatorCalls,1);assert.equal(r.totalTokens,960);assert.equal(r.published,5);
}));
test('hard verifier limit caps actual calls, not merely batch count',()=>withMockKey(async()=>{
  const x=aiRequest({}, {maxVerifierCalls:2}),r=await refillPool(x.args);assert.equal(r.status,'PARTIAL');assert.equal(r.verifierCalls,2);assert.equal(x.mock.calls.length,3);assert.equal(r.published,2);assert.equal(r.stopReason,'HARD_LIMIT');
}));
test('token threshold stops next calls; no token optimization or hidden retry',()=>withMockKey(async()=>{
  const x=aiRequest({}, {maxTotalTokens:200}),r=await refillPool(x.args);assert.equal(r.status,'PARTIAL');assert.equal(r.verifierCalls,1);assert.equal(r.totalTokens,320);assert.equal(x.mock.calls.length,2);
}));
test('verifier provider failure stops safely before any publication',()=>withMockKey(async()=>{
  const x=aiRequest({failVerifier:true}),r=await refillPool(x.args);assert.equal(r.status,'FAILED');assert.equal(r.stopReason,'VERIFICATION_FAILURE');assert.equal(r.published,0);
}));
test('critical question rejection does not publish, exhausts bounded no-progress policy',()=>withMockKey(async()=>{
  const x=aiRequest({ambiguous:true}),r=await refillPool(x.args);assert.equal(r.status,'PARTIAL');assert.equal(r.rejected,10);assert.equal(r.published,0);assert.equal(r.generatorCalls,2);
}));
test('Quiz/application has no refill/generator/verifier import or student trigger',()=>{
  for(const path of ['../../functions/src/quiz.ts','../../functions/src/index.ts','../../src/main.tsx']) {
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.equal(/refillPool|GeminiProvider|GeminiVerifier|refill-runtime|refill-store/.test(source),false);
  }
});
