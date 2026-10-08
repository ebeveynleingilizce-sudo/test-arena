import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../../functions/lib/question-engine/curriculum.js';
import {dryRun} from '../../functions/lib/question-engine/pipeline.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../../functions/lib/question-engine/fixtures/base-ten.js';
import {GeminiProvider,DEFAULT_GEMINI_MODEL} from '../../functions/lib/question-engine/providers/gemini.js';
import {parseGeminiResponse,responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';

const canonical=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif.json',import.meta.url)));
const nav=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const [math,life]=geminiDryRunProfiles;
const context=resolveCurriculumContext(canonical,nav,math.scope);
const lifeContext=resolveCurriculumContext(canonical,nav,life.scope);
const fixture=new BaseTenFixtureProvider([{tens:3,ones:7},{tens:4,ones:2},{tens:5,ones:1},{tens:6,ones:3},{tens:7,ones:8}]);
const mathQuestions=async()=> (await fixture.generateQuestions(context,{count:5})).map(({candidateId,...q})=>q);
const envelope=questions=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({questions})}]}}],usageMetadata:{promptTokenCount:210,candidatesTokenCount:500,thoughtsTokenCount:0,totalTokenCount:710}});
const registry=()=>new ValidatorRegistry().register(baseTenValidator([context]));
const key='mock-key-never-network';
const mocked=(payload,profile=math)=>new GeminiProvider(profile,{model:DEFAULT_GEMINI_MODEL,getApiKey:()=>key,fetch:async()=>new Response(JSON.stringify(payload))});
const decisions=async(provider,ctx=context,r=registry(),capability=math.capability)=>dryRun(ctx,provider,{count:5},capability,r);
const allRejected=results=>{assert.ok(results.length);assert.ok(results.every(r=>r.decision==='REJECT'));};

test('HTTP diagnostics whitelist statuses, never copy remote messages or secrets',async()=>{
 for(const [status,body,expected] of [
  [400,{error:{status:'INVALID_ARGUMENT',message:'bad request '+key}},{httpStatus:400,apiStatus:'INVALID_ARGUMENT',diagnostics:{messagePresent:true,detailCount:0,badRequestCount:0,fieldViolationCount:0,filteredFieldCount:0}}],
  [403,{error:{status:'PERMISSION_DENIED',message:key}},{httpStatus:403,apiStatus:'PERMISSION_DENIED'}],
  [429,{error:{status:'RESOURCE_EXHAUSTED',message:key}},{httpStatus:429,apiStatus:'RESOURCE_EXHAUSTED'}],
  [500,{error:{status:key,message:key}},{httpStatus:500}],
  [400,key,{httpStatus:400}],
 ]){
  const provider=new GeminiProvider(math,{getApiKey:()=>key,fetch:async()=>new Response(JSON.stringify(body),{status})});
  await assert.rejects(provider.generateQuestions(context,{count:5}),error=>{
   assert.deepEqual(error.details,expected);assert.equal(error.message.includes(key),false);assert.equal(JSON.stringify(error).includes(key),false);return true;
  });
  assert.deepEqual(provider.lastRun.errorDetails,expected);assert.equal(JSON.stringify(provider.lastRun).includes(key),false);
 }
});

