import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {discoverScopes,filterScopes,createOrchestrationPlan} from '../../functions/lib/question-engine/orchestrator.js';
import {resolveGeneration,generationStrategies} from '../../functions/lib/question-engine/orchestration-strategies.js';
import {parseOrchestrationArgs} from '../../scripts/question-engine-orchestrate-args.mjs';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const canonical=read('../../data/mufredat/2-sinif.json'),navigation=read('../../data/mufredat/2-sinif-ui-v2.json');
const config=read('../../data/question-engine/orchestration-policy.json'),policy=read('../../data/question-engine/refill-policy.json');
const items=discoverScopes([{canonical,navigation}]);
const supported=items.filter(i=>i.context&&resolveGeneration(i.context,config).status==='SUPPORTED');
function store(counts={}) {
  const calls=[];return {calls,summary:async c=>{calls.push(c);const count=counts[c.subjectId]??0;
    return {count,curated:count,aiVerified:0,byFamily:{},byDifficulty:{},fingerprints:[]};},
    publish:()=>assert.fail('write prohibited'),acquire:()=>assert.fail('write prohibited'),renew:()=>assert.fail('write prohibited'),release:()=>assert.fail('write prohibited')};
}
test('canonical discovery finds both proven scopes without a hard-coded inventory',()=>{
  assert.equal(supported.length,2);assert.ok(items.length>100);
  assert.ok(supported.every(i=>i.context.outcomeText&&i.context.curriculumVersion&&i.context.navigationModel));
  assert.ok(supported.some(i=>i.scope.outcomeCode==='MAT.2.1.2'));
});
test('English bare codes are not attached to subthemes and missing mappings remain visible',()=>{
  const english=items.filter(i=>i.scope.subjectId==='ingilizce');
  assert.ok(english.some(i=>i.scope.outcomeCode&&!i.scope.subthemeId));
  assert.ok(english.every(i=>i.reason==='CURRICULUM_MAPPING_INCOMPLETE'));
  assert.ok(items.some(i=>i.scope.subjectId==='turkce'&&i.reason==='CURRICULUM_MAPPING_INCOMPLETE'));
});
test('missing navigation fails closed, duplicate canonical scopes reject',()=>{
  assert.ok(discoverScopes([{canonical}]).every(i=>i.reason));
  assert.throws(()=>discoverScopes([{canonical,navigation},{canonical,navigation}]),/DUPLICATE_CURRICULUM_SCOPE/);
});
test('combined grade/subject/unit/topic CLI filters discover precisely the selected scope',()=>{
  const i=supported[0],f=parseOrchestrationArgs(['--plan','--grade','2','--subject',i.scope.subjectId,'--unit',i.scope.unitId,'--topic',i.scope.topicId]);
  assert.deepEqual(filterScopes(items,f),[i]);assert.equal(filterScopes(items,{grade:12}).length,0);
});
for(const args of [['--publish'],['--gemini'],['--grade','1'],['--grade','13'],['--subject'],['--grade','2','--grade','3']])
test('CLI rejects execution/invalid filters '+args.join(' '),()=>assert.throws(()=>parseOrchestrationArgs(args)));
test('CLI without flags is read-only plan',()=>assert.deepEqual(parseOrchestrationArgs([]),{}));
test('two strategy families separate scope from reusable generation templates',()=>{
  assert.equal(Object.keys(generationStrategies).length,2);
  for(const i of supported) {
    const r=resolveGeneration(i.context,config);assert.equal(r.status,'SUPPORTED');
    assert.deepEqual(r.allowedQuestionTypes,['multiple-choice']);assert.equal(r.profile.scope.outcomeCode,i.scope.outcomeCode);
    assert.equal(r.verification,i.scope.subjectId==='matematik'?'deterministic':'independent_ai');
  }
});
test('missing capability and unresolved context are unsupported',()=>{
  assert.equal(resolveGeneration(supported[0].context,{...config,bindings:[]}).reason,'NO_GENERATION_STRATEGY');
  assert.equal(resolveGeneration({...supported[0].context},config).reason,'CURRICULUM_MAPPING_INCOMPLETE');
});
test('unknown strategy, unsupported visual, missing grade policy and conflicting mappings fail closed',()=>{
  const i=supported[0],b=config.bindings.find(b=>b.match.outcomeCode===i.scope.outcomeCode);
  assert.equal(resolveGeneration(i.context,{...config,bindings:[{...b,strategy:'unknown'}]}).reason,'NO_GENERATION_STRATEGY');
  assert.equal(resolveGeneration(i.context,{...config,bindings:[{...b,requiredVisualKinds:['clock']}]}).reason,'UNSUPPORTED_VISUAL_REQUIREMENT');
  assert.equal(resolveGeneration(i.context,{...config,gradePolicies:{}}).reason,'NO_GRADE_POLICY');
  assert.equal(resolveGeneration(i.context,{...config,bindings:[b,b]}).reason,'AMBIGUOUS_CAPABILITY_MAPPING');
});
test('deterministic strategy takes precedence over eligible independent AI',()=>{
  const i=supported[0],b=config.bindings.find(b=>b.match.outcomeCode===i.scope.outcomeCode);
  const r=resolveGeneration(i.context,{...config,bindings:[{...b,strategy:'knowledge-mcq@1'},b]});
  assert.equal(r.verification,'deterministic');
});
test('full pool excluded, gap and minimum distinct, AI/write methods never accessed',async()=>{
  const s=store({matematik:55,'hayat-bilgisi':6}),r=await createOrchestrationPlan(items,config,policy,s);
  assert.equal(r.summary.fullScopes,1);assert.equal(r.full[0].current,55);assert.equal(r.full[0].gap,0);
  assert.equal(r.needsRefill.length,1);assert.equal(r.needsRefill[0].gap,24);assert.equal(r.needsRefill[0].target,30);assert.equal(r.needsRefill[0].minimumUsable,10);
  assert.equal(r.summary.unusableScopes,1);assert.equal(r.generatorCalls,0);assert.equal(r.verifierCalls,0);assert.equal(r.publications,0);assert.equal(s.calls.length,2);
});
test('minimum usable does not imply full; blank pool takes priority over near target',async()=>{
  const r=await createOrchestrationPlan(supported,config,policy,store({matematik:29,'hayat-bilgisi':0}));
  assert.equal(r.needsRefill[0].scope.subjectId,'hayat-bilgisi');assert.equal(r.needsRefill[0].priority,0);
  assert.equal(r.summary.usableButLowScopes,1);assert.equal(r.summary.unusableScopes,1);
});
test('minimum overrides are configurable; minimum above target rejects',async()=>{
  const c={...config,minimumOverrides:[{match:{subjectId:'hayat-bilgisi'},minimumUsable:5}]};
  const r=await createOrchestrationPlan(supported,c,policy,store({matematik:30,'hayat-bilgisi':6}));
  assert.equal(r.summary.usableButLowScopes,1);
  await assert.rejects(createOrchestrationPlan(supported,{...config,minimumUsable:31},policy,store()),/MINIMUM_EXCEEDS_TARGET/);
});
test('unsupported scopes are reported and are not counted as empty pools',async()=>{
  const s=store(),r=await createOrchestrationPlan(items,{...config,bindings:[]},policy,s);
  assert.equal(r.summary.unsupportedScopes,items.length);assert.equal(s.calls.length,0);assert.equal(r.summary.unusableScopes,0);
  assert.ok(r.unsupportedReasons.NO_GENERATION_STRATEGY>0);assert.ok(r.unsupportedReasons.CURRICULUM_MAPPING_INCOMPLETE>0);
});
test('inventory failure produces INCOMPLETE instead of a fabricated zero',async()=>{
  const r=await createOrchestrationPlan(supported,config,policy,{summary:async()=>{throw Error('private details');}});
  assert.equal(r.status,'INCOMPLETE');assert.equal(r.summary.inventoryErrors,2);assert.equal(r.summary.totalGap,0);assert.equal(r.needsRefill.length,0);
});
test('estimates have no monetary/token claims and deterministic verifier estimate is zero',async()=>{
  const r=await createOrchestrationPlan(supported,config,policy,store());
  assert.equal(r.needsRefill.find(i=>i.verification==='deterministic').estimatedVerifierCalls,0);
  assert.equal(r.needsRefill.find(i=>i.verification==='independent_ai').estimatedVerifierCalls,42);
  assert.equal(r.summary.estimatedCandidateCount,84);assert.equal(r.summary.estimatedGeneratorBatches,18);
});
test('2–12 scale: 1100 scopes discovered using one shared binding without core changes',async()=>{
  const datasets=Array.from({length:11},(_,n)=>{
    const grade=n+2,topics=Array.from({length:100},(_,j)=>({id:'t'+j,outcomes:[{code:'O'+j,text:'Explicit canonical outcome '+j}]}));
    return {canonical:{grade,schema_version:'1',dataset_id:'d'+grade,subjects:[{id:'new-subject',units:[{id:'u',topics}]}]},
      navigation:{grade,sourceDatasetId:'d'+grade,subjects:[{id:'new-subject',navigationModel:'unit-topic-test',units:[{id:'u',topics}]}]}};
  });
  const c={...config,gradePolicies:Object.fromEntries(datasets.map(d=>[d.canonical.grade,config.gradePolicies['2']])),
    bindings:[{match:{subjectId:'new-subject'},strategy:'knowledge-mcq@1',family:'KNOWLEDGE_MCQ'}]};
  const discovered=discoverScopes(datasets),r=await createOrchestrationPlan(discovered,c,policy,store({'new-subject':30}));
  assert.equal(discovered.length,1100);assert.equal(r.summary.supportedScopes,1100);assert.equal(r.summary.fullScopes,1100);
});
test('planner import graph excludes runtime/provider transports and execution',()=>{
  for(const path of ['../../functions/src/question-engine/orchestrator.ts','../../functions/src/question-engine/orchestration-strategies.ts','../../scripts/question-engine-orchestrate-local.mjs']) {
    const source=readFileSync(new URL(path,import.meta.url),'utf8');
    assert.doesNotMatch(source,/new Gemini|geminiRefillRuntime|refillPool\(|\.publish\(|\.acquire\(|\.verify\(|\.generateQuestions\(/);
  }
});
