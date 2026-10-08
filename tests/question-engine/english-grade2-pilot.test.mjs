import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {englishGrade2Content} from '../../functions/lib/question-engine/english-grade2-content.js';
import {englishGrade2PilotProfile} from '../../functions/lib/question-engine/providers/english-grade2-pilot.js';
import {profileContexts} from '../../functions/lib/question-engine/school-life.js';
import {resolveEnglishPedagogy,inspectEnglishPedagogy,requiredPedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';
import {geminiRefillRuntime} from '../../functions/lib/question-engine/refill-runtime.js';
import {aiVerificationGate} from '../../functions/lib/question-engine/quality-gate.js';
import {DuplicateIndex} from '../../functions/lib/question-engine/fingerprint.js';
import {responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';
const canonical=JSON.parse(readFileSync('data/mufredat/2-sinif.json')),nav=JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json'));
const policy=JSON.parse(readFileSync('data/question-engine/refill-policy.json')).defaults;
for(const unit of englishGrade2Content)test(unit.name+' exact R3, both families and text-only policy resolve',()=>{
  const p=englishGrade2PilotProfile(unit.unitId,unit.subthemes[0].id),contexts=profileContexts(canonical,nav,p);
  for(const [i,profile]of [p,...p.variants].entries()) {
    const pedagogy=resolveEnglishPedagogy(contexts[i],profile.family);
    assert.equal(pedagogy.outcome.code,unit.outcomeCode);assert.equal(pedagogy.outcome.source,unit.source);
    assert.deepEqual(pedagogy.visualPolicy.allowedIds,[]);assert.equal(profile.visual,'none');
  }
  assert.equal(JSON.stringify(responseSchema(contexts[0],p,5,contexts)).length,838);
});
test('unknown scope, wrong outcome and any visual remain rejected',()=>{
  assert.throws(()=>englishGrade2PilotProfile('g2-unknown','x'));
  const unit=englishGrade2Content[3],p=englishGrade2PilotProfile(unit.unitId,unit.subthemes[0].id),[context]=profileContexts(canonical,nav,p);
  assert.equal(resolveEnglishPedagogy({...context,outcomeCode:'ENG.2.4.S3'},p.family),null);
  const pedagogy=resolveEnglishPedagogy(context,p.family);
  const q={scope:context,family:p.family,question:'I am hungry!',options:[{id:'a',text:'It is lunchtime.'},{id:'b',text:'Goodbye!'},{id:'c',text:'Thank you.'}],visual:{kind:'school-person',asset:'teacher'}};
  assert.equal(inspectEnglishPedagogy(q,pedagogy).code,'PEDAGOGY_VISUAL_POLICY');
});
test('both generic families use the existing blind independent verifier and never waive evidence or answer matching',async()=>{
  const unit=englishGrade2Content[5],p=englishGrade2PilotProfile(unit.unitId,unit.subthemes[0].id),contexts=profileContexts(canonical,nav,p),ctx=contexts[1];
  const q={candidateId:'mock-reading',scope:ctx,family:'ENGLISH_CONTEXT_READING',type:'multiple-choice',difficulty:'easy',model:{},question:'I have got some milk. What have I got?',options:[{id:'a',text:'Milk.'},{id:'b',text:'Tea.'},{id:'c',text:'Water.'}],correctOptionId:'a',explanation:'I have got some milk.'};
  const pedagogy=resolveEnglishPedagogy(ctx,q.family);
  const evidence={selectedOptionId:'a',justification:'The context specifies milk; alternatives are liquids in the source.',hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,confidence:0.99,issues:[],...Object.fromEntries(requiredPedagogyChecks(pedagogy).map(k=>[k,true]))};
  const budget={verifierCalls:0,totalTokens:0};let request;
  const previousKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='mock-test-key';
  const runtime=geminiRefillRuntime(contexts[0],p,policy,budget,async(_url,opts)=>{request=JSON.parse(opts.body);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(evidence)}]}}],usageMetadata:{totalTokenCount:7}}));},contexts);
  let result;try {result=await runtime.validate(q,new DuplicateIndex());} finally {if(previousKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=previousKey;}
  assert.equal(result.decision,'ACCEPT');assert.equal(budget.verifierCalls,1);
  const sent=JSON.parse(request.contents[0].parts[0].text);assert.equal(sent.pedagogyEvaluation.family,q.family);assert(!('correctOptionId' in sent));
  assert.equal(aiVerificationGate({...evidence,selectedOptionId:'b'},q,pedagogy).code,'ANSWER_MISMATCH');
  assert.equal(aiVerificationGate({...evidence,distractorsValid:false},q,pedagogy).code,'PEDAGOGY_DISTRACTORS_VALID');
});
