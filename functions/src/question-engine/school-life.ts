import type {CandidateQuestion,CurriculumContext,DomainValidator} from './contracts.js';
import {stableJSON} from './fingerprint.js';
import {schoolPlaces,schoolPeople} from '../../visuals/school-life.mjs';
import {resolveCurriculumContext,type CanonicalCurriculum,type CurriculumNavigation} from './curriculum.js';
import type {GeminiGenerationProfile} from './providers/gemini-contract.js';

export function profileContexts(canonical:CanonicalCurriculum,navigation:CurriculumNavigation,profile:GeminiGenerationProfile){
  return [profile,...(profile.variants||[])].map(p=>resolveCurriculumContext(canonical,navigation,p.scope));
}
// Validation-only concept comparison; never rewrite visible option text.
const schoolConcept=(text:string)=>text.trim().toLowerCase().replace(/^(?:a|an)\s+/, '');
// Descriptor semantics come from the server whitelist, never model or claimed key.
export function schoolVocabularyValidator(contexts:readonly CurriculumContext[]):DomainValidator {
  return {capability:'school-vocabulary@1',supports:ctx=>contexts.some(c=>stableJSON(c)===stableJSON(ctx)) &&
    ctx.grade===2&&ctx.subjectId==='ingilizce'&&ctx.unitId==='g2-ingilizce-school-life'&&ctx.outcomeCode==='ENG.2.1.R3'&&
    ctx.subthemeId==='g2-ingilizce-school-life-people-and-places-at-school',
    validate(c:CandidateQuestion){
      const v=c.visual;
      if(!v||!(v.kind==='school-place'||v.kind==='school-person')||c.options.length!==3||c.options.some(o=>o.visual)||Object.keys(c.model).length)
        return {valid:false,code:'SCHOOL_VISUAL_CONTRACT'};
      const place=v.kind==='school-place',family=place?'SCHOOL_LIFE_PLACE':'SCHOOL_LIFE_PERSON';
      if(c.family!==family||c.question!==(place?'What is this?':'Who is this?'))return {valid:false,code:'SCHOOL_STEM_FORMAT'};
      const vocabulary:readonly string[]=place?schoolPlaces:schoolPeople;
      const labels=c.options.map(o=>schoolConcept(o.text));
      if(!vocabulary.includes(v.asset)||labels.some(s=>!vocabulary.includes(s)))return {valid:false,code:'SCHOOL_VOCABULARY'};
      const matches=c.options.filter((_,i)=>labels[i]===v.asset);
      if(matches.length!==1)return {valid:false,code:'NO_SINGLE_CORRECT_ANSWER'};
      if(matches[0].id!==c.correctOptionId)return {valid:false,code:'ANSWER_MISMATCH'};
      // Do not allow a generator explanation to contradict the trusted concept.
      if(!new RegExp('^(?:It|This) is a '+v.asset+'[.!]?$','i').test(c.explanation.trim()))return {valid:false,code:'EXPLANATION_MISMATCH'};
      return {valid:true,solvedOptionId:matches[0].id};
    }};
}
