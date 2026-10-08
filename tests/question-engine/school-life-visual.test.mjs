import {pedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';
import {englishWire} from '../fixtures/english-wire.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {parseVisual,parsePresentation} from '../../functions/visuals/contract.mjs';
import {schoolVisualAlt} from '../../functions/visuals/school-life.mjs';
import {schoolVisuals} from '../fixtures/school-life-visuals.mjs';
import {profileContexts} from '../../functions/lib/question-engine/school-life.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {responseSchema,parseGeminiResponse} from '../../functions/lib/question-engine/providers/gemini-contract.js';
import {geminiRefillRuntime} from '../../functions/lib/question-engine/refill-runtime.js';
import {resolveRefillPolicy} from '../../functions/lib/question-engine/refill-policy.js';
import {DuplicateIndex} from '../../functions/lib/question-engine/fingerprint.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {GeminiProvider} from '../../functions/lib/question-engine/providers/gemini.js';
import {refillPool} from '../../functions/lib/question-engine/refill.js';

const p=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
const contexts=profileContexts(JSON.parse(readFileSync('data/mufredat/2-sinif.json')),JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json')),p);
const policy=resolveRefillPolicy(JSON.parse(readFileSync('data/question-engine/refill-policy.json')),contexts[0],p.family);
const envelope=data=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(data)}]}}],usageMetadata:{totalTokenCount:20}});
function candidate(visual){const dialogue=visual.kind==='school-dialogue',place=visual.kind==='school-place';
  const words=place?['classroom','library','garden']:['teacher','pupil','headmaster'];
  const options=dialogue?["I'm fine, thanks!",'Goodbye!','My name is Ada.']:words.map(w=>'a '+w);
  return {candidateId:'local-school-'+visual.asset,scope:dialogue?contexts[0]:contexts[1],type:'multiple-choice',difficulty:'easy',
    question:dialogue?visual.speech:place?'What is this?':'Who is this?',options:options.map((text,i)=>({id:['a','b','c'][i],text})),
    correctOptionId:dialogue?'a':['a','b','c'][words.indexOf(visual.asset)],explanation:dialogue?'The reply answers how the pupil is.':'It is a '+visual.asset+'.',
    family:dialogue?'SCHOOL_LIFE_DIALOGUE':place?'SCHOOL_LIFE_PLACE':'SCHOOL_LIFE_PERSON',model:{},visual,visualPlacement:'above'};
}
const samples=()=>[candidate(schoolVisuals[0]),candidate(schoolVisuals[1]),candidate(schoolVisuals[4]),
  {...candidate(schoolVisuals[0]),candidateId:'local-name',question:'What is your name?',visual:{...schoolVisuals[0],speech:'What is your name?'},options:[{id:'a',text:'My name is Ada.'},{id:'b',text:'Goodbye!'},{id:'c',text:"I'm fine, thanks!"}]},
  {...candidate(schoolVisuals[0]),candidateId:'local-meeting',question:'Nice to meet you!',visual:{...schoolVisuals[0],speech:'Nice to meet you!'},options:[{id:'a',text:'Nice to meet you, too!'},{id:'b',text:'Goodbye!'},{id:'c',text:'My name is Ada.'}]}];
function runtime(patch={}){const budget={verifierCalls:0,totalTokens:0},requests=[];
 const r=geminiRefillRuntime(contexts[0],p,policy,budget,async(_,init)=>{
  const input=JSON.parse(JSON.parse(init.body).contents[0].parts[0].text);requests.push(input);
  return new Response(JSON.stringify(envelope('count' in input?{questions:samples().map(c=>englishWire(c,c.family==='SCHOOL_LIFE_DIALOGUE'?0:c.family==='SCHOOL_LIFE_PLACE'?1:2))}:
    {selectedOptionId:input.visual?input.options.find(o=>o.text==='a '+input.visual.asset)?.id:'a',justification:'The reply fits the utterance.',hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.99,issues:[],...Object.fromEntries(pedagogyChecks.map(k=>[k,true])),...(input.visual?{visualRelevant:true}:{}),...patch})));},contexts);
 return {r,budget,requests};}
