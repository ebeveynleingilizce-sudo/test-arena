import {stopAIGeneration} from './ai-generation-disabled.mjs';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../functions/lib/question-engine/curriculum.js';
import {ValidatorRegistry} from '../functions/lib/question-engine/registry.js';
import {dryRun} from '../functions/lib/question-engine/pipeline.js';
import {baseTenValidator} from '../functions/lib/question-engine/fixtures/base-ten.js';
import {GeminiProvider} from '../functions/lib/question-engine/providers/gemini.js';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {GeminiVerifier} from '../functions/lib/question-engine/providers/gemini-verifier.js';
import {VerifierRegistry,VerificationRouter} from '../functions/lib/question-engine/verification.js';
import {profileContexts} from '../functions/lib/question-engine/school-life.js';
import {geminiRefillRuntime} from '../functions/lib/question-engine/refill-runtime.js';
import {resolveRefillPolicy} from '../functions/lib/question-engine/refill-policy.js';
import {DuplicateIndex} from '../functions/lib/question-engine/fingerprint.js';

// No Firebase dependency or publication. Run explicitly; never invoked by quiz.
async function main(){
  stopAIGeneration();
  if(!process.env.GEMINI_API_KEY?.trim()){
    console.log('Gerçek Gemini dry-run bekliyor: GEMINI_API_KEY server ortamında tanımlı değil. API çağrısı yapılmadı.');process.exitCode=1;return;
  }
  const arg=process.argv[2];
  if(arg&&!geminiDryRunProfiles.some(p=>p.id===arg))throw new Error('INVALID_PROFILE');
  const canonical=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif.json',import.meta.url)));
  const nav=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
  for(const profile of geminiDryRunProfiles.filter(p=>!arg||p.id===arg)){
    const context=resolveCurriculumContext(canonical,nav,profile.scope),registry=new ValidatorRegistry();
    if(profile.variants?.length){
      const contexts=profileContexts(canonical,nav,profile),budget={verifierCalls:0,totalTokens:0};
      const policy=resolveRefillPolicy(JSON.parse(readFileSync(new URL('../data/question-engine/refill-policy.json',import.meta.url))),context,profile.family);
      const runtime=geminiRefillRuntime(context,profile,policy,budget,undefined,contexts),duplicates=new DuplicateIndex(),results=[];
      for(const candidate of await runtime.provider.generateQuestions(context,{count:5}))results.push(await runtime.validate(candidate,duplicates));
      const rejectReasons={};for(const r of results)if(r.decision==='REJECT')for(const issue of r.issues)rejectReasons[issue.code]=(rejectReasons[issue.code]||0)+1;
      console.log(JSON.stringify({profile:profile.id,generatedCount:results.length,acceptedCount:results.filter(r=>r.decision==='ACCEPT').length,
        rejectedCount:results.filter(r=>r.decision==='REJECT').length,rejectReasons,verifierCalls:budget.verifierCalls,totalTokens:budget.totalTokens,
        failedRun:results.some(r=>r.decision==='REJECT'&&r.issues.some(i=>i.code==='VERIFICATION_FAILURE'))}));
      continue;
    }
    if(profile.capability==='base-ten-to-number@1')registry.register(baseTenValidator([context]));
    const verifiers=new VerifierRegistry(),verifierRuns=[];
    let verifier;
    if(profile.capability==='knowledge-grounded@1') {
      verifier=new GeminiVerifier();
      const observed={id:verifier.id,async verify(input) {
        try {return await verifier.verify(input);}
        finally {if(verifier.lastRun) verifierRuns.push(verifier.lastRun);}
      }};
      verifiers.register({capability:profile.capability,verifier:observed,contexts:[context],families:[profile.family],
        gradePolicy:profile.gradePolicy,visualKinds:[]});
    }
    const provider=new GeminiProvider(profile);
    const results=await dryRun(context,provider,{count:5},profile.capability,registry,undefined,new VerificationRouter(registry,verifiers));
    const rejectReasons={};for(const r of results)if(r.decision==='REJECT')for(const issue of r.issues)rejectReasons[issue.code]=(rejectReasons[issue.code]||0)+1;
    const m=provider.lastRun;
    const sum=field=>verifierRuns.some(r=>r[field]===null)?null:verifierRuns.reduce((total,r)=>total+r[field],0);
    const verifierMetrics={calls:verifierRuns.length,model:verifier?.model??null,latencyMs:sum('latencyMs'),
      inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),thinkingTokens:sum('thinkingTokens'),totalTokens:sum('totalTokens'),
      errorCodes:verifierRuns.filter(r=>r.errorCode).map(r=>r.errorCode)};
    console.log(JSON.stringify({profile:profile.id,model:provider.model,generatedCount:m?.generatedCount??0,
      acceptedCount:results.filter(r=>r.decision==='ACCEPT').length,rejectedCount:results.filter(r=>r.decision==='REJECT'&&!r.issues.some(i=>i.stage==='provider')).length,
      failedRun:verifierMetrics.errorCodes.length>0||results.some(r=>r.decision==='REJECT'&&r.issues.some(i=>i.stage==='provider')),rejectReasons,
      providerLatencyMs:m?.latencyMs??null,inputTokens:m?.inputTokens??null,outputTokens:m?.outputTokens??null,
      thinkingTokens:m?.thinkingTokens??null,totalTokens:m?.totalTokens??null,providerError:m?.errorCode??null,
      generatorMetrics:m??null,verifierMetrics,
      combinedTotalTokens:m?.totalTokens===null||m?.totalTokens===undefined||verifierMetrics.totalTokens===null?null:m.totalTokens+verifierMetrics.totalTokens}));
    if(m?.errorCode||verifierMetrics.errorCodes.length)process.exitCode=1;
  }
}
main().catch(()=>{console.log('Dry-run yapılandırması/bağlamı doğrulanamadı. Hassas hata ayrıntıları yazdırılmadı.');process.exitCode=1;});
