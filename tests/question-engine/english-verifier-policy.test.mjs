import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {englishPedagogyGolden} from '../fixtures/english-pedagogy-golden.mjs';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {profileContexts,schoolVocabularyValidator} from '../../functions/lib/question-engine/school-life.js';
import {resolveEnglishPedagogy,englishPedagogyEvaluation,requiredPedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';
import {VerificationRouter,VerifierRegistry} from '../../functions/lib/question-engine/verification.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {validateCandidateWithRouter} from '../../functions/lib/question-engine/pipeline.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {GeminiVerifier} from '../../functions/lib/question-engine/providers/gemini-verifier.js';
import {responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';
import {schoolVisualAlt} from '../../functions/visuals/school-life.mjs';

// Injected transports only. These tests prove request/context and enforcement,
// not a real model's semantic classification or a changed false-accept rate.
const p=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
const contexts=profileContexts(JSON.parse(readFileSync('data/mufredat/2-sinif.json')),JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json')),p);
function candidate(row){
 const dialogue=row.family==='SCHOOL_LIFE_DIALOGUE';
 return {candidateId:'policy-regression',scope:contexts[dialogue?0:1],family:row.family,type:'multiple-choice',difficulty:'easy',model:{},question:row.stem,
  options:row.options.map((text,i)=>({id:['a','b','c'][i],text})),correctOptionId:row.answer,
  explanation:dialogue?'The reply answers the utterance.':'It is a '+row.asset+'.',
  ...(row.asset?{visual:{kind:dialogue?'school-dialogue':row.family==='SCHOOL_LIFE_PLACE'?'school-place':'school-person',asset:row.asset,
   alt:row.mutation==='answer-alt'?'a classroom':schoolVisualAlt[row.asset],...(dialogue?{speech:row.stem}:{})},visualPlacement:'above'}:{})};
}
function setup(q,patch={}){
 const requests=[],policy=resolveEnglishPedagogy(q.scope,q.family);
 const mockEvidence={selectedOptionId:q.correctOptionId,justification:'Mock independent evidence.',hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,
  factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.99,issues:[],...Object.fromEntries(requiredPedagogyChecks(policy).map(k=>[k,true])),...patch};
 const verifier=new GeminiVerifier({getApiKey:()=> 'injected-mock-only',fetch:async(_,init)=>{
  const body=JSON.parse(init.body);requests.push(body);
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(mockEvidence)}]}}]}));
 }});
 const independent=new VerifierRegistry().register({capability:'knowledge-grounded@1',contexts:[contexts[0]],families:[p.family],gradePolicy:p.gradePolicy,visualKinds:['school-dialogue'],verifier})
  .register({capability:'school-vocabulary@1',contexts:[contexts[1]],families:['SCHOOL_LIFE_PLACE','SCHOOL_LIFE_PERSON'],gradePolicy:p.gradePolicy,visualKinds:['school-place','school-person'],verifier});
 const router=new VerificationRouter(new ValidatorRegistry().register(schoolVocabularyValidator(contexts)),independent);
 return {requests,run:()=>validateCandidateWithRouter(q.scope,q,q.family==='SCHOOL_LIFE_DIALOGUE'?'knowledge-grounded@1':'school-vocabulary@1',router)};
}
const golden=id=>englishPedagogyGolden.find(r=>r.id===id);
test('final verifier request includes full server-resolved context and criterion-specific semantics, without gold/answer claims',async()=>{
 const q=candidate(golden('04')),s=setup(q);assert.equal((await s.run()).decision,'ACCEPT');
 const body=s.requests[0],input=JSON.parse(body.contents[0].parts[0].text),context=input.pedagogyEvaluation;
 for(const key of ['grade','pedagogyBand','outcome','skill','family','targetLanguagePolicy','instructionLanguagePolicy','readingLoad','optionCountPolicy','distractorPolicy','visualPolicy','requiredEvidence'])assert.ok(key in context,key);
 assert.deepEqual(context,englishPedagogyEvaluation(resolveEnglishPedagogy(q.scope,q.family),q.family));
 assert.equal(context.instructionLanguagePolicy.allowMetaInstruction,false);
 assert.equal(context.distractorPolicy.responseForm,'natural-utterance');
 assert.equal(context.distractorPolicy.rejectTrivialElimination,true);
 assert.match(context.requiredEvidence.instructionComprehensible,/additional English assessment vocabulary or syntax/);
 assert.match(context.requiredEvidence.targetLanguageAligned,/semantic function/);
 assert.match(context.requiredEvidence.distractorsValid,/separately from hasSingleCorrectAnswer/);
 assert.match(context.requiredEvidence.distractorsValid,/lexical category, length or form/);
 assert.match(context.requiredEvidence.unambiguous,/Do not invent a preceding conversation/);
 assert.match(body.systemInstruction.parts[0].text,/needsSemanticStemReview=false never waive any check/);
 for(const key of ['expected','answer','correctOptionId','explanation','candidateId'])assert.equal(key in input,false);
 assert.equal(JSON.stringify(body).includes('golden'),false);
 assert.equal(body.generationConfig.responseJsonSchema.properties.distractorsValid.type,'boolean');
});
for(const id of ['06','07','08','10'])test('English assessment language rejection evidence blocks receipt: '+id,async()=>{
 const s=setup(candidate(golden(id)),{instructionComprehensible:false});const r=await s.run();
 assert.equal(r.issues[0].code,'PEDAGOGY_INSTRUCTION_COMPREHENSIBLE');assert.equal(acceptedSnapshot(r),null);
 assert.equal(s.requests.length,1);
});
test('outcome/communicative-purpose failure is independent of instruction comprehension',async()=>{
 const r=await setup(candidate(golden('06')),{targetLanguageAligned:false}).run();
 assert.equal(r.issues[0].code,'PEDAGOGY_TARGET_LANGUAGE_ALIGNED');assert.equal(acceptedSnapshot(r),null);
});
test('single correct answer cannot override trivial distractor evidence',async()=>{
 const s=setup(candidate(golden('15')),{distractorsValid:false}),r=await s.run();
 assert.equal(r.issues[0].code,'PEDAGOGY_DISTRACTORS_VALID');assert.equal(acceptedSnapshot(r),null);
});
test('multiple correct options reject independently of all other true pedagogy flags',async()=>{
 const r=await setup(candidate(golden('13')),{selectedOptionId:null,hasSingleCorrectAnswer:false,distractorsValid:false}).run();
 assert.equal(r.issues[0].code,'NO_SINGLE_CORRECT_ANSWER');assert.equal(acceptedSnapshot(r),null);
});
test('natural language failure and missing conversational context cannot gain acceptance from target inventory',async()=>{
 const a=await setup(candidate(golden('19')),{naturalLanguage:false}).run();assert.equal(a.issues[0].code,'PEDAGOGY_NATURAL_LANGUAGE');
 const b=setup(candidate(golden('20')),{unambiguous:false}),r=await b.run();assert.equal(r.issues[0].code,'PEDAGOGY_UNAMBIGUOUS');
 const input=JSON.parse(b.requests[0].contents[0].parts[0].text);assert.equal(input.pedagogy.needsSemanticStemReview,false);
});
for(const id of ['01','02','03','04','05','14','16'])test('supported target/visual can accept with all independent evidence: '+id,async()=>{
 const s=setup(candidate(golden(id))),r=await s.run();assert.equal(r.decision,'ACCEPT');assert.equal(s.requests.length,1);
 if(['01','02','14'].includes(id)){
  const input=JSON.parse(s.requests[0].contents[0].parts[0].text);assert.equal(input.pedagogyEvaluation.distractorPolicy.responseForm,'concept-label');
  assert.ok('visualRelevant' in input.pedagogyEvaluation.requiredEvidence);assert.equal('alt' in input.visual,false);
 }
});
test('policy rubric works for non-golden natural turns and semantic failure classes',async()=>{
 const base={family:'SCHOOL_LIFE_DIALOGUE',answer:'a',asset:null};
 const good=candidate({...base,stem:"What's your name?",options:['My name is Ece.','Goodbye!',"I'm fine, thanks!"]});
 assert.equal((await setup(good).run()).decision,'ACCEPT');
 const meta=candidate({...base,stem:'Identify the expression used to introduce yourself.',options:['My name is Ece.','Goodbye!',"I'm fine, thanks!"]});
 assert.equal((await setup(meta,{instructionComprehensible:false}).run()).issues[0].code,'PEDAGOGY_INSTRUCTION_COMPREHENSIBLE');
 const trivial=candidate({...base,stem:'Good morning!',options:['Good morning!','Desk','Green']});
 assert.equal((await setup(trivial,{distractorsValid:false}).run()).issues[0].code,'PEDAGOGY_DISTRACTORS_VALID');
});
for(const id of ['09','17','18'])test('existing deterministic gate still rejects without verifier: '+id,async()=>{
 const s=setup(candidate(golden(id))),r=await s.run();assert.equal(r.decision,'REJECT');assert.equal(s.requests.length,0);
 assert.equal(r.issues[0].code,{'09':'DIALOGUE_STEM_FORMAT','17':'MALFORMED_PRESENTATION','18':'ANSWER_MISMATCH'}[id]);
});
test('unknown visual asset still rejects before independent transport',async()=>{
 const q=candidate(golden('01'));q.visual.asset='unknown';const s=setup(q);assert.equal((await s.run()).decision,'REJECT');assert.equal(s.requests.length,0);
});
test('missing English policy fails closed before any request; generator wire stays 838 bytes',async()=>{
 let calls=0;const verifier=new GeminiVerifier({getApiKey:()=> 'mock',fetch:async()=>{calls++;assert.fail('missing policy must not reach transport');}});
 await assert.rejects(()=>verifier.verify({curriculum:contexts[0],gradePolicy:p.gradePolicy,question:'Hello!',options:[{id:'a',text:'Hi!'},{id:'b',text:'Bye!'},{id:'c',text:'Sorry!'}]}),/UNSUPPORTED_VERIFICATION_INPUT/);
 assert.equal(calls,0);assert.equal(Buffer.byteLength(JSON.stringify(responseSchema(contexts[0],p,5,contexts))),838);
});
