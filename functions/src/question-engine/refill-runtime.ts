import type {CurriculumContext,QuestionVerifier} from './contracts.js';
import {ValidatorRegistry} from './registry.js';
import {VerifierRegistry,VerificationRouter} from './verification.js';
import {validateCandidateWithRouter} from './pipeline.js';
import type {RefillBudget,RefillRuntime} from './refill.js';
import type {RefillPolicy} from './refill-policy.js';
import type {GeminiGenerationProfile} from './providers/gemini-contract.js';
import {GeminiProvider} from './providers/gemini.js';
import {GeminiVerifier} from './providers/gemini-verifier.js';
import {baseTenValidator} from './fixtures/base-ten.js';
import {schoolVocabularyValidator} from './school-life.js';
import {stableJSON} from './fingerprint.js';

// Capability factories are server configuration, not subject-name routing.
export const refillCapabilities={
  'base-ten-to-number@1':'deterministic',
  'knowledge-grounded@1':'independent_ai'
} as const;
export function geminiRefillRuntime(context:CurriculumContext,profile:GeminiGenerationProfile,policy:RefillPolicy,budget:RefillBudget,
  transport?:typeof fetch,contexts:readonly CurriculumContext[]=[context]):RefillRuntime {
  const kind=refillCapabilities[profile.capability as keyof typeof refillCapabilities];
  if(!kind)throw new Error('UNSUPPORTED_REFILL_CAPABILITY');
  const deterministic=new ValidatorRegistry(),independent=new VerifierRegistry();
  const generator=new GeminiProvider(profile,{...(transport?{fetch:transport}:{}),contexts});
  const profiles=[profile,...(profile.variants||[])];
  if(profiles.length!==contexts.length)throw new Error('UNRESOLVED_VARIANTS');
  if(profile.variants?.some(p=>p.capability==='school-vocabulary@1'))deterministic.register(schoolVocabularyValidator(contexts));
  const addTokens=(tokens:number|null|undefined)=>{budget.totalTokens=budget.totalTokens===null||tokens==null?null:budget.totalTokens+tokens;};
  if(kind==='deterministic')deterministic.register(baseTenValidator([context]));
  else {
    const verifier=new GeminiVerifier(transport?{fetch:transport}:{});
    const observed:QuestionVerifier={id:verifier.id,async verify(input) {
      if(budget.verifierCalls>=policy.maxVerifierCalls||budget.totalTokens!==null&&budget.totalTokens>=policy.maxTotalTokens)throw new Error('VERIFIER_LIMIT');
      budget.verifierCalls++;
      try {return await verifier.verify(input);}finally {addTokens(verifier.lastRun?.totalTokens);}
    }};
    const sameCapability=profiles.map((p,i)=>({p,ctx:contexts[i]})).filter(({p})=>p.capability===profile.capability);
    independent.register({capability:profile.capability,verifier:observed,contexts:sameCapability.map(({ctx})=>ctx),families:sameCapability.map(({p})=>p.family),
      gradePolicy:profile.gradePolicy,visualKinds:profile.visual==='none'?[]:[profile.visual]});
    const variants=profiles.filter(p=>p.capability==='school-vocabulary@1');
    if(variants.length)independent.register({capability:'school-vocabulary@1',verifier:observed,contexts:contexts.slice(1),families:variants.map(p=>p.family),gradePolicy:profile.gradePolicy,visualKinds:variants.map(p=>p.visual)});
  }
  const router=new VerificationRouter(deterministic,independent);
  return {verification:kind,provider:{id:generator.id,async generateQuestions(ctx,request) {
    try {return await generator.generateQuestions(ctx,request);}finally {addTokens(generator.lastRun?.totalTokens);}
  }},validate:(candidate,duplicates)=>{
    const c=candidate as {family?:string;scope?:unknown},index=profiles.findIndex(p=>p.family===c?.family);
    if(profile.variants?.length && (index<0||stableJSON(c?.scope)!==stableJSON(contexts[index])))
      return Promise.resolve({decision:'REJECT',dryRun:true,issues:[{stage:'context',code:'SCHEMA_OR_SCOPE'}]} as const);
    return validateCandidateWithRouter(profile.variants?.length?contexts[index]:context,candidate,
      profile.variants?.length?profiles[index].capability:profile.capability,router,duplicates,generator.id);
  }};
}
