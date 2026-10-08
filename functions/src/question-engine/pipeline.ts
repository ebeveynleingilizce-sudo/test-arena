import type { CurriculumContext, GenerationRequest, QuestionProvider, Stage, ValidationResult } from './contracts.js';
import { isResolvedContext } from './curriculum.js';
import { validateCommon } from './common-validator.js';
import { DuplicateIndex, fingerprint } from './fingerprint.js';
import { ValidatorRegistry } from './registry.js';
import { qualityGate } from './quality-gate.js';
import { VerificationRouter } from './verification.js';
import { recordAccepted } from './accepted.js';

const reject = (stage:Stage,code:string):ValidationResult => ({decision:'REJECT',dryRun:true,issues:[{stage,code}]});
export function validateCandidate(context:CurriculumContext, candidate:unknown, capability:string,
  registry:ValidatorRegistry, duplicates = new DuplicateIndex(),providerFamily='server-unspecified'):ValidationResult {
  if (!isResolvedContext(context)) return reject('context','UNRESOLVED_CONTEXT');
  const common = validateCommon(context,candidate);
  if (!common.valid) return reject('common',common.code);
  if(context.subjectId==='ingilizce')return reject('domain','PEDAGOGY_VERIFICATION_REQUIRED');
  const validator = registry.get(capability);
  if (!validator) return reject('domain','UNKNOWN_CAPABILITY');
  try {
    if (!validator.supports(context)) return reject('domain','UNSUPPORTED_SCOPE');
    const result = validator.validate(common.candidate,context);
    // Even registered validators must independently agree with the declared answer.
    if (!result.valid) return reject('domain',result.code);
    if (!common.candidate.options.some(o=>o.id===result.solvedOptionId) || result.solvedOptionId !== common.candidate.correctOptionId) return reject('domain','ANSWER_MISMATCH');
    const f = fingerprint(common.candidate), decision = qualityGate(result,f,duplicates.has(f));
    if (decision.decision === 'ACCEPT') {
      duplicates.add(f);recordAccepted(decision,{candidate:common.candidate,context,capability,providerFamily,verificationMethod:'deterministic'});
    }
    return decision;
  } catch { return reject('domain','VALIDATOR_ERROR'); }
}
export async function validateCandidateWithRouter(context:CurriculumContext,candidate:unknown,capability:string,
  router:VerificationRouter,duplicates=new DuplicateIndex(),providerFamily='server-unspecified'):Promise<ValidationResult> {
  if(!isResolvedContext(context)) return reject('context','UNRESOLVED_CONTEXT');
  const common=validateCommon(context,candidate);
  if(!common.valid) return reject('common',common.code);
  try {
    const result=await router.verify(common.candidate,context,capability);
    if(!result.valid) return reject('domain',result.code);
    if(!common.candidate.options.some(o=>o.id===result.solvedOptionId)||result.solvedOptionId!==common.candidate.correctOptionId)
      return reject('domain','ANSWER_MISMATCH');
    const f=fingerprint(common.candidate),decision=qualityGate(result,f,duplicates.has(f));
    if(decision.decision==='ACCEPT') {
      duplicates.add(f);recordAccepted(decision,{candidate:common.candidate,context,capability,providerFamily,
        ...(context.subjectId==='ingilizce'?{pedagogyVersion:'english-pedagogy@1' as const}:{}),
        verificationMethod:router.deterministic.get(capability)?'deterministic':'independent_ai'});
    }
    return decision;
  } catch {return reject('domain','VERIFICATION_FAILURE');}
}
export async function dryRun(context:CurriculumContext, provider:QuestionProvider, request:GenerationRequest,
  capability:string, registry:ValidatorRegistry, duplicates = new DuplicateIndex(),router?:VerificationRouter):Promise<ValidationResult[]> {
  if (!isResolvedContext(context)) return [reject('context','UNRESOLVED_CONTEXT')];
  if (!Number.isInteger(request.count) || request.count < 1 || request.count > 20 || Object.keys(request).some(k=>k!=='count')) return [reject('provider','INVALID_REQUEST')];
  try {
    const candidates = await provider.generateQuestions(context,Object.freeze({...request}));
    if (!Array.isArray(candidates) || candidates.length !== request.count) return [reject('provider','INVALID_BATCH')];
    if(!router) return candidates.map(c=>validateCandidate(context,c,capability,registry,duplicates,provider.id));
    if(router.deterministic!==registry) return [reject('domain','ROUTER_REGISTRY_MISMATCH')];
    const results:ValidationResult[]=[];
    // Bounded sequential verification; no accidental five-way API burst.
    for(const candidate of candidates) results.push(await validateCandidateWithRouter(context,candidate,capability,router,duplicates,provider.id));
    return results;
  } catch { return [reject('provider','PROVIDER_ERROR')]; }
}
