import type { CurriculumContext } from './contracts.js';
export interface RefillPolicy {
  targetVerifiedQuestions:number;overgenerationFactor:number;batchSize:number;
  maxBatches:number;maxGeneratedCandidates:number;maxProviderCalls:number;maxVerifierCalls:number;
  maxTotalTokens:number;maxNoProgressBatches:number;
}
export interface RefillPolicyConfig {
  defaults:RefillPolicy;
  targets:{match:Partial<Pick<CurriculumContext,'grade'|'subjectId'|'unitId'|'themeId'|'topicId'|'subthemeId'|'outcomeCode'>> &
    {family?:string;difficulty?:string};targetVerifiedQuestions:number}[];
}
export function resolveRefillPolicy(config:RefillPolicyConfig,context:CurriculumContext,family:string,difficulty?:string):RefillPolicy {
  const selector={...context,family,difficulty},policy={...config.defaults};
  // Ordered config overrides, last matching entry wins; no per-subject branches.
  for(const target of config.targets) {
    if(Object.keys(target.match).some(k=>!['grade','subjectId','unitId','themeId','topicId','subthemeId','outcomeCode','family','difficulty'].includes(k))) throw new Error('INVALID_REFILL_POLICY');
    if(Object.entries(target.match).every(([k,v])=>selector[k as keyof typeof selector]===v)) policy.targetVerifiedQuestions=target.targetVerifiedQuestions;
  }
  for(const key of ['targetVerifiedQuestions','batchSize','maxBatches','maxGeneratedCandidates','maxProviderCalls','maxVerifierCalls','maxTotalTokens','maxNoProgressBatches'] as const)
    if(!Number.isInteger(policy[key])||policy[key]<1||policy[key]>100000) throw new Error('INVALID_REFILL_POLICY');
  if(policy.targetVerifiedQuestions>1000||policy.batchSize>20||policy.maxBatches>20||policy.maxGeneratedCandidates>100||
    policy.maxProviderCalls>20||policy.maxVerifierCalls>100||!Number.isFinite(policy.overgenerationFactor)||policy.overgenerationFactor<1||policy.overgenerationFactor>1.5)
    throw new Error('INVALID_REFILL_POLICY');
  return Object.freeze(policy);
}
export const plannedBatch=(gap:number,policy:RefillPolicy,remainingCandidates=policy.maxGeneratedCandidates)=>
  Math.max(0,Math.min(Math.ceil(gap*policy.overgenerationFactor),policy.batchSize,remainingCandidates));
