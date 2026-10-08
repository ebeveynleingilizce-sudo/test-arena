import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Firestore} from 'firebase-admin/firestore';
import {curriculumExpansionPlan} from '../functions/lib/question-engine/curriculum-mapping.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
requirePublicationEmulator();
test('real BEFORE/AFTER inventory has no AI, lease, publication or emulator document mutations',async()=>{
  const store=new EmulatorRefillStore(),db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false});
  const snapshot=async()=>{
    const result={};for(const c of (await db.listCollections()).sort((a,b)=>a.id.localeCompare(b.id))) {
      result[c.id]=(await c.get()).docs.map(d=>({id:d.id,data:d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
    }return result;
  };
  try {
    const before=await snapshot(),result=await curriculumExpansionPlan(
      [{canonical:read('../data/mufredat/2-sinif.json'),navigation:read('../data/mufredat/2-sinif-ui-v2.json')}],
      read('../data/question-engine/orchestration-policy.json'),read('../data/question-engine/curriculum-expansion-policy.json'),read('../data/question-engine/refill-policy.json'),
      {summary:c=>store.summary(c)});
    assert.equal(result.before.summary.supportedScopes,2);assert.equal(result.after.summary.supportedScopes,8);
    assert.equal(result.before.status,'PLANNED');assert.equal(result.after.status,'PLANNED');assert.equal(result.after.summary.inventoryErrors,0);
    assert.equal(result.after.generatorCalls,0);assert.equal(result.after.verifierCalls,0);assert.equal(result.after.publications,0);
    assert.deepEqual(await snapshot(),before);
    console.log(JSON.stringify({before:result.before.summary,after:result.after.summary,bySubject:result.bySubject,reasons:result.after.unsupportedReasons}));
  }finally {await store.close();await db.terminate();}
});
