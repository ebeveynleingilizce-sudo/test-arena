import type { CandidateQuestion, DomainResult, Fingerprints, ValidationResult, VerificationEvidence } from './contracts.js';
import {requiredPedagogyChecks,type EnglishPedagogyPolicy} from './english-pedagogy.js';
import type {EnglishVerificationEvidence} from './contracts.js';

// Conservative MVP signal, not a calibrated probability of correctness.
// No confidence value can override a hard failure or guarantee factual truth.
export const MIN_VERIFIER_CONFIDENCE=0.95;
export const verificationChecks=['hasSingleCorrectAnswer','curriculumAligned','gradeAppropriate','factuallySound','questionClear','visualConsistent'] as const;
export function parseVerificationEvidence(raw:unknown,policy?:EnglishPedagogyPolicy):EnglishVerificationEvidence|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.getPrototypeOf(raw)!==Object.prototype) return null;
  const extra=policy?requiredPedagogyChecks(policy):[];
  const r=raw as Record<string,unknown>,keys=['selectedOptionId','justification',...verificationChecks,'confidence','issues',...extra];
  if(Object.keys(r).length!==keys.length||Object.keys(r).some(k=>!keys.includes(k))||
    !(r.selectedOptionId===null||typeof r.selectedOptionId==='string'&&['a','b','c','d'].includes(r.selectedOptionId))||
    typeof r.justification!=='string'||!r.justification.trim()||r.justification.length>2000||
    /<\/?[a-z!]|https?:\/\/|javascript:|data:/i.test(r.justification)||
    [...verificationChecks,...extra].some(k=>typeof r[k]!=='boolean')||typeof r.confidence!=='number'||!Number.isFinite(r.confidence)||r.confidence<0||r.confidence>1||
    !Array.isArray(r.issues)||r.issues.length>10||r.issues.some(i=>typeof i!=='string'||!i.trim()||i.length>100)) return null;
  return r as unknown as VerificationEvidence;
}
export function aiVerificationGate(raw:unknown,candidate:CandidateQuestion,policy?:EnglishPedagogyPolicy):DomainResult {
  const evidence=parseVerificationEvidence(raw,policy);
  if(!evidence) return {valid:false,code:policy?'MALFORMED_PEDAGOGY_EVIDENCE':'MALFORMED_VERIFICATION'};
  if(!evidence.hasSingleCorrectAnswer||evidence.selectedOptionId===null) return {valid:false,code:'NO_SINGLE_CORRECT_ANSWER'};
  if(!candidate.options.some(o=>o.id===evidence.selectedOptionId)||evidence.selectedOptionId!==candidate.correctOptionId)
    return {valid:false,code:'ANSWER_MISMATCH'};
  const failures:Record<string,string>={curriculumAligned:'CURRICULUM_MISMATCH',gradeAppropriate:'GRADE_MISMATCH',
    factuallySound:'FACTUAL_ERROR',questionClear:'AMBIGUOUS_QUESTION',visualConsistent:'VISUAL_MISMATCH'};
  for(const [check,code] of Object.entries(failures)) if(!evidence[check as keyof VerificationEvidence]) return {valid:false,code};
  if(policy)for(const check of requiredPedagogyChecks(policy))if(evidence[check]!==true)return {valid:false,code:'PEDAGOGY_'+check.replace(/[A-Z]/g,c=>'_'+c).toUpperCase()};
  if(evidence.issues.length) return {valid:false,code:'VERIFIER_ISSUES'};
  if(evidence.confidence<MIN_VERIFIER_CONFIDENCE) return {valid:false,code:'LOW_CONFIDENCE'};
  return {valid:true,solvedOptionId:evidence.selectedOptionId};
}

export function qualityGate(result: DomainResult, fingerprints: Fingerprints, duplicate: boolean): ValidationResult {
  if (!result.valid) return {decision:'REJECT',dryRun:true,issues:[{stage:'domain',code:result.code}]};
  if (duplicate) return {decision:'REJECT',dryRun:true,issues:[{stage:'quality',code:'DUPLICATE'}]};
  // ACCEPT means validation passed in memory. It is never a publication operation.
  return {decision:'ACCEPT',dryRun:true,fingerprints,solvedOptionId:result.solvedOptionId};
}
