import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {discoverScopes,filterScopes,createOrchestrationPlan} from '../functions/lib/question-engine/orchestrator.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
import {parseOrchestrationArgs} from './question-engine-orchestrate-args.mjs';

let store;
try {
  const filter=parseOrchestrationArgs(process.argv.slice(2)),directory=new URL('../data/mufredat/',import.meta.url);
  const read=url=>JSON.parse(readFileSync(url));
  const files=readdirSync(directory).filter(name=>/^(?:[2-9]|1[0-2])-sinif\.json$/.test(name)).sort();
  const datasets=files.map(name=>{
    const canonical=read(new URL(name,directory)),navPath=new URL(canonical.grade+'-sinif-ui-v2.json',directory);
    return {canonical,navigation:existsSync(navPath)?read(navPath):undefined};
  });
  const scopes=filterScopes(discoverScopes(datasets),filter);
  process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';requirePublicationEmulator();
  store=new EmulatorRefillStore();
  const plan=await createOrchestrationPlan(scopes,read(new URL('../data/question-engine/orchestration-policy.json',import.meta.url)),
    read(new URL('../data/question-engine/refill-policy.json',import.meta.url)),{summary:context=>store.summary(context)});
  const limit=100,output={...plan,filter,needsRefill:plan.needsRefill.slice(0,limit),full:plan.full.slice(0,limit),unsupported:plan.unsupported.slice(0,limit),
    omittedDetails:{needsRefill:Math.max(0,plan.needsRefill.length-limit),full:Math.max(0,plan.full.length-limit),unsupported:Math.max(0,plan.unsupported.length-limit)}};
  console.log(JSON.stringify(output,null,2));if(plan.status==='INCOMPLETE')process.exitCode=1;
}catch {console.error('Plan oluşturulamadı. Yalnız yerel demo emulator ve geçerli kanonik/config verisi desteklenir. Hassas hata/payload yazdırılmadı.');process.exitCode=1;}
finally {if(store)await store.close();}
