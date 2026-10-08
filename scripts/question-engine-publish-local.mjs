import {stopAIGeneration} from './ai-generation-disabled.mjs';
import {readFileSync} from 'node:fs';
import {getApps,deleteApp} from 'firebase-admin/app';
import {resolveCurriculumContext} from '../functions/lib/question-engine/curriculum.js';
import {dryRun} from '../functions/lib/question-engine/pipeline.js';
import {ValidatorRegistry} from '../functions/lib/question-engine/registry.js';
import {VerifierRegistry,VerificationRouter} from '../functions/lib/question-engine/verification.js';
import {BaseTenFixtureProvider,baseTenValidator} from '../functions/lib/question-engine/fixtures/base-ten.js';
import {GeminiProvider} from '../functions/lib/question-engine/providers/gemini.js';
import {GeminiVerifier} from '../functions/lib/question-engine/providers/gemini-verifier.js';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {EmulatorQuestionPublisher,requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
import {seedCurriculum} from './seed-curriculum.mjs';

// Default: fixture preview only. Real Gemini and local writes each require an
// explicit flag; no live Firestore configuration or deploy path exists here.
let publisher;
async function main() {
  stopAIGeneration();
  const [id,...flags]=process.argv.slice(2),profile=geminiDryRunProfiles.find(p=>p.id===id);
  if(!profile||new Set(flags).size!==flags.length||flags.some(f=>!['--publish','--gemini'].includes(f))) throw new Error('INVALID_LOCAL_COMMAND');
  process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';requirePublicationEmulator();
  const real=flags.includes('--gemini'),publish=flags.includes('--publish');
  if(!real&&profile.capability!=='base-ten-to-number@1') throw new Error('THIS_PROFILE_REQUIRES_EXPLICIT_GEMINI');
  const canonical=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif.json',import.meta.url)));
  const nav=JSON.parse(readFileSync(new URL('../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
  const context=resolveCurriculumContext(canonical,nav,profile.scope),deterministic=new ValidatorRegistry(),independent=new VerifierRegistry();
  if(profile.capability==='base-ten-to-number@1') deterministic.register(baseTenValidator([context]));
  if(profile.capability==='knowledge-grounded@1') independent.register({capability:profile.capability,verifier:new GeminiVerifier(),
    contexts:[context],families:[profile.family],gradePolicy:profile.gradePolicy,visualKinds:[]});
  const provider=real?new GeminiProvider(profile):new BaseTenFixtureProvider([{tens:3,ones:7},{tens:4,ones:2},{tens:5,ones:1},{tens:6,ones:3},{tens:7,ones:8}]);
  const results=await dryRun(context,provider,{count:5},profile.capability,deterministic,undefined,new VerificationRouter(deterministic,independent));
  const accepted=results.filter(r=>r.decision==='ACCEPT'),rejected=results.filter(r=>r.decision==='REJECT');
  const rejectReasons={};for(const r of rejected) for(const issue of r.issues) rejectReasons[issue.code]=(rejectReasons[issue.code]||0)+1;
  const report={profile:id,mode:publish?'publish-local':'preview',provider:real?'gemini':'local-fixture',
    generated:real?(provider.lastRun?.generatedCount??0):results.length,accepted:accepted.length,rejected:rejected.length,
    newlyPublished:0,duplicatesSkipped:0,rejectReasons};
  // Validation finishes before any pool writes; only opaque engine receipts are
  // passed to the publisher, never a JSON file's verified/ACCEPT claim.
  if(publish&&accepted.length) {
    await seedCurriculum();publisher=new EmulatorQuestionPublisher();
    for(const result of accepted) {
      try {
        const publication=await publisher.publish(result);
        if(publication.newlyPublished) report.newlyPublished++;
        if(publication.duplicate) report.duplicatesSkipped++;
      } catch {
        // Preserve completed counts on a partial batch; no raw provider/DB errors.
        report.publicationError='PUBLICATION_FAILURE';process.exitCode=1;break;
      }
    }
  }
  console.log(JSON.stringify(report));
  if(rejected.some(r=>r.issues.some(i=>i.stage==='provider'||i.code==='VERIFICATION_FAILURE'))) process.exitCode=1;
}
try {await main();}
catch {console.log('Yerel publication tamamlanamadı; production erişimi yok. Payload veya hassas hata ayrıntıları yazdırılmadı.');process.exitCode=1;}
finally {if(publisher) await publisher.close();await Promise.all(getApps().map(deleteApp));}
