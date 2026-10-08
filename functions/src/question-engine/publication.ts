import { Firestore, Timestamp } from 'firebase-admin/firestore';
import type { ValidationResult } from './contracts.js';
import { acceptedSnapshot } from './accepted.js';
import { fingerprint } from './fingerprint.js';
import { parsePresentation } from '../../visuals/contract.mjs';

export function requirePublicationEmulator() {
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||
    [process.env.GCLOUD_PROJECT,process.env.GOOGLE_CLOUD_PROJECT].some(p=>p!==undefined&&p!=='demo-test-arena'))
    throw new Error('LOCAL_DEMO_EMULATOR_REQUIRED');
}
export class EmulatorQuestionPublisher {
  private readonly db:Firestore;
  constructor() {
    requirePublicationEmulator();
    // Explicit local endpoint/project: no credentials or live-project fallback,
    // even when a caller previously initialized a different Admin app.
    this.db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false});
  }
  close(){return this.db.terminate();}
  async publish(result:ValidationResult):Promise<{questionId:string;newlyPublished:boolean;duplicate:boolean}> {
    requirePublicationEmulator();
    const snapshot=acceptedSnapshot(result);
    if(!snapshot) throw new Error('ENGINE_ACCEPT_RECEIPT_REQUIRED');
    if(snapshot.context.subjectId==='ingilizce'&&snapshot.pedagogyVersion!=='english-pedagogy@1')throw new Error('PEDAGOGY_ACCEPT_RECEIPT_REQUIRED');
    const {candidate:c,context,capability,verificationMethod,providerFamily}=snapshot;
    // Sort after the current g2-* curated IDs so full existing packs stay stable.
    const f=fingerprint(c),id='qe_ai_'+f.content;
    const question=this.db.doc('questions/'+id),answer=this.db.doc('privateQuestionAnswers/'+id);
    const indexes=[this.db.doc('questionFingerprints/content_'+f.content),this.db.doc('questionFingerprints/structural_'+f.structural)];
    const curriculum=this.db.doc('curricula/'+context.grade);
    return this.db.runTransaction(async tx=>{
      const [q,a,content,structural,treeDoc]=await tx.getAll(question,answer,...indexes,curriculum);
      const existing=[content,structural].filter(d=>d.exists);
      if(existing.length) {
        const ids=new Set(existing.map(d=>d.data()!.questionId));
        if(ids.size!==1||typeof existing[0].data()!.questionId!=='string') throw new Error('POOL_INDEX_CONFLICT');
        const existingId=existing[0].data()!.questionId;
        const [oldQ,oldA]=await tx.getAll(this.db.doc('questions/'+existingId),this.db.doc('privateQuestionAnswers/'+existingId));
        if(!oldQ.exists||!oldA.exists||oldQ.data()!.source!=='ai_verified'||oldQ.data()!.status!=='published') throw new Error('POOL_INDEX_CONFLICT');
        return {questionId:existingId,newlyPublished:false,duplicate:true};
      }
      // No overwrite, repair or write on a duplicate attempt.
      if(q.exists||a.exists) throw new Error('POOL_DOCUMENT_CONFLICT');
      const tree=treeDoc.data();
      const subject=tree?.subjects.find((s:{id:string})=>s.id===context.subjectId);
      const unitId=context.themeId||context.unitId;
      const unit=subject?.units.find((u:{id:string})=>u.id===unitId);
      const topicId=context.topicId||context.subthemeId;
      const topic=unit?.topics.find((t:{id:string})=>t.id===topicId);
      if(!tree||tree.sourceDatasetId!==context.datasetId||!subject||!unit||
        subject.navigationModel!==context.navigationModel||(subject.navigationModel!=='theme-test'&&!topic))
        throw new Error('PUBLISHED_CURRICULUM_SCOPE_REQUIRED');
      const presentation=parsePresentation(c.question,c.options.map(o=>({choiceId:o.id,text:o.text,...(o.visual?{visual:o.visual}:{})})),c.visual,c.visualPlacement);
      const createdAt=Timestamp.now();
      tx.create(question,{questionId:id,gradeLevel:context.grade,grade:context.grade,subject:context.subjectId,subjectId:context.subjectId,
        subjectName:subject.name,unitId,unitName:unit.name,...(context.themeId?{themeId:context.themeId}:{}),
        topic:topicId??unitId,topicId:topicId??unitId,topicName:topic?.name??unit.name,
        ...presentation,type:c.type,difficulty:c.difficulty,status:'published',isDemo:false,sourceDatasetId:context.datasetId,
        source:'ai_verified',provenance:{curriculumVersion:context.curriculumVersion,providerFamily,verificationMethod,
          capability,questionFamily:c.family,fingerprint:f,validationVersion:'question-engine@3a',createdAt}});
      // Explanation is the existing student feedback field, not verifier CoT.
      // No prompt, key, private verifier justification or personal data is stored.
      tx.create(answer,{correctChoiceId:c.correctOptionId,correctOptionId:c.correctOptionId,explanation:c.explanation,
        outcomeMappingStatus:'exact',outcomeCode:context.outcomeCode});
      for(const index of indexes) tx.create(index,{questionId:id});
      return {questionId:id,newlyPublished:true,duplicate:false};
    });
  }
}
