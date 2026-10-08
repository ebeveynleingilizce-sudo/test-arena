import {readdirSync,readFileSync,existsSync} from 'node:fs';
import {curriculumExpansionPlan} from '../functions/lib/question-engine/curriculum-mapping.js';
import {filterScopes} from '../functions/lib/question-engine/orchestrator.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
import {parseOrchestrationArgs} from './question-engine-orchestrate-args.mjs';

let store;
try {
  const read=url=>JSON.parse(readFileSync(url)),filter=parseOrchestrationArgs(process.argv.slice(2)),directory=new URL('../data/mufredat/',import.meta.url);
  const datasets=readdirSync(directory).filter(name=>/^(?:[2-9]|1[0-2])-sinif\.json$/.test(name)).sort().map(name=>{
    const canonical=read(new URL(name,directory)),nav=new URL(canonical.grade+'-sinif-ui-v2.json',directory);
    return {canonical,navigation:existsSync(nav)?read(nav):undefined};
  });
  process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';requirePublicationEmulator();store=new EmulatorRefillStore();
  const result=await curriculumExpansionPlan(datasets,read(new URL('../data/question-engine/orchestration-policy.json',import.meta.url)),
    read(new URL('../data/question-engine/curriculum-expansion-policy.json',import.meta.url)),read(new URL('../data/question-engine/refill-policy.json',import.meta.url)),
    {summary:c=>store.summary(c)},items=>filterScopes(items,filter));
  const trim=plan=>({...plan,unsupported:plan.unsupported.slice(0,100),unsupportedDetailsOmitted:Math.max(0,plan.unsupported.length-100)});
  console.log(JSON.stringify({before:trim(result.before),after:trim(result.after),bySubject:result.bySubject},null,2));
  if(result.before.status==='INCOMPLETE'||result.after.status==='INCOMPLETE')process.exitCode=1;
}catch {console.error('Read-only curriculum mapping planı tamamlanamadı; hassas hata/payload yazdırılmadı.');process.exitCode=1;}
finally {if(store)await store.close();}
