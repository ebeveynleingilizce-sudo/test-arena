import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolveCurriculumContext} from '../../functions/lib/question-engine/curriculum.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {VerifierRegistry,VerificationRouter} from '../../functions/lib/question-engine/verification.js';
import {dryRun,validateCandidateWithRouter} from '../../functions/lib/question-engine/pipeline.js';
import {DuplicateIndex} from '../../functions/lib/question-engine/fingerprint.js';
import {MIN_VERIFIER_CONFIDENCE} from '../../functions/lib/question-engine/quality-gate.js';
import {GeminiVerifier,verifierResponseSchema} from '../../functions/lib/question-engine/providers/gemini-verifier.js';
import {GeminiProvider} from '../../functions/lib/question-engine/providers/gemini.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../../functions/lib/question-engine/fixtures/base-ten.js';

// All transports below are injected mocks. No real API, Firebase or publication.
const canonical=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif.json',import.meta.url)));
const nav=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const [math,life]=geminiDryRunProfiles;
const context=resolveCurriculumContext(canonical,nav,life.scope);
const mathContext=resolveCurriculumContext(canonical,nav,math.scope);
const candidate=()=>({candidateId:'local-life-1',scope:{...context},type:'multiple-choice',difficulty:'easy',
  question:'Ödevini ve oyununu planlayan Ece hangi davranışın yararını görür?',
  options:[{id:'a',text:'İşlerini zamanında tamamlamak'},{id:'b',text:'Ödevini unutmak'},{id:'c',text:'Daha çok gecikmek'}],
  correctOptionId:'a',explanation:'GENERATOR_PRIVATE_EXPLANATION',family:life.family,model:{}});
const evidence=()=>({selectedOptionId:'a',justification:'Plan yapmak görevleri zamanında tamamlamaya yardımcı olur.',
  hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,
  visualConsistent:true,confidence:0.97,issues:[]});
const envelope=value=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value),thoughtSignature:'opaque'}]}}],
  usageMetadata:{promptTokenCount:100,candidatesTokenCount:60,thoughtsTokenCount:0,totalTokenCount:160}});
const response=value=>new Response(JSON.stringify(envelope(value)));
const mockVerifier=(value=evidence(),options={})=>new GeminiVerifier({getApiKey:()=> 'mock-secret',fetch:async()=>response(value),...options});
function router(verifier=mockVerifier(),deterministic=new ValidatorRegistry(),ctx=context,profile=life) {
  const independent=new VerifierRegistry().register({capability:profile.capability,verifier,contexts:[ctx],families:[profile.family],
    gradePolicy:profile.gradePolicy,visualKinds:[]});
  return new VerificationRouter(deterministic,independent);
}
const evaluate=(v,c=candidate())=>validateCandidateWithRouter(context,c,life.capability,router(v));
const rejects=(result,code)=>{assert.equal(result.decision,'REJECT');assert.equal(result.issues[0].code,code);};

test('canonical HB.2.1.1 scope is real, independent evidence ACCEPTs in memory only',async()=>{
  assert.equal(context.topicId,'g2-hayat-bilgisi-zaman-yonetimi');
  assert.equal(context.outcomeText,'Planlı olmanın kişisel yaşama etkilerini fark edebilme');
  const result=await evaluate(mockVerifier());assert.equal(result.decision,'ACCEPT');assert.equal(result.solvedOptionId,'a');assert.equal(result.dryRun,true);
  assert.deepEqual(Object.keys(result).sort(),['decision','dryRun','fingerprints','solvedOptionId']);
});

test('blind request omits generator answer/explanation/model/ID; structured schema, independent model and metrics',async()=>{
  let captured;
  const v=mockVerifier(evidence(),{model:'independent-verifier-model',fetch:async(url,init)=>{
    captured={url,init,body:JSON.parse(init.body)};return response(evidence());
  }});
  assert.equal((await evaluate(v)).decision,'ACCEPT');
  assert.ok(captured.url.endsWith('/independent-verifier-model:generateContent'));
  assert.equal(captured.init.redirect,'error');assert.equal(captured.url.includes('mock-secret'),false);
  const body=captured.body,input=JSON.parse(body.contents[0].parts[0].text);
  assert.deepEqual(Object.keys(input).sort(),['curriculum','gradePolicy','options','question']);
  assert.deepEqual(input.curriculum,context);assert.deepEqual(input.gradePolicy,life.gradePolicy);
  for(const forbidden of ['correctOptionId','explanation','GENERATOR_PRIVATE_EXPLANATION','candidateId','model','family',
    'studentName','teacherUid','email','shortCode','classId','XP','answerHistory']) assert.equal(JSON.stringify(input).includes(forbidden),false);
  assert.equal(body.generationConfig.responseMimeType,'application/json');assert.deepEqual(body.generationConfig.responseJsonSchema,verifierResponseSchema);
  assert.equal(body.generationConfig.responseJsonSchema.additionalProperties,false);assert.equal('tools' in body,false);
  assert.equal('verified' in verifierResponseSchema.properties,false);
  assert.equal(v.lastRun.totalTokens,160);assert.equal(v.lastRun.inputTokens,100);assert.equal(v.lastRun.outputTokens,60);
  assert.ok(Object.isFrozen(v.lastRun));assert.equal(JSON.stringify(v.lastRun).includes('mock-secret'),false);
});