test('Gemini transport sends structured output, scoped policy and only one small capability',async()=>{
  const qs=await mathQuestions();let captured;
  const provider=new GeminiProvider(math,{model:DEFAULT_GEMINI_MODEL,getApiKey:()=>key,fetch:async(url,init)=>{captured={url,init,body:JSON.parse(init.body)};return new Response(JSON.stringify(envelope(qs)));}});
  const results=await decisions(provider);assert.deepEqual(results.map(r=>r.decision),Array(5).fill('ACCEPT'));
  assert.equal(captured.url,`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMINI_MODEL}:generateContent`);
  assert.equal(captured.url.includes(key),false);assert.equal(captured.init.headers['x-goog-api-key'],key);assert.equal(captured.init.redirect,'error');
  const body=captured.body;assert.equal(body.generationConfig.responseMimeType,'application/json');assert.equal(body.generationConfig.candidateCount,1);
  assert.ok(body.generationConfig.responseJsonSchema);assert.equal('tools' in body,false);
  const prompt=JSON.parse(body.contents[0].parts[0].text);assert.deepEqual(prompt.curriculum,context);assert.deepEqual(prompt.allowedVisualCapabilities,['base-ten']);assert.equal(prompt.count,5);assert.deepEqual(prompt.gradePolicy,math.gradePolicy);
  for(const banned of ['studentName','teacherUid','classId','email','shortCode','answerHistory','XP'])assert.equal(JSON.stringify(body).includes(banned),false);
  assert.deepEqual(provider.lastRun,{generatedCount:5,latencyMs:provider.lastRun.latencyMs,inputTokens:210,outputTokens:500,thinkingTokens:0,totalTokens:710});assert.ok(provider.lastRun.latencyMs>=0);assert.ok(Object.isFrozen(provider.lastRun));
});

test('parser assigns ephemeral IDs; common/domain pipeline determines 4 ACCEPT / 1 ANSWER_MISMATCH',async()=>{
  const qs=await mathQuestions();qs[4].correctOptionId='b';const provider=mocked(envelope(qs));
  const results=await decisions(provider);assert.deepEqual(results.map(r=>r.decision),['ACCEPT','ACCEPT','ACCEPT','ACCEPT','REJECT']);assert.equal(results[4].issues[0].code,'ANSWER_MISMATCH');
  const a=parseGeminiResponse(envelope(qs),math,5),b=parseGeminiResponse(envelope(qs),math,5);
  assert.equal(new Set(a.map(q=>q.candidateId)).size,5);assert.notEqual(a[0].candidateId,b[0].candidateId);assert.equal('questionId' in a[0],false);
});

test('mock Gemini natural explanations reach the independent solver: 5 ACCEPT',async()=>{
  const qs=await mathQuestions();
  const explanations=[
    '3 onluk ve 7 birlik 37 eder.',
    '40 + 2 = 42.',
    '5 × 10 + 1 = 51.',
    "Altı onluk 60, üç birlik 3'dir. Toplam 63 olur.",
    'Toplam yetmiş sekiz olur.',
  ];
  qs.forEach((q,i)=>q.explanation=explanations[i]);
  assert.deepEqual((await decisions(mocked(envelope(qs)))).map(r=>r.decision),Array(5).fill('ACCEPT'));
});

test('mock Gemini wrong explanation and wrong key remain separate REJECT decisions',async()=>{
  const qs=await mathQuestions();
  qs[0].explanation='3 onluk ve 7 birlik 38 eder.';
  qs[1].explanation='4 onluk ve 2 birlik 42 eder.';qs[1].correctOptionId='b';
  const results=await decisions(mocked(envelope(qs)));
  assert.deepEqual(results.map(r=>r.decision),['REJECT','REJECT','ACCEPT','ACCEPT','ACCEPT']);
  assert.equal(results[0].issues[0].code,'EXPLANATION_MISMATCH');
  assert.equal(results[1].issues[0].code,'ANSWER_MISMATCH');
});

test('real canonical non-math context uses same provider; lack of domain validator remains fail-closed',async()=>{
  assert.equal(lifeContext.outcomeText,'Planlı olmanın kişisel yaşama etkilerini fark edebilme');
  const qs=Array.from({length:5},()=>({scope:{...lifeContext},type:'multiple-choice',difficulty:'easy',question:'Planlı davranışı seç.',options:[{id:'a',text:'Görevleri sırayla yapmak'},{id:'b',text:'Görevleri unutmak'},{id:'c',text:'Görevleri karıştırmak'}],correctOptionId:'a',explanation:'Görevleri sırayla yapmak planlı bir davranıştır.',family:life.family,model:{}}));
  let prompt;
  const provider=new GeminiProvider(life,{getApiKey:()=>key,fetch:async(_,init)=>{prompt=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);return new Response(JSON.stringify(envelope(qs)));}});
  const results=await decisions(provider,lifeContext,new ValidatorRegistry(),life.capability);allRejected(results);assert.equal(results.length,5);assert.ok(results.every(r=>r.issues[0].code==='UNKNOWN_CAPABILITY'));assert.equal(provider.lastRun.generatedCount,5);assert.deepEqual(prompt.allowedVisualCapabilities,[]);assert.equal(prompt.curriculum.subjectId,'hayat-bilgisi');
});

