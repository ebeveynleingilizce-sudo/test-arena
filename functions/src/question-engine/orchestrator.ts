import type {CurriculumContext,CurriculumScope} from './contracts.js';
import {resolveCurriculumContext,type CanonicalCurriculum,type CurriculumNavigation} from './curriculum.js';
import {resolveGeneration,minimumUsable,type OrchestrationConfig} from './orchestration-strategies.js';
import {resolveRefillPolicy,plannedBatch,type RefillPolicyConfig} from './refill-policy.js';
import type {RefillStore} from './refill.js';

type Node={id:string;name?:string;outcomes?:{code:string;text:string}[];outcome_codes?:string[];topics?:Node[];subthemes?:Node[]};
export interface Dataset {canonical:CanonicalCurriculum;navigation?:CurriculumNavigation}
export interface InventoryScope {scope:Partial<CurriculumScope>;unitName?:string;topicName?:string;context?:CurriculumContext;reason?:string}
export interface PlanFilter {grade?:number;subject?:string;unit?:string;topic?:string}
export function discoverScopes(datasets:Dataset[]):InventoryScope[] {
  const discovered:InventoryScope[]=[],seen=new Set<string>();
  for(const {canonical,navigation} of datasets) {
    if(!Number.isInteger(canonical.grade)||canonical.grade<2||canonical.grade>12)throw new Error('INVALID_CANONICAL_GRADE');
    for(const subject of canonical.subjects) {
      const walk=(node:Node,root:Node,childKind?:'topicId'|'subthemeId')=>{
        const scope:Partial<CurriculumScope>={grade:canonical.grade,subjectId:subject.id,unitId:root.id,...(childKind?{[childKind]:node.id}:{})};
        const outcomes=node.outcomes||[],codes=node.outcome_codes||[];
        // Bare codes stay on their documented node. Never cross-product them with subthemes.
        const entries=[...outcomes,...codes.filter(code=>!outcomes.some(o=>o.code===code)).map(code=>({code,text:''}))];
        const children=[...(node.topics||[]),...(node.subthemes||[])];
        if(!entries.length&&!children.length)entries.push({code:'',text:''});
        for(const outcome of entries) {
          const item:InventoryScope={scope:{...scope,...(outcome.code?{outcomeCode:outcome.code}:{})},unitName:root.name,...(childKind?{topicName:node.name}:{})};
          const identity=JSON.stringify(item.scope);
          if(seen.has(identity))throw new Error('DUPLICATE_CURRICULUM_SCOPE');seen.add(identity);
          if(!navigation||!outcome.code||!outcome.text?.trim())item.reason='CURRICULUM_MAPPING_INCOMPLETE';
          else try {item.context=resolveCurriculumContext(canonical,navigation,item.scope as CurriculumScope);}catch {item.reason='CURRICULUM_MAPPING_INCOMPLETE';}
          discovered.push(item);
        }
        for(const child of node.topics||[])walk(child,root,'topicId');
        for(const child of node.subthemes||[])walk(child,root,'subthemeId');
      };
      for(const node of [...(subject.units||[]),...(subject.themes||[]),...(subject.skill_domains||[])])walk(node,node);
    }
  }
  return discovered;
}
export function filterScopes(items:InventoryScope[],filter:PlanFilter) {
  return items.filter(({scope})=>(filter.grade===undefined||scope.grade===filter.grade)&&(!filter.subject||scope.subjectId===filter.subject)&&
    (!filter.unit||scope.unitId===filter.unit||scope.themeId===filter.unit)&&(!filter.topic||scope.topicId===filter.topic||scope.subthemeId===filter.topic));
}
// Read-only dependency: no generate, verify, acquire, publish or write method is available.
export async function createOrchestrationPlan(items:InventoryScope[],config:OrchestrationConfig,policyConfig:RefillPolicyConfig,store:Pick<RefillStore,'summary'>) {
  const summary={discoveredScopes:items.length,supportedScopes:0,unsupportedScopes:0,fullScopes:0,usableButLowScopes:0,unusableScopes:0,
    totalCurrentQuestions:0,totalTargetQuestions:0,totalGap:0,estimatedCandidateCount:0,estimatedGeneratorBatches:0,estimatedVerifierCalls:0,inventoryErrors:0};
  const unsupportedReasons:Record<string,number>={},unsupported:unknown[]=[],needsRefill:unknown[]=[],full:unknown[]=[],inventoryErrors:unknown[]=[];
  for(const item of items) {
    const resolution=item.context?resolveGeneration(item.context,config):{status:'UNSUPPORTED' as const,reason:item.reason||'CURRICULUM_MAPPING_INCOMPLETE'};
    if(resolution.status==='UNSUPPORTED') {
      summary.unsupportedScopes++;unsupportedReasons[resolution.reason]=(unsupportedReasons[resolution.reason]||0)+1;
      unsupported.push({...item,reason:resolution.reason});continue;
    }
    const context=item.context!,policy=resolveRefillPolicy(policyConfig,context,resolution.profile.family),minimum=minimumUsable(context,config);
    if(minimum>policy.targetVerifiedQuestions)throw new Error('MINIMUM_EXCEEDS_TARGET');
    summary.supportedScopes++;
    let pool;
    try {pool=await store.summary(context);}catch {summary.inventoryErrors++;inventoryErrors.push({scope:item.scope,reason:'POOL_INVENTORY_UNAVAILABLE'});continue;}
    const current=pool.count,target=policy.targetVerifiedQuestions,gap=Math.max(0,target-current);
    if(!Number.isInteger(current)||current<0)throw new Error('INVALID_POOL_COUNT');
    summary.totalCurrentQuestions+=current;summary.totalTargetQuestions+=target;summary.totalGap+=gap;
    const priority=current===0?0:current<minimum?1:current<target/2?2:3;
    // Ideal acceptance workload estimate; not a cost promise. Existing run limits bound each run.
    const estimatedCandidates=Math.ceil(gap*policy.overgenerationFactor),estimatedBatches=Math.ceil(estimatedCandidates/policy.batchSize);
    const row={scope:item.scope,outcomeText:context.outcomeText,curriculumVersion:context.curriculumVersion,navigationModel:context.navigationModel,
      unitName:item.unitName,topicName:item.topicName,current,target,gap,minimumUsable:minimum,priority,
      strategy:resolution.strategy,verification:resolution.verification,family:resolution.profile.family,
      allowedQuestionTypes:resolution.allowedQuestionTypes,allowedVisualKinds:resolution.allowedVisualKinds,
      plannedFirstBatch:plannedBatch(gap,policy),estimatedCandidateCount:estimatedCandidates,estimatedGeneratorBatches:estimatedBatches,
      estimatedVerifierCalls:resolution.verification==='independent_ai'?estimatedCandidates:0,
      runLimits:{maxBatches:policy.maxBatches,maxCandidates:policy.maxGeneratedCandidates,maxProviderCalls:policy.maxProviderCalls,maxVerifierCalls:policy.maxVerifierCalls}};
    if(!gap){summary.fullScopes++;full.push({...row,status:'FULL'});}
    else {
      if(current>=minimum)summary.usableButLowScopes++;else summary.unusableScopes++;
      summary.estimatedCandidateCount+=row.estimatedCandidateCount;summary.estimatedGeneratorBatches+=row.estimatedGeneratorBatches;summary.estimatedVerifierCalls+=row.estimatedVerifierCalls;
      needsRefill.push({...row,status:'NEEDS_REFILL'});
    }
  }
  needsRefill.sort((a:any,b:any)=>a.priority-b.priority||b.gap-a.gap||JSON.stringify(a.scope).localeCompare(JSON.stringify(b.scope)));
  return {mode:'PLAN',status:summary.inventoryErrors?'INCOMPLETE':'PLANNED',summary,unsupportedReasons,needsRefill,full,unsupported,inventoryErrors,generatorCalls:0,verifierCalls:0,publications:0};
}
