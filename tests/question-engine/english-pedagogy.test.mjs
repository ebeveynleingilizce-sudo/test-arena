import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolveEnglishPedagogy,inspectEnglishPedagogy,pedagogyChecks,requiredPedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';
import {auditCuratedEnglishQuestion} from '../../functions/lib/question-engine/english-curated-audit.js';
import {profileContexts,schoolVocabularyValidator} from '../../functions/lib/question-engine/school-life.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';
import {VerificationRouter,VerifierRegistry} from '../../functions/lib/question-engine/verification.js';
import {ValidatorRegistry} from '../../functions/lib/question-engine/registry.js';
import {validateCandidateWithRouter,validateCandidate} from '../../functions/lib/question-engine/pipeline.js';
import {acceptedSnapshot} from '../../functions/lib/question-engine/accepted.js';
import {schoolVisualAlt} from '../../functions/visuals/school-life.mjs';
const p=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
const contexts=profileContexts(JSON.parse(readFileSync('data/mufredat/2-sinif.json')),JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json')),p);
function candidate(family='SCHOOL_LIFE_DIALOGUE',stem='How are you?'){
 const dialogue=family==='SCHOOL_LIFE_DIALOGUE',place=family==='SCHOOL_LIFE_PLACE';
 const asset=place?'classroom':'teacher';
 return {candidateId:'offline-pedagogy',scope:contexts[dialogue?0:1],type:'multiple-choice',difficulty:'easy',family,model:{},question:dialogue?stem:place?'What is this?':'Who is this?',
  options:(dialogue?["I'm fine, thanks!",'Goodbye!','My name is Anna.']:place?['a classroom','a library','a garden']:['a teacher','a pupil','a headmaster']).map((text,i)=>({id:['a','b','c'][i],text})),
  correctOptionId:'a',explanation:dialogue?'The reply answers how the pupil feels.':'It is a '+asset+'.',
  ...(!dialogue?{visual:{kind:place?'school-place':'school-person',asset,alt:schoolVisualAlt[asset]},visualPlacement:'above'}:{})};
}
const evidence=(semantic=false)=>({selectedOptionId:'a',justification:'Independent assessment.',hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,
 factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.99,issues:[],...Object.fromEntries(pedagogyChecks.map(k=>[k,true])),...(semantic?{visualRelevant:true}:{})});
function setup(q,patch={}){
 const inputs=[],deterministic=new ValidatorRegistry();
 const visual=q.family!=='SCHOOL_LIFE_DIALOGUE',capability=visual?'school-vocabulary@1':'knowledge-grounded@1';
 if(visual)deterministic.register(schoolVocabularyValidator(contexts));
 const independent=new VerifierRegistry().register({capability,contexts:[q.scope],families:[q.family],gradePolicy:p.gradePolicy,
  visualKinds:visual?[q.visual.kind]:[],verifier:{id:'offline-pedagogy',verify:async input=>{inputs.push(input);return {...evidence(visual),...patch};}}});
 return {inputs,deterministic,run:()=>validateCandidateWithRouter(q.scope,q,capability,new VerificationRouter(deterministic,independent))};
}
test('only existing exact contexts resolve; decorative dialogue is not semantic evidence',()=>{
 const policy=resolveEnglishPedagogy(contexts[0],p.family);
 assert.equal(policy.pedagogyBand,'early-beginner');assert.equal(policy.visualPolicy.required,false);
 assert.equal(requiredPedagogyChecks(policy).includes('visualRelevant'),false);
 for(const patch of [{grade:3},{outcomeCode:'ENG.2.1.S1'},{unitId:'g2-ingilizce-classroom-life'}])assert.equal(resolveEnglishPedagogy({...contexts[0],...patch},p.family),null);
 assert.equal(resolveEnglishPedagogy(contexts[0],'UNKNOWN'),null);
});
for(const stem of ['Which one is a greeting?','Which one is a day of the week?','Which one is a classroom object?'])test('short meta stem needs independent comprehension, never silent approval: '+stem,async()=>{
 const q=candidate(undefined,stem),policy=resolveEnglishPedagogy(q.scope,q.family);
 assert.equal(inspectEnglishPedagogy(q,policy).needsSemanticStemReview,true);
 const s=setup(q,{instructionComprehensible:false});const result=await s.run();
 assert.equal(result.decision,'REJECT');assert.equal(result.issues[0].code,'PEDAGOGY_INSTRUCTION_COMPREHENSIBLE');assert.equal(acceptedSnapshot(result),null);
 assert.equal(s.inputs[0].pedagogy.needsSemanticStemReview,true);
});
for(const [family,stem] of [['SCHOOL_LIFE_DIALOGUE','How are you?'],['SCHOOL_LIFE_DIALOGUE','What is your name?'],['SCHOOL_LIFE_DIALOGUE','Nice to meet you!'],['SCHOOL_LIFE_PLACE','What is this?'],['SCHOOL_LIFE_PERSON','Who is this?']])test('supported target expression can pass independent pedagogy: '+stem,async()=>{
 const s=setup(candidate(family,stem)),r=await s.run();assert.equal(r.decision,'ACCEPT');assert.equal(acceptedSnapshot(r).pedagogyVersion,'english-pedagogy@1');
 assert.equal(s.inputs[0].pedagogy.needsSemanticStemReview,false);assert.equal('correctOptionId' in s.inputs[0],false);assert.equal('explanation' in s.inputs[0],false);
});
for(const check of pedagogyChecks)test('mandatory evidence failure blocks receipt: '+check,async()=>{
 const r=await setup(candidate(),{[check]:false}).run();assert.equal(r.decision,'REJECT');assert.equal(acceptedSnapshot(r),null);
});
test('missing or mistyped pedagogy evidence fails closed despite old gradeAppropriate=true',async()=>{
 for(const value of [undefined,'true']){const r=await setup(candidate(),{naturalLanguage:value}).run();assert.equal(r.issues[0].code,'MALFORMED_PEDAGOGY_EVIDENCE');assert.equal(acceptedSnapshot(r),null);}
});
test('visual pedagogy must pass after deterministic answer; bad answer and unknown asset never fall back',async()=>{
 for(const value of [false,undefined]){const s=setup(candidate('SCHOOL_LIFE_PLACE'),{visualRelevant:value}),r=await s.run();assert.equal(r.decision,'REJECT');assert.equal(s.inputs.length,1);assert.equal(acceptedSnapshot(r),null);}
 for(const mutate of [q=>({...q,correctOptionId:'b'}),q=>({...q,visual:{...q.visual,asset:'unknown'}})]){const s=setup(mutate(candidate('SCHOOL_LIFE_PLACE'))),r=await s.run();assert.equal(r.decision,'REJECT');assert.equal(s.inputs.length,0);}
});
test('multiple-correct distractors reject; same-category is never a universal rule',async()=>{
 const q=candidate(undefined,'Which one is a day of the week?');q.options=['Monday','Tuesday','Friday'].map((text,i)=>({id:['a','b','c'][i],text}));
 const r=await setup(q,{hasSingleCorrectAnswer:false,selectedOptionId:null,distractorsValid:false}).run();assert.equal(r.issues[0].code,'NO_SINGLE_CORRECT_ANSWER');assert.equal(acceptedSnapshot(r),null);
});
test('synchronous deterministic pipeline cannot bypass English pedagogy',()=>{
 const q=candidate('SCHOOL_LIFE_PLACE'),s=setup(q),r=validateCandidate(q.scope,q,'school-vocabulary@1',s.deterministic);
 assert.equal(r.issues[0].code,'PEDAGOGY_VERIFICATION_REQUIRED');assert.equal(acceptedSnapshot(r),null);
});
test('English generator wire stays exactly 838 bytes',()=>assert.equal(Buffer.byteLength(JSON.stringify(responseSchema(contexts[0],p,5,contexts))),838));
test('curated audit is read-only and never guesses unresolved outcome/family',()=>{
 const path='data/soru-bankasi/2-sinif/ingilizce.json',before=readFileSync(path),bank=JSON.parse(before);
 const results=bank.questions.map(q=>auditCuratedEnglishQuestion(q));assert.equal(results.length,5);assert.deepEqual(results.map(r=>r.status),Array(5).fill('REVIEW'));
 for(const r of results)assert.ok(r.reasons.includes('EXACT_OUTCOME_UNRESOLVED'));
 assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),createHash('sha256').update(before).digest('hex'));
 const q={...candidate(),id:'offline-reviewed',outcomeCode:contexts[0].outcomeCode};assert.equal(auditCuratedEnglishQuestion(q,contexts[0],evidence()).status,'PASS');
 assert.equal(auditCuratedEnglishQuestion(q,contexts[0],{...evidence(),distractorsValid:false}).status,'FAIL');
});