test('schemas forbid trust/ID fields and do not include the entire visual union',()=>{
  const m=responseSchema(context,math,5),l=responseSchema(lifeContext,life,5),q=m.properties.questions.items;
  assert.equal(q.additionalProperties,false);for(const k of ['verified','approved','published','trusted','questionId','id','candidateId'])assert.equal(k in q.properties,false);
  assert.deepEqual(q.properties.visual.properties.kind.enum,['base-ten']);assert.equal('visual' in l.properties.questions.items.properties,false);
  assert.equal(m.properties.questions.minItems,5);assert.equal(m.properties.questions.maxItems,5);assert.equal(q.properties.options.items.additionalProperties,false);
});

test('signed text parts are JSON content; thought signatures never enter candidates',async()=>{
  const payload=envelope(await mathQuestions());
  payload.candidates[0].content.parts[0].thoughtSignature='opaque-test-signature';
  const results=await decisions(mocked(payload));
  assert.deepEqual(results.map(r=>r.decision),Array(5).fill('ACCEPT'));
  const parsed=parseGeminiResponse(payload,math,5);
  assert.equal(JSON.stringify(parsed).includes('opaque-test-signature'),false);
});

test('signed fragmented JSON is joined in order; thinking text is excluded',async()=>{
  const payload=envelope(await mathQuestions()),text=payload.candidates[0].content.parts[0].text;
  payload.candidates[0].content.parts=[
    {thought:true,text:'Not candidate JSON',thoughtSignature:'thought-signature'},
    {text:text.slice(0,100),thoughtSignature:'fragment-signature'},
    {text:text.slice(100)}
  ];
  assert.deepEqual((await decisions(mocked(payload))).map(r=>r.decision),Array(5).fill('ACCEPT'));
});

test('text signature metadata does not permit tool data, unknown fields or malformed signatures',async()=>{
  for(const extra of [{thoughtSignature:{}},{thoughtSignature:42},{thoughtSignature:'opaque',functionCall:{name:'run'}},{thoughtSignature:'opaque',unregisteredField:true}]){
    const payload=envelope(await mathQuestions());Object.assign(payload.candidates[0].content.parts[0],extra);
    allRejected(await decisions(mocked(payload)));
  }
});

for(const [name,change] of [
  ['wrong curriculum scope',qs=>qs[0].scope.subjectId='unknown'],
  ['invalid correctOptionId',qs=>qs[0].correctOptionId='z'],
  ['wrong computed answer',qs=>qs[0].correctOptionId='b'],
])test('pipeline REJECT: '+name,async()=>{
  const qs=await mathQuestions();change(qs);const results=await decisions(mocked(envelope(qs)));assert.equal(results[0].decision,'REJECT');assert.equal(results.filter(r=>r.decision==='ACCEPT').length,4);
});

for(const [name,change,code] of [
  ['unsupported visual',qs=>qs[0].visual.kind='geometry','UNSUPPORTED_VISUAL'],
  ['malformed visual',qs=>qs[0].visual.tens=100,'MALFORMED_VISUAL'],
  ['raw SVG',qs=>qs[0].visual.svg='<svg/>','MALFORMED_VISUAL'],
  ['persistent questionId',qs=>qs[0].questionId='model-selected-id','FORBIDDEN_FIELD'],
  ['candidate ID supplied by model',qs=>qs[0].candidateId='model-id','FORBIDDEN_FIELD'],
  ['trusted claim',qs=>qs[0].trusted=true,'FORBIDDEN_FIELD'],
  ['approved claim',qs=>qs[0].approved=true,'FORBIDDEN_FIELD'],
  ['published claim',qs=>qs[0].published=true,'FORBIDDEN_FIELD'],
  ['verified claim',qs=>qs[0].verified=true,'FORBIDDEN_FIELD'],
  ['option visual outside profile',qs=>qs[0].options[0].visual={kind:'geometry',shape:'cube',alt:'Küp'},'FORBIDDEN_OPTION_FIELD'],
])test('parser/provider REJECT: '+name,async()=>{
  const qs=await mathQuestions();change(qs);const provider=mocked(envelope(qs));allRejected(await decisions(provider));assert.equal(provider.lastRun.errorCode,code);assert.equal(provider.lastRun.generatedCount,0);
});

