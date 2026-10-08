import type {CandidateQuestion,CurriculumContext} from './contracts.js';
import {resolveEnglishPedagogy,inspectEnglishPedagogy} from './english-pedagogy.js';
import {aiVerificationGate} from './quality-gate.js';

export interface CuratedAuditResult {id:string;status:'PASS'|'FAIL'|'REVIEW';reasons:string[]}
// Read-only: never creates scope/outcome/family assignments or approval receipts.
// Exact mapping and a trusted independent review are prerequisites for PASS.
export function auditCuratedEnglishQuestion(question:Record<string,unknown>,context?:CurriculumContext,evidence?:unknown):CuratedAuditResult {
  const result:CuratedAuditResult={id:String(question.id),status:'REVIEW',reasons:[]};
  const options=question.options as {id:string;text:string}[]|undefined;
  if(!Array.isArray(options)||!options.some(o=>o.id===question.correctOptionId)||new Set(options.map(o=>o.id)).size!==options.length){
    return {...result,status:'FAIL',reasons:['INVALID_OPTIONS_OR_ANSWER']};
  }
  if(typeof question.outcomeCode!=='string'||!question.outcomeCode)result.reasons.push('EXACT_OUTCOME_UNRESOLVED');
  if(typeof question.family!=='string')result.reasons.push('FAMILY_UNRESOLVED');
  if(!context||context.outcomeCode!==question.outcomeCode)result.reasons.push('CANONICAL_SCOPE_REVIEW_REQUIRED');
  const policy=context&&typeof question.family==='string'?resolveEnglishPedagogy(context,question.family):null;
  if(!policy){
    result.reasons.push('TARGET_VS_META_LANGUAGE_REVIEW_REQUIRED','DISTRACTOR_REVIEW_REQUIRED');
    if(!question.visual)result.reasons.push('VISUAL_PURPOSE_REVIEW_REQUIRED');
    return result;
  }
  if(result.reasons.length)return result;
  const candidate={...question,scope:context} as unknown as CandidateQuestion;
  const inspected=inspectEnglishPedagogy(candidate,policy);
  if(!inspected.valid)return {...result,status:'FAIL',reasons:[inspected.code!]};
  if(evidence===undefined)return {...result,reasons:['INDEPENDENT_PEDAGOGY_REVIEW_REQUIRED']};
  const review=aiVerificationGate(evidence,candidate,policy);
  return review.valid?{...result,status:'PASS'}:{...result,status:'FAIL',reasons:[review.code]};
}