test('changing only generator key/explanation cannot change the blind solve prompt',async()=>{
  const sent=[];
  const v=mockVerifier(evidence(),{fetch:async(_,init)=>{sent.push(JSON.parse(init.body).contents);return response(evidence());}});
  assert.equal((await evaluate(v)).decision,'ACCEPT');
  const c=candidate();c.correctOptionId='b';c.explanation='A different private generator claim.';
  rejects(await evaluate(v,c),'ANSWER_MISMATCH');assert.deepEqual(sent[0],sent[1]);
});

for(const [name,change,code] of [
  ['different answer',e=>e.selectedOptionId='b','ANSWER_MISMATCH'],
  ['absent option',e=>e.selectedOptionId='d','ANSWER_MISMATCH'],
  ['two defendable answers',e=>e.hasSingleCorrectAnswer=false,'NO_SINGLE_CORRECT_ANSWER'],
  ['no correct option',e=>e.selectedOptionId=null,'NO_SINGLE_CORRECT_ANSWER'],
  ['curriculum mismatch',e=>e.curriculumAligned=false,'CURRICULUM_MISMATCH'],
  ['grade mismatch',e=>e.gradeAppropriate=false,'GRADE_MISMATCH'],
  ['factual error',e=>e.factuallySound=false,'FACTUAL_ERROR'],
  ['ambiguous/incomplete question',e=>e.questionClear=false,'AMBIGUOUS_QUESTION'],
  ['missing or inconsistent visual',e=>e.visualConsistent=false,'VISUAL_MISMATCH'],
  ['critical issue despite true flags',e=>e.issues=['AMBIGUITY'],'VERIFIER_ISSUES'],
  ['low confidence',e=>e.confidence=0.94,'LOW_CONFIDENCE'],
])test('hard quality gate REJECT: '+name,async()=>{
  const e=evidence();e.confidence=0.99;change(e);rejects(await evaluate(mockVerifier(e)),code);
});

test('confidence boundary is an additional signal, not an override',async()=>{
  const e=evidence();e.confidence=MIN_VERIFIER_CONFIDENCE;assert.equal((await evaluate(mockVerifier(e))).decision,'ACCEPT');
  e.curriculumAligned=false;e.confidence=1;rejects(await evaluate(mockVerifier(e)),'CURRICULUM_MISMATCH');
});

for(const [name,change] of [
  ['missing hard check',e=>delete e.factuallySound],['wrong boolean type',e=>e.questionClear='true'],
  ['unknown field',e=>e.verified=true],['direct approval',e=>e.decision='ACCEPT'],
  ['invalid option ID',e=>e.selectedOptionId='z'],['confidence > 1',e=>e.confidence=1.01],
  ['confidence non-number',e=>e.confidence='0.99'],['empty justification',e=>e.justification=' '],
  ['raw SVG',e=>e.justification='<svg/>'],['issue objects',e=>e.issues=[{verified:true}]],
])test('malformed evidence fails closed: '+name,async()=>{
  const e=evidence();change(e);const v=mockVerifier(e);rejects(await evaluate(v),'VERIFICATION_FAILURE');
  assert.equal(v.lastRun.errorCode,'MALFORMED_VERIFICATION');
});

test('quality gate independently checks a non-Gemini verifier contract',async()=>{
  rejects(await evaluate({id:'other',verify:async()=>({...evidence(),verified:true})}),'MALFORMED_VERIFICATION');
  assert.equal((await evaluate({id:'other',verify:async()=>evidence()})).decision,'ACCEPT');
});

for(const [name,payload] of [
  ['empty response',{}],['empty text',{candidates:[{finishReason:'STOP',content:{parts:[{text:''}]}}]}],
  ['malformed JSON',{candidates:[{finishReason:'STOP',content:{parts:[{text:'{broken'}]}}]}],
  ['unfinished response',{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}],
  ['tool call',{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'run'}}]}}]}],
  ['blocked',{promptFeedback:{blockReason:'SAFETY'}}],
])test('verifier transport failure REJECT: '+name,async()=>{
  rejects(await evaluate(mockVerifier(undefined,{fetch:async()=>new Response(JSON.stringify(payload))})),'VERIFICATION_FAILURE');
});

