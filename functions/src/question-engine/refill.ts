import type { CurriculumContext, Fingerprints, QuestionProvider, ValidationResult } from './contracts.js';
import { isResolvedContext } from './curriculum.js';
import { validateCommon } from './common-validator.js';
import { DuplicateIndex, fingerprint } from './fingerprint.js';
import { plannedBatch, type RefillPolicy } from './refill-policy.js';
import { GeminiProviderError, type GeminiErrorDetails } from './providers/gemini-contract.js';

export interface PoolSummary {count:number;curated:number;aiVerified:number;byDifficulty:Record<string,number>;byFamily:Record<string,number>;fingerprints:Fingerprints[]}
export interface RefillStore {
  summary(context:CurriculumContext,difficulty?:string):Promise<PoolSummary>;
  acquire(context:CurriculumContext):Promise<string|null>;
  renew(context:CurriculumContext,lease:string):Promise<boolean>;
  release(context:CurriculumContext,lease:string):Promise<void>;
  publish(result:ValidationResult):Promise<{newlyPublished:boolean;duplicate:boolean}>;
}
export interface RefillBudget {verifierCalls:number;totalTokens:number|null}
export interface RefillRuntime {
  provider:QuestionProvider;verification:'deterministic'|'independent_ai';
  validate(candidate:unknown,duplicates:DuplicateIndex):Promise<ValidationResult>;
}
interface Request {
  context:CurriculumContext;family:string;difficulty?:string;policy:RefillPolicy;mode:'plan'|'dry-run'|'publish';
  verification:'deterministic'|'independent_ai';store:RefillStore;maxBatches?:number;
  createRuntime(budget:RefillBudget):RefillRuntime;
}
export async function refillPool(request:Request) {
  if(request.maxBatches!==undefined&&(!Number.isSafeInteger(request.maxBatches)||request.maxBatches<1))throw new Error('INVALID_RUN_MAX_BATCHES');
  const {context,policy,store}=request,budget:RefillBudget={verifierCalls:0,totalTokens:0};
  const runMaxBatches=Math.min(request.maxBatches??policy.maxBatches,policy.maxBatches);
  const report={mode:request.mode,verification:request.verification,requiresVerifier:request.verification==='independent_ai',
    initialCount:null as number|null,targetCount:policy.targetVerifiedQuestions,initialGap:null as number|null,
    generated:0,requestedCandidates:0,accepted:0,rejected:0,duplicatesSkipped:0,published:0,unprocessed:0,
    finalCount:null as number|null,remainingGap:null as number|null,generatorCalls:0,verifierCalls:0,totalTokens:0 as number|null,
    batches:0,runMaxBatches,plannedFirstBatch:0,status:'FAILED',stopReason:'',rejectReasons:{} as Record<string,number>,
    pool:null as PoolSummary|null,providerError:null as {code:string;details:Readonly<GeminiErrorDetails>}|null};
  let lease:string|null=null;
  const fail=(reason:string)=>{report.status=report.published?'PARTIAL':'FAILED';report.stopReason=reason;};
  const recount=async()=>{
    const summary=await store.summary(context,request.difficulty);
    report.finalCount=summary.count;report.remainingGap=Math.max(0,policy.targetVerifiedQuestions-summary.count);
    // Report distributions, not internal fingerprint lists.
    report.pool={...summary,fingerprints:[]};return summary;
  };
  try {
    if(!isResolvedContext(context)) throw new Error('INVALID_SCOPE');
    const initial=await recount();report.initialCount=initial.count;report.initialGap=report.remainingGap;
    report.plannedFirstBatch=plannedBatch(report.remainingGap!,policy);
    if(!report.remainingGap) {report.status='ALREADY_FULL';return report;}
    if(request.mode==='plan') {report.status='PLANNED';return report;}
    if(request.mode==='publish') {
      lease=await store.acquire(context);
      if(!lease) {report.status='PARTIAL';report.stopReason='REFILL_BUSY';return report;}
      await recount();if(!report.remainingGap) {report.status='ALREADY_FULL';return report;}
    }
    const runtime=request.createRuntime(budget),duplicates=new DuplicateIndex();
    for(const f of initial.fingerprints) duplicates.add(f);
    let stagnant=0;
    while(report.remainingGap!>0) {
      if(report.batches>=policy.maxBatches||report.generatorCalls>=policy.maxProviderCalls||report.requestedCandidates>=policy.maxGeneratedCandidates||
        runtime.verification==='independent_ai'&&budget.verifierCalls>=policy.maxVerifierCalls||budget.totalTokens!==null&&budget.totalTokens>=policy.maxTotalTokens) {
        report.status='PARTIAL';report.stopReason='HARD_LIMIT';break;
      }
      if(report.batches>=runMaxBatches) {report.status='PARTIAL';report.stopReason='RUN_BATCH_LIMIT';break;}
      if(lease&&!await store.renew(context,lease)) {report.status='PARTIAL';report.stopReason='LEASE_LOST';break;}
      const count=plannedBatch(report.remainingGap!,policy,policy.maxGeneratedCandidates-report.requestedCandidates);
      report.batches++;report.generatorCalls++;report.requestedCandidates+=count;
      let candidates:unknown[];
      try {candidates=await runtime.provider.generateQuestions(context,{count});}
      catch(error) {
        // Never serialize arbitrary exceptions or request/response bodies.
        if(error instanceof GeminiProviderError)report.providerError={code:error.code,details:error.details};
        fail('PROVIDER_FAILURE');break;
      }
      if(!Array.isArray(candidates)||candidates.length!==count) {fail('INVALID_BATCH');break;}
      report.generated+=candidates.length;
      const before=report.finalCount!;
      for(const [index,candidate] of candidates.entries()) {
        if(request.mode==='publish'&&!report.remainingGap) {report.unprocessed+=candidates.length-index;break;}
        if(runtime.verification==='independent_ai'&&budget.verifierCalls>=policy.maxVerifierCalls||budget.totalTokens!==null&&budget.totalTokens>=policy.maxTotalTokens) {
          report.unprocessed+=candidates.length-index;report.status='PARTIAL';report.stopReason='HARD_LIMIT';break;
        }
        if(lease&&!await store.renew(context,lease)) {report.unprocessed+=candidates.length-index;report.status='PARTIAL';report.stopReason='LEASE_LOST';break;}
        const common=validateCommon(context,candidate);
        if(common.valid&&duplicates.has(fingerprint(common.candidate))) {report.duplicatesSkipped++;continue;}
        if(common.valid&&request.difficulty&&common.candidate.difficulty!==request.difficulty) {
          report.rejected++;report.rejectReasons.DIFFICULTY_SCOPE_MISMATCH=(report.rejectReasons.DIFFICULTY_SCOPE_MISMATCH||0)+1;continue;
        }
        const result=await runtime.validate(candidate,duplicates);
        if(result.decision==='REJECT') {
          const codes=result.issues.map(i=>i.code);
          if(codes.includes('DUPLICATE')) report.duplicatesSkipped++;else report.rejected++;
          for(const code of codes) report.rejectReasons[code]=(report.rejectReasons[code]||0)+1;
          if(codes.some(c=>['VERIFICATION_FAILURE','MALFORMED_VERIFICATION','UNKNOWN_CAPABILITY','VALIDATOR_ERROR'].includes(c))) {report.unprocessed+=candidates.length-index-1;fail('VERIFICATION_FAILURE');break;}
          continue;
        }
        report.accepted++;
        if(request.mode==='publish') {
          let outcome;
          try {outcome=await store.publish(result);}catch {report.unprocessed+=candidates.length-index-1;fail('PUBLICATION_FAILURE');break;}
          if(outcome.newlyPublished) report.published++;
          if(outcome.duplicate) report.duplicatesSkipped++;
          await recount();
        }
      }
      await recount();
      if(report.stopReason) break;
      if(request.mode==='dry-run') {report.status='DRY_RUN';break;}
      if(!report.remainingGap) {report.status='FILLED';break;}
      stagnant=report.finalCount===before?stagnant+1:0;
      if(stagnant>=policy.maxNoProgressBatches) {report.status='PARTIAL';report.stopReason='NO_PROGRESS';break;}
    }
  } catch {fail('REFILL_FAILURE');try {if(isResolvedContext(context))await recount();}catch {/* Keep last observed count. */}}
  finally {
    report.verifierCalls=budget.verifierCalls;report.totalTokens=budget.totalTokens;
    if(lease) {try {await store.release(context,lease);}catch {fail('LEASE_RELEASE_FAILURE');}}
  }
  return report;
}