test('all seven closed descriptors validate; unknown assets, external data and answer-labelled alt reject',()=>{
 for(const v of schoolVisuals){assert.deepEqual(parseVisual(v),v);for(const key of ['url','svg','html','css','base64','answer'])assert.throws(()=>parseVisual({...v,[key]:'unsafe'}));assert.throws(()=>parseVisual({...v,asset:'unknown'}));assert.throws(()=>parseVisual({...v,alt:'a '+v.asset}));}
 for(const speech of ['A: How are you? B: ____','Read the dialogue...','How are you? …'])assert.throws(()=>parseVisual({...schoolVisuals[0],speech}));
});
test('generic English schema has no curriculum/asset enums; backend still requires diversity and exact descriptors',()=>{
 const schema=responseSchema(contexts[0],p,5,contexts),question=schema.properties.questions.items;
 assert.equal(question.type,'object');assert.equal(question.additionalProperties,false);
 for(const forbidden of ['anyOf','oneOf','enum','classroom','ENG.2.1.R3','subthemeId'])assert.equal(JSON.stringify(schema).includes(forbidden),false);
 assert.equal(question.properties.visualType.type,'string');assert.equal(question.properties.visualId.type,'string');
 const qs=samples().map(c=>englishWire(c,c.family==='SCHOOL_LIFE_DIALOGUE'?0:c.family==='SCHOOL_LIFE_PLACE'?1:2));
 assert.equal(parseGeminiResponse(envelope({questions:qs}),p,5,contexts).length,5);
 assert.throws(()=>parseGeminiResponse(envelope({questions:Array(5).fill(qs[0])}),p,5,contexts),/BATCH_DIVERSITY/);
 assert.throws(()=>responseSchema(contexts[0],p,5),/UNRESOLVED_VARIANTS/);
 const mismatched=structuredClone(qs);mismatched[1].visualAlt=schoolVisualAlt.library;
 assert.throws(()=>parseGeminiResponse(envelope({questions:mismatched}),p,5,contexts),/MALFORMED_VISUAL/);
 for(const [field,value,code] of [['scopeKey','scope-99','UNSUPPORTED_CONTEXT'],['family','UNKNOWN','UNSUPPORTED_CONTEXT'],['visualType','raw-svg','UNSUPPORTED_VISUAL'],['visualId','unknown','MALFORMED_VISUAL'],['visualSpeech','What is your name?','MALFORMED_VISUAL']]){
  const changed=structuredClone(qs);changed[1][field]=value;
  assert.throws(()=>parseGeminiResponse(envelope({questions:changed}),p,5,contexts),new RegExp(code));
 }
 const wrongBubble=structuredClone(qs);wrongBubble[0].visualSpeech='What is your name?';
 const parsed=parseGeminiResponse(envelope({questions:wrongBubble}),p,5,contexts);
 assert.notEqual(parsed[0].question,parsed[0].visual.speech); // claims are never repaired
});
test('mixed-family HTTP schema rejection reaches refill as safe diagnostics, with no verifier/publication',async()=>{
 const secret='mock-secret-do-not-log';let calls=0;
 const provider=new GeminiProvider(p,{contexts,getApiKey:()=>secret,fetch:async(_,init)=>{
  calls++;const config=JSON.parse(init.body).generationConfig;
  assert.equal(config.responseMimeType,'application/json');assert.equal(config.responseJsonSchema.properties.questions.items.type,'object');
  return new Response(JSON.stringify({error:{code:400,status:'INVALID_ARGUMENT',message:'Invalid response_json_schema: too many states '+secret}}),{status:400});
 }});
 const summary={count:0,curated:0,aiVerified:0,byDifficulty:{},byFamily:{},fingerprints:[]};
 const result=await refillPool({context:contexts[0],family:p.family,policy,mode:'dry-run',verification:'independent_ai',
  store:{summary:async()=>summary,acquire:async()=>{assert.fail('no lease in dry-run');},renew:async()=>false,release:async()=>{},publish:async()=>{assert.fail('no publication');}},
  createRuntime:()=>({provider,verification:'independent_ai',validate:async()=>{assert.fail('no verifier after provider failure');}})});
 assert.equal(calls,1);assert.equal(result.stopReason,'PROVIDER_FAILURE');assert.equal(result.generated,0);assert.equal(result.verifierCalls,0);assert.equal(result.published,0);
 assert.deepEqual(result.providerError,{code:'HTTP_ERROR',details:{httpStatus:400,apiStatus:'INVALID_ARGUMENT',reason:'SCHEMA_COMPLEXITY'}});
 assert.equal(JSON.stringify(result).includes(secret),false);assert.equal(JSON.stringify(provider.lastRun).includes(secret),false);
});
test('mixed-family HTTP success with incomplete response is reported as parser failure, not HTTP rejection',async()=>{
 const provider=new GeminiProvider(p,{contexts,getApiKey:()=> 'mock-no-network',fetch:async()=>new Response(JSON.stringify({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'untrusted content'}]}}]}))});
 const result=await refillPool({context:contexts[0],family:p.family,policy,mode:'dry-run',verification:'independent_ai',
  store:{summary:async()=>({count:0,curated:0,aiVerified:0,byDifficulty:{},byFamily:{},fingerprints:[]}),acquire:async()=>null,renew:async()=>false,release:async()=>{},publish:async()=>{assert.fail();}},
  createRuntime:()=>({provider,verification:'independent_ai',validate:async()=>{assert.fail();}})});
 assert.deepEqual(result.providerError,{code:'INCOMPLETE_RESPONSE',details:{}});
 assert.equal(result.verifierCalls,0);assert.equal(JSON.stringify(result).includes('untrusted content'),false);
});
test('unclassified HTTP 400 reports absence/filtering metadata through refill, never invents reason/fields',async()=>{
 for(const remote of [
  {status:'INVALID_ARGUMENT',message:'Request is invalid. private-secret'},
  {status:'INVALID_ARGUMENT'},
  {status:'INVALID_ARGUMENT',message:'Request is invalid. private-secret',details:[{'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[{field:'generation_config.private_secret',description:'private-secret'}]}]},
 ]){
  const provider=new GeminiProvider(p,{contexts,getApiKey:()=> 'mock-no-network',fetch:async()=>new Response(JSON.stringify({error:remote}),{status:400})});
  const result=await refillPool({context:contexts[0],family:p.family,policy,mode:'dry-run',verification:'independent_ai',
   store:{summary:async()=>({count:0,curated:0,aiVerified:0,byDifficulty:{},byFamily:{},fingerprints:[]}),acquire:async()=>null,renew:async()=>false,release:async()=>{},publish:async()=>{assert.fail();}},
   createRuntime:()=>({provider,verification:'independent_ai',validate:async()=>{assert.fail();}})});
  const details=result.providerError.details;
  assert.equal('reason' in details,false);assert.equal('requestFields' in details,false);
  assert.deepEqual(details.diagnostics,{messagePresent:!!remote.message,detailCount:remote.details?1:0,badRequestCount:remote.details?1:0,fieldViolationCount:remote.details?1:0,filteredFieldCount:remote.details?1:0});
  assert.equal(JSON.stringify(result).includes('private'),false);assert.equal(result.published,0);assert.equal(result.verifierCalls,0);
 }
});
test('five mocked candidates use the existing pipeline: 3 dialogue reviews, 2 deterministic visual answers plus pedagogy reviews',async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-no-network';
 try{const {r,budget,requests}=runtime(),generated=await r.provider.generateQuestions(contexts[0],{count:5}),duplicates=new DuplicateIndex();
 const results=[];for(const q of generated)results.push(await r.validate(q,duplicates));assert.ok(results.every(r=>r.decision==='ACCEPT'));
 assert.equal(budget.verifierCalls,5);assert.equal(requests.length,6);
 assert.deepEqual(results.map(r=>acceptedSnapshot(r).verificationMethod),['independent_ai','deterministic','deterministic','independent_ai','independent_ai']);
 for(const input of requests.slice(1)){assert.equal(JSON.stringify(input.visual??{}).includes('alt'),false);assert.equal('correctOptionId' in input,false);assert.equal('explanation' in input,false);assert.equal(input.question.includes('...'),false);}
 assert.equal(acceptedSnapshot(results[1]).context.subthemeId,contexts[1].subthemeId);
 assert.equal((await r.validate(generated[1],duplicates)).decision,'REJECT');
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
for(const v of schoolVisuals.slice(1))test('deterministic asset answer: '+v.asset,async()=>{
 const old=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-no-network';try {
 const {r,budget}=runtime();const q=candidate(v);const result=await r.validate(q,new DuplicateIndex());assert.equal(result.decision,'ACCEPT');
 const wrong=await r.validate({...q,correctOptionId:q.correctOptionId==='a'?'b':'a'},new DuplicateIndex());assert.equal(wrong.issues[0].code,'ANSWER_MISMATCH');
 assert.equal(budget.verifierCalls,1);
 const dto=parsePresentation(q.question,q.options.map(o=>({choiceId:o.id,text:o.text})),v,'above');
 assert.equal(dto.visual.asset,v.asset);assert.equal(JSON.stringify(dto).includes('correctOptionId'),false);
 }finally{if(old===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=old;}
});
test('visual/scope/stem conflicts reject before verifier; deterministic failures do not fall back',async()=>{
 const q=candidate(schoolVisuals[1]),d=candidate(schoolVisuals[0]);const {r,budget}=runtime();
 for(const c of [{...q,scope:contexts[0]},{...q,question:'Choose the correct answer.'},{...q,visual:{...q.visual,asset:'teacher'}},
   {...q,explanation:'It is a library.'},{...q,explanation:'It is not a classroom.'},{...d,visual:{...d.visual,speech:'What is your name?'}},{...d,question:'Read the dialogue...'}])
   assert.equal((await r.validate(c,new DuplicateIndex())).decision,'REJECT');
 assert.equal(budget.verifierCalls,0);
});