for(const [name,payload] of [
  ['empty response',{}],['malformed envelope',null],['empty candidates',{candidates:[]}],
  ['empty text',{candidates:[{finishReason:'STOP',content:{parts:[{text:''}]}}]}],
  ['malformed JSON',{candidates:[{finishReason:'STOP',content:{parts:[{text:'{broken'}]}}]}],
  ['markdown instead of JSON',{candidates:[{finishReason:'STOP',content:{parts:[{text:'```json\n{}\n```'}]}}]}],
  ['truncated response',{candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'{}'}]}}]}],
  ['safety block',{promptFeedback:{blockReason:'SAFETY'}}],
  ['tool call',{candidates:[{finishReason:'STOP',content:{parts:[{functionCall:{name:'run'}}]}}]}],
  ['wrong batch size',envelope([])],
])test('controlled response failure: '+name,async()=>allRejected(await decisions(mocked(payload))));

test('HTTP errors and network exceptions expose codes, never secret or response body',async()=>{
  for(const status of [401,403,429,500]){
    const p=new GeminiProvider(math,{getApiKey:()=>key,fetch:async()=>new Response(key,{status})});allRejected(await decisions(p));assert.equal(JSON.stringify(p.lastRun).includes(key),false);
  }
  const p=new GeminiProvider(math,{getApiKey:()=>key,fetch:async()=>{throw new Error(key);}});
  await assert.rejects(()=>p.generateQuestions(context,{count:5}),e=>e.message==='PROVIDER_ERROR'&&!e.stack.includes(key));
});

test('timeout rejects promptly, including a stalled mock that ignores AbortSignal',async()=>{
  const p=new GeminiProvider(math,{getApiKey:()=>key,timeoutMs:20,fetch:async()=>new Promise(()=>{})});
  allRejected(await decisions(p));assert.equal(p.lastRun.errorCode,'TIMEOUT');assert.ok(p.lastRun.latencyMs<2000);
});

test('missing key rejects without network; startup/build needs no key',async()=>{
  let called=false;const p=new GeminiProvider(math,{getApiKey:()=>undefined,fetch:async()=>{called=true;throw new Error('unexpected');}});
  allRejected(await decisions(p));assert.equal(called,false);assert.equal(p.lastRun.errorCode,'MISSING_API_KEY');
});

test('wrong profile, unresolved context, >5 requests and URL model injection reject before transport',async()=>{
  let called=false;const p=new GeminiProvider(math,{getApiKey:()=>key,fetch:async()=>{called=true;throw new Error('unexpected');}});
  for(const [ctx,count] of [[lifeContext,5],[{...context},5],[context,6]])await assert.rejects(()=>p.generateQuestions(ctx,{count}));assert.equal(called,false);
  assert.throws(()=>new GeminiProvider(math,{model:'gemini?key=secret'}));
});

test('token metrics remain null when usage metadata is absent',async()=>{
  const payload=envelope(await mathQuestions());delete payload.usageMetadata;const p=mocked(payload);await decisions(p);assert.equal(p.lastRun.inputTokens,null);assert.equal(p.lastRun.outputTokens,null);
});

test('server provider is not imported by frontend, quiz or application entry',()=>{
  for(const name of ['src/features/Quiz.tsx','functions/src/quiz.ts','functions/src/index.ts'])assert.equal(readFileSync(new URL('../../'+name,import.meta.url),'utf8').includes('providers/gemini'),false);
  const command=readFileSync(new URL('../../scripts/question-engine-gemini-dry-run.mjs',import.meta.url),'utf8');assert.doesNotMatch(command,/from ['"]firebase|seedCurriculum|\.set\(|\.create\(/);
});
