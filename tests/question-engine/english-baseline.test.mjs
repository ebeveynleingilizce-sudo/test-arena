import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {englishPedagogyGolden} from '../fixtures/english-pedagogy-golden.mjs';
import {runEnglishBaseline} from '../../scripts/question-engine-english-baseline.mjs';
import {requiredPedagogyChecks} from '../../functions/lib/question-engine/english-pedagogy.js';

test('approved fixture has 20 examples and unchanged human labels',()=>{
 assert.equal(englishPedagogyGolden.length,20);
 assert.equal(new Set(englishPedagogyGolden.map(r=>r.id)).size,20);
 assert.deepEqual(['PASS','FAIL','REVIEW'].map(s=>englishPedagogyGolden.filter(r=>r.expected===s).length),[7,10,3]);
 assert.equal(englishPedagogyGolden.find(r=>r.id==='13').options.join('/'),'Monday/Tuesday/Friday');
});
test('local plan preserves three deterministic rejects and makes no API calls',async()=>{
 const r=await runEnglishBaseline({plan:true,verifier:{verify:()=>assert.fail('plan must not call verifier')}});
 assert.equal(r.verifierCalls,0);assert.equal(r.evaluated,3);assert.equal(r.exactMatches,3);
 assert.deepEqual(r.results.filter(r=>r.result==='FAIL').map(r=>[r.id,r.reason]),[
  ['09','DIALOGUE_STEM_FORMAT'],['17','MALFORMED_PRESENTATION'],['18','ANSWER_MISMATCH']]);
 assert.equal(r.results.filter(r=>r.result==='NOT_RUN').length,17);
});
test('single-question verifier, at most 17 calls, blind DTO and explicit REVIEW label mismatches',async()=>{
 const inputs=[];
 const report=await runEnglishBaseline({verifier:{id:'MOCK_ONLY',model:'MOCK_ONLY',verify:async input=>{
  inputs.push(input);const selected=input.visual?input.options.find(o=>o.text==='a '+input.visual.asset).id:'a';
  return {selectedOptionId:selected,justification:'mock',confidence:0.99,issues:[],
   hasSingleCorrectAnswer:true,curriculumAligned:true,gradeAppropriate:true,factuallySound:true,questionClear:true,visualConsistent:true,
   ...Object.fromEntries(requiredPedagogyChecks(input.pedagogy.policy).map(k=>[k,true]))};
 }}});
 assert.equal(inputs.length,17);assert.equal(report.verifierCalls,17);assert.equal(report.evaluated,20);
 for(const input of inputs){for(const key of ['expected','answer','correctOptionId','explanation','candidateId'])assert.equal(key in input,false);}
 assert.equal(report.falseAccept,7);assert.equal(report.falseReject,0);
 assert.equal(report.mismatches,10); // seven false accepts plus three REVIEW label differences
 assert.deepEqual(report.reviewOutcomes.map(r=>r.result),['PASS','PASS','PASS']);
 assert.ok(report.results.filter(r=>r.stage==='independent_verifier').every(r=>r.evidence.naturalLanguage===true));
});
test('provider failure stops baseline immediately without retry or leaking remote error text',async()=>{
 let calls=0;
 const report=await runEnglishBaseline({verifier:{id:'MOCK_ONLY',verify:async()=>{calls++;throw Object.assign(new Error('secret-never-log'),{code:'HTTP_ERROR'});}}});
 assert.equal(calls,1);assert.equal(report.verifierCalls,1);assert.equal(report.aborted,true);
 assert.equal(report.results[0].result,'ERROR');assert.equal(report.results[0].reason,'HTTP_ERROR');
 assert.equal(JSON.stringify(report).includes('secret-never-log'),false);
});
test('CLI refuses live baseline without key before any call',()=>{
 const r=spawnSync(process.execPath,['scripts/question-engine-english-baseline.mjs'],{encoding:'utf8',env:{...process.env,GEMINI_API_KEY:''}});
 assert.equal(r.status,1);assert.match(r.stderr,/MISSING_API_KEY/);assert.equal(r.stdout,'');
});