test('timeout also bounds a mock transport which ignores abort',async()=>{
  const v=mockVerifier(undefined,{timeoutMs:20,fetch:async()=>new Promise(()=>{})});
  rejects(await evaluate(v),'VERIFICATION_FAILURE');assert.equal(v.lastRun.errorCode,'TIMEOUT');assert.ok(v.lastRun.latencyMs<2000);
});

test('provider/HTTP errors stay fail-closed and expose no secret bodies',async()=>{
  for(const status of [401,403,429,500]) {
    const v=mockVerifier(undefined,{fetch:async()=>new Response('mock-secret',{status})});
    rejects(await evaluate(v),'VERIFICATION_FAILURE');assert.equal(JSON.stringify(v.lastRun).includes('mock-secret'),false);
  }
  let input;
  await evaluate({id:'capture',verify:async i=>{input=i;return evidence();}});
  const v=mockVerifier(undefined,{fetch:async()=>{throw new Error('mock-secret');}});
  await assert.rejects(()=>v.verify(input),e=>e.message==='PROVIDER_ERROR'&&!e.stack.includes('mock-secret'));
});

test('missing key and invalid model fail without network',async()=>{
  let called=false;
  const v=mockVerifier(undefined,{getApiKey:()=>undefined,fetch:async()=>{called=true;throw new Error('must not run');}});
  rejects(await evaluate(v),'VERIFICATION_FAILURE');assert.equal(called,false);assert.equal(v.lastRun.errorCode,'MISSING_API_KEY');
  assert.throws(()=>new GeminiVerifier({model:'x?key=secret'}),/INVALID_CONFIGURATION/);
});

test('math deterministic registry wins, including invalid key; no AI fallback',async()=>{
  let calls=0;
  const verifier={id:'never',verify:async()=>{calls++;return evidence();}};
  const deterministic=new ValidatorRegistry().register(baseTenValidator([mathContext]));
  const r=router(verifier,deterministic,mathContext,math);
  const p=new BaseTenFixtureProvider([{tens:3,ones:7},{tens:4,ones:2},{tens:5,ones:1},{tens:6,ones:3},{tens:7,ones:8}]);
  const results=await dryRun(mathContext,p,{count:5},math.capability,deterministic,undefined,r);
  assert.deepEqual(results.map(r=>r.decision),Array(5).fill('ACCEPT'));assert.equal(calls,0);
  const c=(await p.generateQuestions(mathContext,{count:1}))[0];c.correctOptionId='b';
  rejects(await validateCandidateWithRouter(mathContext,c,math.capability,r),'ANSWER_MISMATCH');assert.equal(calls,0);
  const unsupported=router(verifier,new ValidatorRegistry().register(baseTenValidator([])),mathContext,math);
  rejects(await validateCandidateWithRouter(mathContext,c,math.capability,unsupported),'UNSUPPORTED_SCOPE');assert.equal(calls,0);
});

test('unresolved context/common errors/unknown capability/scope/family/visual fail before AI',async()=>{
  let calls=0;const v={id:'mock',verify:async()=>{calls++;return evidence();}},r=router(v);
  rejects(await validateCandidateWithRouter({...context},candidate(),life.capability,r),'UNRESOLVED_CONTEXT');
  const c=candidate();c.teacherUid='PRIVATE';rejects(await validateCandidateWithRouter(context,c,life.capability,r),'SCHEMA');
  rejects(await validateCandidateWithRouter(context,candidate(),'unregistered',r),'UNKNOWN_CAPABILITY');
  const wrong=candidate();wrong.scope.topicId='invented';rejects(await validateCandidateWithRouter(context,wrong,life.capability,r),'SCHEMA_OR_SCOPE');
  const family=candidate();family.family='OTHER';rejects(await validateCandidateWithRouter(context,family,life.capability,r),'UNSUPPORTED_SCOPE');
  const visual=candidate();visual.visual={kind:'base-ten',tens:3,ones:7,alt:'Blocks'};
  rejects(await validateCandidateWithRouter(context,visual,life.capability,r),'UNSUPPORTED_VERIFIER_VISUAL');
  assert.equal(calls,0);
});

test('blind DTO is immutable and verifier cannot alter server candidate/answer',async()=>{
  assert.equal((await evaluate({id:'mock',verify:async input=>{
    assert.ok(Object.isFrozen(input));assert.ok(Object.isFrozen(input.options[0]));assert.ok(Object.isFrozen(input.curriculum));
    assert.throws(()=>input.options[0].id='b',TypeError);return evidence();
  }})).decision,'ACCEPT');
});

test('duplicate quality gate still applies to AI verification; no storage',async()=>{
  const r=router(),duplicates=new DuplicateIndex();
  assert.equal((await validateCandidateWithRouter(context,candidate(),life.capability,r,duplicates)).decision,'ACCEPT');
  rejects(await validateCandidateWithRouter(context,candidate(),life.capability,r,duplicates),'DUPLICATE');
});

