import {pedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';
import {englishWire} from '../fixtures/english-wire.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../../functions/lib/question-engine/curriculum.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {parseGeminiResponse,responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';
import {geminiRefillRuntime} from '../../functions/lib/question-engine/refill-runtime.js';
import {resolveRefillPolicy} from '../../functions/lib/question-engine/refill-policy.js';
import {DuplicateIndex} from '../../functions/lib/question-engine/fingerprint.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {validateCommon} from '../../functions/lib/question-engine/common-validator.js';
import {parseRefillArgs} from '../../scripts/question-engine-refill-args.mjs';
import {objectAssets,objectTypes} from '../../functions/visuals/contract.mjs';

// Injected transport only: no live Gemini, emulator, publication or refill.
const canonical=JSON.parse(readFileSync('data/mufredat/2-sinif.json','utf8'));
const navigation=JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json','utf8'));
// Keep text-stem policy tests isolated from the separate mixed visual profile tests.
const profile={...geminiDryRunProfiles.find(p=>p.id==='english-school-life'),variants:undefined,visual:'none'};
const context=resolveCurriculumContext(canonical,navigation,profile.scope);
const policy=resolveRefillPolicy(JSON.parse(readFileSync('data/question-engine/refill-policy.json','utf8')),context,profile.family);
const examples=[
  ['How are you?',"I'm fine, thanks!",'My name is Ada.','Goodbye!'],
  ['What is your name?','My name is Ada.',"I'm fine, thanks!",'See you tomorrow!'],
  ['Nice to meet you!','Nice to meet you, too!','Goodbye!','Sorry!'],
  ['Goodbye!','See you tomorrow!','My name is Ada.','Good morning!'],
  ['Can I sit here?','Sure!','My name is Ada.',"I'm fine, thanks!"]
];
const candidates=()=>examples.map(([question,...texts])=>({scope:context,type:'multiple-choice',difficulty:'easy',question,
  options:texts.map((text,i)=>({id:['a','b','c'][i],text})),correctOptionId:'a',explanation:'PRIVATE_GENERATOR_CLAIM',family:profile.family,model:{}}));
const envelope=value=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}],
  usageMetadata:{promptTokenCount:20,candidatesTokenCount:20,totalTokenCount:40}});
const evidence=patch=>({selectedOptionId:'a',justification:'The reply fits the written school dialogue.',hasSingleCorrectAnswer:true,
  curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.99,issues:[],...Object.fromEntries(pedagogyChecks.map(k=>[k,true])),...patch});
