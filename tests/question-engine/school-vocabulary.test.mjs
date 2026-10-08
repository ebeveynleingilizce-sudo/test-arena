import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {profileContexts,schoolVocabularyValidator} from '../../functions/lib/question-engine/school-life.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {validateCommon} from '../../functions/lib/question-engine/common-validator.js';
import {schoolPlaces,schoolPeople,schoolVisualAlt} from '../../functions/visuals/school-life.mjs';
const profile=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
const contexts=profileContexts(JSON.parse(readFileSync('data/mufredat/2-sinif.json')),JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json')),profile);
const validator=schoolVocabularyValidator(contexts);
function candidate(asset,format){
 const place=schoolPlaces.includes(asset),words=place?schoolPlaces:schoolPeople;
 return {candidateId:'vocabulary-regression',scope:contexts[1],family:place?'SCHOOL_LIFE_PLACE':'SCHOOL_LIFE_PERSON',type:'multiple-choice',difficulty:'easy',model:{},
  question:place?'What is this?':'Who is this?',options:words.map((word,i)=>({id:['a','b','c'][i],text:format(word,i)})),
  correctOptionId:['a','b','c'][words.indexOf(asset)],explanation:'It is a '+asset+'.',visual:{kind:place?'school-place':'school-person',asset,alt:schoolVisualAlt[asset]},visualPlacement:'above'};
}
const forms={bare:w=>w,article:w=>'a '+w,mixed:(w,i)=>i%2?'a '+w:w,comparisonOnlyAn:w=>'an '+w,caseAndSpace:w=>'  A  '+w.toUpperCase()+'  '};
for(const asset of [...schoolPlaces,...schoolPeople])for(const [name,format] of Object.entries(forms))test('concept binding '+asset+' / '+name+' preserves option strings',()=>{
 const q=candidate(asset,format),before=structuredClone(q);
 assert.equal(validateCommon(q.scope,q).valid,true);
 assert.deepEqual(validator.validate(q,q.scope),{valid:true,solvedOptionId:q.correctOptionId});assert.deepEqual(q,before);
});
for(const asset of [...schoolPlaces,...schoolPeople])test('equivalent answer concepts do not become multiple correct accepted options: '+asset,()=>{
 const q=candidate(asset,forms.bare);q.options[0].text=asset;q.options[1].text='a '+asset;
 q.options[2].text=[...schoolPlaces,...schoolPeople].find(word=>word!==asset&&(schoolPlaces.includes(asset)?schoolPlaces:schoolPeople).includes(word));
 assert.equal(validateCommon(q.scope,q).valid,true);assert.equal(validator.validate(q,q.scope).code,'NO_SINGLE_CORRECT_ANSWER');
});
for(const asset of [...schoolPlaces,...schoolPeople])test('wrong answer key still fails: '+asset,()=>{
 const q=candidate(asset,forms.bare);q.correctOptionId=q.correctOptionId==='a'?'b':'a';
 assert.equal(validator.validate(q,q.scope).code,'ANSWER_MISMATCH');
});
test('unknown vocabulary/assets and extra prefixes still fail',()=>{
 for(const text of ['canteen','the classroom','a a classroom','classroom extra','classroom/library','']){
  const q=candidate('classroom',forms.bare);q.options[0].text=text;assert.equal(validator.validate(q,q.scope).code,'SCHOOL_VOCABULARY');
 }
 const q=candidate('classroom',forms.bare);q.visual.asset='canteen';assert.equal(validator.validate(q,q.scope).code,'SCHOOL_VOCABULARY');
});
test('explanation contradiction and stem/family contracts remain unchanged',()=>{
 const q=candidate('classroom',forms.bare);
 assert.equal(validator.validate({...q,explanation:'It is a library.'},q.scope).code,'EXPLANATION_MISMATCH');
 assert.equal(validator.validate({...q,question:'Who is this?'},q.scope).code,'SCHOOL_STEM_FORMAT');
 assert.equal(validator.validate({...q,family:'SCHOOL_LIFE_PERSON'},q.scope).code,'SCHOOL_STEM_FORMAT');
});