test('five Gemini generator candidates → independent verifier → 5 ACCEPT (mock transports only)',async()=>{
  const qs=Array.from({length:5},(_,i)=>{const {candidateId,...q}=candidate();return {...q,question:q.question+' Senaryo '+(i+1),
    options:q.options.map(o=>({...o,text:o.text+' '+(i+1)}))};});
  const generator=new GeminiProvider(life,{getApiKey:()=> 'mock-key',fetch:async()=>new Response(JSON.stringify(envelope({questions:qs})))});
  const v=mockVerifier(),deterministic=new ValidatorRegistry(),r=router(v,deterministic);
  const results=await dryRun(context,generator,{count:5},life.capability,deterministic,undefined,r);
  assert.deepEqual(results.map(r=>r.decision),Array(5).fill('ACCEPT'));assert.equal(generator.lastRun.generatedCount,5);
});

test('Gemini verifier rejects answer/PII/visual DTO extensions before transport',async()=>{
  let input;
  await evaluate({id:'capture',verify:async i=>{input=i;return evidence();}});
  let calls=0;const v=mockVerifier(undefined,{fetch:async()=>{calls++;return response(evidence());}});
  for(const extra of [{correctOptionId:'a'},{explanation:'private'},{teacherUid:'private'},{visual:{kind:'base-ten',tens:3,ones:7}}])
    await assert.rejects(()=>v.verify({...input,...extra}),/UNSUPPORTED_VERIFICATION_INPUT/);
  await assert.rejects(()=>v.verify({...input,gradePolicy:{...input.gradePolicy,email:'private'}}),/INVALID_VERIFICATION_INPUT/);
  assert.equal(calls,0);
});

test('absent usage remains unknown; duplicate registration rejects; no UI/application imports',async()=>{
  const v=mockVerifier(undefined,{fetch:async()=>{const payload=envelope(evidence());delete payload.usageMetadata;return new Response(JSON.stringify(payload));}});
  assert.equal((await evaluate(v)).decision,'ACCEPT');assert.equal(v.lastRun.totalTokens,null);
  const binding={capability:'x',verifier:v,contexts:[context],families:[life.family],gradePolicy:life.gradePolicy,visualKinds:[]};
  const reg=new VerifierRegistry().register(binding);assert.throws(()=>reg.register(binding),/DUPLICATE_CAPABILITY/);
  for(const file of ['../../src/main.tsx','../../functions/src/index.ts'])
    assert.equal(readFileSync(new URL(file,import.meta.url),'utf8').includes('gemini-verifier'),false);
});

test('manual dry-run report aggregates generator and all five verifier calls (fully mocked CLI)',()=>{
  const code=`
    process.env.GEMINI_API_KEY='mock-key';process.env.GEMINI_MODEL='mock-generator';process.env.GEMINI_VERIFIER_MODEL='mock-verifier';
    process.argv[2]='life-studies-planning';
    globalThis.fetch=async(url,init)=>{
      const input=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);
      let value;
      if(input.count===5) {
        if(!url.includes('mock-generator:generateContent')) throw new Error('Wrong generator');
        value={questions:Array.from({length:5},(_,i)=>({scope:input.curriculum,type:'multiple-choice',difficulty:'easy',
          question:'Planlı davranış nedir? Senaryo '+i,options:[{id:'a',text:'Görevleri sırayla yapmak '+i},{id:'b',text:'Unutmak '+i},{id:'c',text:'Gecikmek '+i}],
          correctOptionId:'a',explanation:'Görevleri sırayla yapmak.',family:input.family,model:{}}))};
      } else {
        if(!url.includes('mock-verifier:generateContent')||'correctOptionId' in input||'explanation' in input) throw new Error('Not a blind solve');
        value=${JSON.stringify(evidence())};
      }
      return new Response(JSON.stringify((${envelope.toString()})(value)));
    };
    await import('./scripts/question-engine-gemini-dry-run.mjs');
  `;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:new URL('../../',import.meta.url),encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr||child.stdout);
  const report=JSON.parse(child.stdout.trim());
  assert.equal(report.generatedCount,5);assert.equal(report.acceptedCount,5);assert.equal(report.rejectedCount,0);
  assert.equal(report.failedRun,false);assert.equal(report.generatorMetrics.totalTokens,160);
  assert.equal(report.verifierMetrics.calls,5);assert.equal(report.verifierMetrics.totalTokens,800);
  assert.equal(report.verifierMetrics.inputTokens,500);assert.equal(report.verifierMetrics.outputTokens,300);
  assert.equal(report.combinedTotalTokens,960);assert.deepEqual(report.verifierMetrics.errorCodes,[]);
  assert.equal(child.stdout.includes('mock-key'),false);assert.equal(child.stdout.includes('Görevleri'),false);
});