async function mockRun(patch={},mutate=c=>c){
  const original=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-key-no-network';
  const requests=[],budget={verifierCalls:0,totalTokens:0};
  try {
    const runtime=geminiRefillRuntime(context,profile,policy,budget,async(_url,init)=>{
      const body=JSON.parse(init.body),input=JSON.parse(body.contents[0].parts[0].text);requests.push(input);
      return new Response(JSON.stringify(envelope('count' in input?{questions:candidates().map(c=>englishWire(c))}:evidence(patch))));
    });
    const generated=await runtime.provider.generateQuestions(context,{count:5}),duplicates=new DuplicateIndex(),results=[];
    for(const c of generated)results.push(await runtime.validate(mutate(c),duplicates));
    return {requests,results,budget,generated};
  }finally {if(original===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=original;}
}
test('one exact School Life reading scope resolves; source is recorded, other English scopes stay closed',()=>{
  assert.equal(context.outcomeCode,'ENG.2.1.R3');assert.equal(context.subthemeId,profile.scope.subthemeId);
  assert.match(context.outcomeText,/greetings and introductions at school/);
  const themes=canonical.subjects.find(s=>s.id==='ingilizce').themes;
  assert.equal(themes.flatMap(t=>t.subthemes).filter(s=>s.outcomes).length,2);
  assert.equal(themes[0].subthemes[0].outcomeSource,'https://tymm.meb.gov.tr/ingilizce-dersi-temel-egitim/unite/629');
  for(const patch of [{grade:3},{unitId:'g2-ingilizce-classroom-life'},{outcomeCode:'ENG.2.1.S1'},
    {subthemeId:'g2-ingilizce-school-life-days-of-the-week'}])
    assert.throws(()=>resolveCurriculumContext(canonical,navigation,{...profile.scope,...patch}));
});
test('structured output requires exactly three options; fourth option or unsupported visual fails closed',()=>{
  const schema=responseSchema(context,profile,5).properties.questions.items.properties;
  assert.equal(schema.options.type,'array');assert.equal(schema.visualType.type,'string');assert.equal(schema.visual,undefined);
  const qs=candidates().map(c=>englishWire(c));assert.equal(parseGeminiResponse(envelope({questions:qs}),profile,5,[context]).length,5);
  qs[0].options.push({id:'d',text:'Hello!'});
  assert.throws(()=>parseGeminiResponse(envelope({questions:qs}),profile,5,[context]),/INVALID_OPTIONS/);
  const visual=candidates().map(c=>englishWire(c));visual[0].visual={kind:'object',asset:'classroom',alt:'A school room'};
  assert.throws(()=>parseGeminiResponse(envelope({questions:visual}),profile,5,[context]),/FORBIDDEN_FIELD/);
});
test('five diverse mock dialogues pass the existing independent verifier and quality gate',async()=>{
  const r=await mockRun();assert.deepEqual(r.results.map(x=>x.decision),Array(5).fill('ACCEPT'));
  assert.equal(r.budget.verifierCalls,5);assert.equal(r.requests.length,6);
  for(const result of r.results)assert.equal(acceptedSnapshot(result).verificationMethod,'independent_ai');
  for(const input of r.requests.slice(1)){
    assert.equal(input.gradePolicy.language,'en');assert.deepEqual(input.curriculum,context);
    for(const key of ['correctOptionId','explanation','candidateId','model','PRIVATE_GENERATOR_CLAIM'])assert.equal(JSON.stringify(input).includes(key),false);
  }
  assert.deepEqual(r.requests[0].allowedVisualCapabilities,[]);
  assert.ok(r.requests[0].generationRules.some(rule=>rule.includes('ONLY one short natural English utterance')));
});
for(const stem of [
  'Read the dialogue and choose the best reply: - What is your name? - ...',
  'Choose the best reply: How are you?',
  'Choose the correct answer: How are you?',
  'Complete the dialogue: Nice to meet you!',
  'Look and choose: What is your name?',
  '- What is your name? - ...',
  'How are you? …',
  'What is your name? ____',
  'A: How are you? B:',
  'How are you?\nB: ____',
  'How are you? . . .'
])test('reject artificial dialogue stem before verifier: '+JSON.stringify(stem),async()=>{
  const r=await mockRun({},c=>({...c,question:stem}));
  assert.ok(r.results.every(x=>x.decision==='REJECT'&&x.issues[0].code==='DIALOGUE_STEM_FORMAT'));
  assert.equal(r.budget.verifierCalls,0);
});
test('stem rule does not filter options, explanations or other generation families',()=>{
  const c={...candidates()[0],candidateId:'format-policy-test',explanation:'Read the reply: it answers the question.'};
  assert.equal(validateCommon(context,c).valid,true);
  assert.equal(validateCommon(context,{...c,family:'OTHER_FAMILY',question:'Read the dialogue: A: Hello! B: ____'}).valid,true);
});
for(const [name,patch,code] of [
  ['independent answer disagrees',{selectedOptionId:'b'},'ANSWER_MISMATCH'],
  ['ambiguous dialogue',{hasSingleCorrectAnswer:false},'NO_SINGLE_CORRECT_ANSWER'],
  ['off-curriculum language',{curriculumAligned:false},'CURRICULUM_MISMATCH'],
  ['uncertain verifier',{confidence:0.5},'LOW_CONFIDENCE']
])test(name+' is rejected',async()=>{
  const r=await mockRun(patch);assert.ok(r.results.every(x=>x.decision==='REJECT'&&x.issues[0].code===code));
});
test('foreign scope and wrong family are rejected before any verifier call',async()=>{
  const scope=await mockRun({},c=>({...c,scope:{...c.scope,unitId:'g2-ingilizce-classroom-life'}}));
  assert.ok(scope.results.every(r=>r.decision==='REJECT'));assert.equal(scope.budget.verifierCalls,0);
  const family=await mockRun({},c=>({...c,family:'DAILY_PLANNING'}));
  assert.ok(family.results.every(r=>r.decision==='REJECT'));assert.equal(family.budget.verifierCalls,0);
});
test('unsupported school visuals remain unavailable; manual CLI is one batch with unchanged target',()=>{
  for(const asset of ['classroom','library','teacher','pupil','headmaster']){
    assert.equal(objectAssets.includes(asset),false);assert.equal(objectTypes.includes(asset),false);
  }
  assert.deepEqual(parseRefillArgs(['english-school-life','--gemini','--publish','--max-batches','1']),
    {id:'english-school-life',mode:'publish',maxBatches:1});
  assert.equal(policy.batchSize,5);assert.equal(policy.targetVerifiedQuestions,30);
});
