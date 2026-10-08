import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Firestore} from 'firebase-admin/firestore';
import {discoverScopes,filterScopes,createOrchestrationPlan} from '../functions/lib/question-engine/orchestrator.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';

const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url)));
const items=discoverScopes([{canonical:read('../data/mufredat/2-sinif.json'),navigation:read('../data/mufredat/2-sinif-ui-v2.json')}]);
const config=read('../data/question-engine/orchestration-policy.json'),policy=read('../data/question-engine/refill-policy.json');
requirePublicationEmulator();
test('real emulator plan reuses 3B counts and leaves every top-level collection unchanged',async()=>{
  const db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false}),store=new EmulatorRefillStore();
  const snapshot=async()=>{
    const collections=await db.listCollections(),result={};
    for(const collection of collections.sort((a,b)=>a.id.localeCompare(b.id))) {
      const docs=await collection.get();result[collection.id]=docs.docs.map(d=>({id:d.id,data:d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
    }
    return result;
  };
  try {
    const before=await snapshot();
    // A read-only adapter exposes no lease/publication API to the planner.
    const plan=await createOrchestrationPlan(items,config,policy,{summary:c=>store.summary(c)});
    assert.equal(plan.status,'PLANNED');assert.equal(plan.summary.supportedScopes,2);assert.equal(plan.summary.inventoryErrors,0);
    assert.equal(plan.generatorCalls,0);assert.equal(plan.verifierCalls,0);assert.equal(plan.publications,0);
    for(const row of [...plan.needsRefill,...plan.full]) {
      const item=items.find(i=>i.scope.outcomeCode===row.scope.outcomeCode);
      assert.equal(row.current,(await store.summary(item.context)).count);
    }
    assert.deepEqual(await snapshot(),before);
  }finally {await store.close();await db.terminate();}
});
test('real emulator combined filter reads only selected supported subject without publication',async()=>{
  const store=new EmulatorRefillStore();
  try {
    const plan=await createOrchestrationPlan(filterScopes(items,{grade:2,subject:'hayat-bilgisi',topic:'g2-hayat-bilgisi-zaman-yonetimi'}),config,policy,{summary:c=>store.summary(c)});
    assert.equal(plan.summary.discoveredScopes,1);assert.equal(plan.summary.supportedScopes,1);assert.equal(plan.status,'PLANNED');
    assert.equal(plan.publications,0);assert.equal(plan.verifierCalls,0);assert.equal(plan.generatorCalls,0);
  }finally {await store.close();}
});
