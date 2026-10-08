import {stopAIGeneration} from './ai-generation-disabled.mjs';
import {readFileSync} from 'node:fs';
import {resolveCurriculumContext} from '../functions/lib/question-engine/curriculum.js';
import {resolveRefillPolicy} from '../functions/lib/question-engine/refill-policy.js';
import {refillPool} from '../functions/lib/question-engine/refill.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {refillCapabilities,geminiRefillRuntime} from '../functions/lib/question-engine/refill-runtime.js';
import {geminiDryRunProfiles} from '../functions/lib/question-engine/providers/gemini-profiles.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
import {parseRefillArgs} from './question-engine-refill-args.mjs';
import {profileContexts} from '../functions/lib/question-engine/school-life.js';

stopAIGeneration();
let store;
try {
  const {id,mode,maxBatches}=parseRefillArgs(process.argv.slice(2)),profile=geminiDryRunProfiles.find(p=>p.id===id);
  if(!profile)throw new Error('INVALID_REFILL_FLAGS');
  process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';requirePublicationEmulator();
  const canonical=JSON.parse(readFileSync(new URL('../data/mufredat/'+profile.scope.grade+'-sinif.json',import.meta.url)));
  const navigation=JSON.parse(readFileSync(new URL('../data/mufredat/'+profile.scope.grade+'-sinif-ui-v2.json',import.meta.url)));
  const context=resolveCurriculumContext(canonical,navigation,profile.scope);
  const contexts=profileContexts(canonical,navigation,profile);
  const config=JSON.parse(readFileSync(new URL('../data/question-engine/refill-policy.json',import.meta.url)));
  const policy=resolveRefillPolicy(config,context,profile.family),verification=refillCapabilities[profile.capability];
  if(!verification)throw new Error('UNKNOWN_REFILL_CAPABILITY');
  store=new EmulatorRefillStore();
  // The mixed School Life profile uses the existing store/publication and one
  // lease; only its inventory spans the two explicit canonical subthemes.
  const scopes=[...new Map(contexts.map(c=>[JSON.stringify(c),c])).values()];
  const runtimeStore=profile.variants?.length?{
    acquire:c=>store.acquire(c),renew:(c,l)=>store.renew(c,l),release:(c,l)=>store.release(c,l),publish:r=>store.publish(r),
    async summary(){const pools=await Promise.all(scopes.map(c=>store.summary(c)));const merged={count:0,curated:0,aiVerified:0,byDifficulty:{},byFamily:{},fingerprints:[]};
      for(const p of pools){for(const k of ['count','curated','aiVerified'])merged[k]+=p[k];merged.fingerprints.push(...p.fingerprints);
        for(const k of ['byDifficulty','byFamily'])for(const [key,n]of Object.entries(p[k]))merged[k][key]=(merged[k][key]||0)+n;}return merged;}
  }:store;
  const report=await refillPool({context,family:profile.family,policy,mode,maxBatches,verification,store:runtimeStore,
    createRuntime:budget=>geminiRefillRuntime(context,profile,policy,budget,undefined,contexts)});
  console.log(JSON.stringify({profile:id,...report}));
  if(report.status==='FAILED')process.exitCode=1;
}catch {console.log('Refill planı/işlemi tamamlanamadı. Yalnız yerel demo emulator desteklenir; hassas hata veya payload yazdırılmadı.');process.exitCode=1;}
finally {if(store)await store.close();}
