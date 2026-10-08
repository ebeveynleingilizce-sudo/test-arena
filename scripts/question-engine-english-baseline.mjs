import {stopAIGeneration} from './ai-generation-disabled.mjs';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {englishPedagogyGolden} from '../tests/fixtures/english-pedagogy-golden.mjs';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {profileContexts,schoolVocabularyValidator} from '../functions/lib/question-engine/school-life.js';
import {VerificationRouter,VerifierRegistry} from '../functions/lib/question-engine/verification.js';
import {ValidatorRegistry} from '../functions/lib/question-engine/registry.js';
import {validateCandidateWithRouter} from '../functions/lib/question-engine/pipeline.js';
import {GeminiVerifier} from '../functions/lib/question-engine/providers/gemini-verifier.js';
import {requiredPedagogyChecks} from '../functions/lib/question-engine/english-pedagogy.js';
import {schoolVisualAlt} from '../functions/visuals/school-life.mjs';

// Baseline only: no generator, Firebase, refill or publisher dependencies.
// Never transmit human labels, intended answer or explanation to the verifier.
export async function runEnglishBaseline({plan=false,verifier}={}) {
 const profile=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
 const contexts=profileContexts(JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif.json',import.meta.url))),
  JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif-ui-v2.json',import.meta.url))),profile);
 if(!plan&&!verifier)throw new Error('VERIFIER_REQUIRED');
 const results=[];let verifierCalls=0,aborted=false;
 for(const row of englishPedagogyGolden){
  const dialogue=row.family==='SCHOOL_LIFE_DIALOGUE',context=contexts[dialogue?0:1];
  const candidate={candidateId:'golden-'+row.id,scope:context,type:'multiple-choice',difficulty:'easy',family:row.family,model:{},question:row.stem,
   options:row.options.map((text,i)=>({id:['a','b','c'][i],text})),correctOptionId:row.answer,
   explanation:dialogue?'A reply to the utterance.':'It is a '+row.asset+'.',
   ...(row.asset?{visual:{kind:dialogue?'school-dialogue':row.family==='SCHOOL_LIFE_PLACE'?'school-place':'school-person',asset:row.asset,
    alt:row.mutation==='answer-alt'?'a classroom':schoolVisualAlt[row.asset],...(dialogue?{speech:row.stem}:{})},visualPlacement:'above'}:{})};
  if(aborted){results.push({id:row.id,expected:row.expected,result:'NOT_RUN',match:null,reason:'STOPPED_AFTER_PROVIDER_ERROR',evidence:null});continue;}
  let reached=false,evidence=null,remoteError=null,metrics=null;
  const observed={id:'baseline-observed-independent',async verify(input){
   reached=true;if(plan)return {};
   if(verifierCalls>=17)throw new Error('BASELINE_CALL_LIMIT');
   verifierCalls++;
   try {
    const raw=await verifier.verify(input);
    // Output closed evidence fields only: no prompt, body or free-form remote text.
    evidence=Object.fromEntries(requiredPedagogyChecks(input.pedagogy.policy).map(k=>[k,raw[k]]));
    Object.assign(evidence,Object.fromEntries(['selectedOptionId','hasSingleCorrectAnswer','curriculumAligned','gradeAppropriate','factuallySound','questionClear','visualConsistent','confidence'].map(k=>[k,raw[k]])));
    return raw;
   }catch(error){remoteError=/^[A-Z_]{1,60}$/.test(error?.code??'')?error.code:'VERIFIER_ERROR';throw error;}
   finally {const m=verifier.lastRun;if(m)metrics={latencyMs:m.latencyMs,inputTokens:m.inputTokens,outputTokens:m.outputTokens,totalTokens:m.totalTokens};}
  }};
  const deterministic=new ValidatorRegistry().register(schoolVocabularyValidator(contexts));
  const independent=new VerifierRegistry().register({capability:'knowledge-grounded@1',verifier:observed,contexts:[contexts[0]],families:[profile.family],gradePolicy:profile.gradePolicy,visualKinds:['school-dialogue']})
   .register({capability:'school-vocabulary@1',verifier:observed,contexts:[contexts[1]],families:['SCHOOL_LIFE_PLACE','SCHOOL_LIFE_PERSON'],gradePolicy:profile.gradePolicy,visualKinds:['school-place','school-person']});
  const outcome=await validateCandidateWithRouter(context,candidate,dialogue?'knowledge-grounded@1':'school-vocabulary@1',new VerificationRouter(deterministic,independent));
  const result=remoteError?'ERROR':plan&&reached?'NOT_RUN':outcome.decision==='ACCEPT'?'PASS':'FAIL';
  results.push({id:row.id,expected:row.expected,result,match:['PASS','FAIL'].includes(result)?result===row.expected:null,
   stage:reached?'independent_verifier':'deterministic',reason:remoteError??(plan&&reached?'VERIFIER_REQUIRED':outcome.issues?.[0]?.code??'ALL_REQUIRED_CHECKS_PASSED'),
   evidence,failedEvidence:evidence?Object.entries(evidence).filter(([,v])=>v===false).map(([k])=>k):[],metrics});
  // No retry or automatic prompt tuning. Stop on provider/contract errors to
  // avoid paying for the same failure on the remaining examples.
  if(remoteError)aborted=true;
 }
 const assessed=results.filter(r=>r.match!==null),semantic=assessed.filter(r=>r.stage==='independent_verifier');
 return {mode:plan?'local-plan':'real-verifier-baseline',model:plan?null:verifier.model??verifier.id,totalExamples:20,
  evaluated:assessed.length,verifierCalls,deterministicEvaluated:assessed.filter(r=>r.stage==='deterministic').length,
  exactMatches:assessed.filter(r=>r.match).length,mismatches:assessed.filter(r=>!r.match).length,
  semanticExactMatches:semantic.filter(r=>r.match).length,semanticMismatches:semantic.filter(r=>!r.match).length,
  falseAccept:assessed.filter(r=>r.expected==='FAIL'&&r.result==='PASS').length,
  falseReject:assessed.filter(r=>r.expected==='PASS'&&r.result==='FAIL').length,
  reviewOutcomes:results.filter(r=>r.expected==='REVIEW').map(({id,result,reason})=>({id,result,reason})),
  reviewNote:'Production has no REVIEW verdict. Expected REVIEW versus PASS/FAIL remains a label mismatch; REVIEW is excluded from binary false accept/reject counts. Missing/uncertain/failed required evidence prevents an ACCEPT receipt.',
  aborted,results};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 stopAIGeneration();
 const args=process.argv.slice(2),plan=args.length===1&&args[0]==='--plan';
 if(args.length&&!plan){console.error('INVALID_ARGUMENT: only --plan is supported.');process.exitCode=1;}
 else if(!plan&&!process.env.GEMINI_API_KEY?.trim()){
  console.error('MISSING_API_KEY: Run in a PowerShell session with GEMINI_API_KEY defined. No API call was made.');process.exitCode=1;
 }else {
  try {const report=await runEnglishBaseline({plan,...(!plan?{verifier:new GeminiVerifier()}: {})});
   console.log(JSON.stringify(report,null,2));if(report.aborted)process.exitCode=1;
  }catch {console.error('BASELINE_SETUP_ERROR: no request or secret details are printed.');process.exitCode=1;}
 }
}
