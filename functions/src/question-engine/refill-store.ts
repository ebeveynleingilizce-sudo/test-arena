import {Firestore,Timestamp} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import type {CurriculumContext,ValidationResult} from './contracts.js';
import {stableJSON} from './fingerprint.js';
import {poolScopeIds} from './pool-navigation.js';
import {parsePresentation} from '../../visuals/contract.mjs';
import {EmulatorQuestionPublisher,requirePublicationEmulator} from './publication.js';
import type {PoolSummary,RefillStore} from './refill.js';

const leaseKey=(c:CurriculumContext)=>createHash('sha256').update(stableJSON(c)).digest('hex');
// A renewable 15-minute scope mutex, not a job/queue or background worker.
const leaseMs=15*60*1000;
export class EmulatorRefillStore implements RefillStore {
  private readonly db:Firestore;private readonly publisher:EmulatorQuestionPublisher;
  constructor() {
    requirePublicationEmulator();this.db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false});
    this.publisher=new EmulatorQuestionPublisher();
  }
  async close(){await this.publisher.close();await this.db.terminate();}
  async summary(context:CurriculumContext,difficulty?:string):Promise<PoolSummary> {
    requirePublicationEmulator();
    const tree=(await this.db.doc('curricula/'+context.grade).get()).data();
    const subject=tree?.subjects.find((s:{id:string})=>s.id===context.subjectId);
    const unitId=context.themeId||context.unitId!,unit=subject?.units.find((u:{id:string})=>u.id===unitId);
    const topicId=context.topicId||context.subthemeId;
    const scope=context.navigationModel==='theme-test'?unit:unit?.topics.find((t:{id:string})=>t.id===topicId);
    if(!scope||tree!.sourceDatasetId!==context.datasetId||subject.navigationModel!==context.navigationModel) throw new Error('UNKNOWN_POOL_SCOPE');
    const pool=await this.db.collection('questions').where('gradeLevel','==',context.grade).where('subject','==',context.subjectId)
      .where('status','==','published').where('isDemo','==',false).get();
    const ids=new Set(poolScopeIds(scope.questionIds,pool.docs.map(d=>d.data()),{grade:context.grade,subjectId:context.subjectId,
      unitId,...(context.navigationModel==='theme-test'?{}:{topicId})}));
    const records=pool.docs.filter(d=>ids.has(d.id)&&d.data().unitId===unitId&&
      (context.navigationModel==='theme-test'||d.data().topic===topicId)&&(!difficulty||d.data().difficulty===difficulty));
    const keys=records.length?await this.db.getAll(...records.map(d=>this.db.doc('privateQuestionAnswers/'+d.id))):[];
    const result:PoolSummary={count:0,curated:0,aiVerified:0,byDifficulty:{},byFamily:{},fingerprints:[]};
    for(const [index,doc] of records.entries()) {
      const q=doc.data(),key=keys[index].data();
      // Count only usable exact-outcome items. No invented outcome mapping for
      // theme-level-only curated content, even if it is visible in the topic UI.
      if(q.questionId!==doc.id||q.sourceDatasetId!==context.datasetId||
        q.source==='ai_verified'&&q.provenance?.curriculumVersion!==context.curriculumVersion||
        !key||key.outcomeMappingStatus!=='exact'||key.outcomeCode!==context.outcomeCode) continue;
      let presentation;
      try {presentation=parsePresentation(q.questionText,q.choices,q.visual,q.visualPlacement);}catch {continue;}
      if(!presentation.choices.some(o=>o.choiceId===key.correctOptionId)||
        new Set(presentation.choices.map(o=>o.choiceId)).size!==presentation.choices.length) continue;
      result.count++;if(q.source==='ai_verified')result.aiVerified++;else result.curated++;
      const family=q.provenance?.questionFamily??'curated-unclassified',level=q.difficulty??'unclassified';
      result.byFamily[family]=(result.byFamily[family]||0)+1;result.byDifficulty[level]=(result.byDifficulty[level]||0)+1;
      const f=q.provenance?.fingerprint;
      if(f&&/^[a-f0-9]{64}$/.test(f.content)&&/^[a-f0-9]{64}$/.test(f.structural))result.fingerprints.push(f);
    }
    return result;
  }
  async acquire(context:CurriculumContext):Promise<string|null> {
    requirePublicationEmulator();const owner=randomUUID(),ref=this.db.doc('refillLeases/'+leaseKey(context));
    return this.db.runTransaction(async tx=>{
      const old=await tx.get(ref),now=Date.now();
      if(old.exists&&old.data()!.expiresAt.toMillis()>now)return null;
      tx.set(ref,{owner,expiresAt:Timestamp.fromMillis(now+leaseMs)});return owner;
    });
  }
  async renew(context:CurriculumContext,owner:string):Promise<boolean> {
    requirePublicationEmulator();const ref=this.db.doc('refillLeases/'+leaseKey(context));
    return this.db.runTransaction(async tx=>{
      const old=await tx.get(ref),now=Date.now();
      if(!old.exists||old.data()!.owner!==owner||old.data()!.expiresAt.toMillis()<=now)return false;
      tx.update(ref,{expiresAt:Timestamp.fromMillis(now+leaseMs)});return true;
    });
  }
  async release(context:CurriculumContext,owner:string) {
    requirePublicationEmulator();const ref=this.db.doc('refillLeases/'+leaseKey(context));
    await this.db.runTransaction(async tx=>{const old=await tx.get(ref);if(old.exists&&old.data()!.owner===owner)tx.delete(ref);});
  }
  publish(result:ValidationResult){return this.publisher.publish(result);}
}
