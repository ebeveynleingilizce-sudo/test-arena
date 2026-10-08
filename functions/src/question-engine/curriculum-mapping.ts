import type {CurriculumContext} from './contracts.js';
import {discoverScopes,createOrchestrationPlan,type Dataset,type InventoryScope} from './orchestrator.js';
import {matches,type OrchestrationConfig} from './orchestration-strategies.js';
import type {RefillPolicyConfig} from './refill-policy.js';
import type {RefillStore} from './refill.js';

export interface ExpansionPolicy {
  groups:{match:OrchestrationConfig['bindings'][number]['match'];strategy:string;family:string;
    approvedOutcomes:{code:string;text:string}[];blockedGroups:{reason:string;outcomeCodes:string[]}[]}[];
}
type SourceNode={id:string;outcomes?:{code:string;text:string}[]};
// Canonical academic relation and usable navigation relation are separate facts.
// An exact skill-domain outcome does not authorize inventing a student theme.
export function mappingAudit(item:InventoryScope,datasets:Dataset[]):{canonicalRelation:string;navigationRelation:string;outcomeText?:string;reason?:string} {
  const dataset=datasets.find(d=>d.canonical.grade===item.scope.grade);
  const subject=dataset?.canonical.subjects.find(s=>s.id===item.scope.subjectId);
  const root=[...(subject?.units||[]),...(subject?.themes||[]),...(subject?.skill_domains||[])].find(n=>n.id===item.scope.unitId);
  const node:SourceNode|undefined=item.scope.topicId?root?.topics?.find(n=>n.id===item.scope.topicId):item.scope.subthemeId?root?.subthemes?.find(n=>n.id===item.scope.subthemeId):root;
  const exact=node?.outcomes?.filter(o=>o.code===item.scope.outcomeCode&&o.text?.trim())||[];
  if(item.context)return {canonicalRelation:'EXACT',navigationRelation:'EXACT',outcomeText:item.context.outcomeText};
  let reason='CURRICULUM_MAPPING_INCOMPLETE';
  if(!dataset?.navigation)reason='NAVIGATION_SOURCE_MISSING';
  else if(!item.scope.outcomeCode)reason=item.scope.topicId||item.scope.subthemeId?'TOPIC_OUTCOME_LINK_MISSING':'THEME_OUTCOME_LINK_MISSING';
  else if(exact.length===0)reason='OUTCOME_TEXT_MISSING';
  else if(exact.length===1&&subject?.skill_domains?.some(n=>n.id===root?.id))reason='SKILL_THEME_LINK_MISSING';
  return {canonicalRelation:exact.length===1?'EXACT':'INCOMPLETE',navigationRelation:'UNRESOLVED',reason,
    ...(exact.length===1?{outcomeText:exact[0].text}:{})};
}
export function expandCurriculumMapping(datasets:Dataset[],base:OrchestrationConfig,policy:ExpansionPolicy) {
  const before=discoverScopes(datasets),bindings=[...base.bindings],audits:unknown[]=[];
  const expanded=before.map(item=>{
    const audit=mappingAudit(item,datasets);audits.push({scope:item.scope,...audit});
    if(!item.context)return {...item,reason:audit.reason||item.reason};
    const context=item.context;
    // Proven original bindings (including deterministic mathematics) retain precedence.
    if(base.bindings.some(b=>matches(context,b.match)))return item;
    const groups=policy.groups.filter(g=>matches(context,g.match));
    if(groups.length>1)throw new Error('AMBIGUOUS_EXPANSION_GROUP');
    if(!groups.length)return {...item,context:undefined,reason:context.subjectId==='matematik'?'DETERMINISTIC_OR_VISUAL_CAPABILITY_REQUIRED':'NO_REVIEWED_ASSESSMENT_STRATEGY'};
    const group=groups[0],approved=group.approvedOutcomes.filter(o=>o.code===context.outcomeCode);
    if(approved.length>1)throw new Error('DUPLICATE_APPROVAL');
    const blocked=group.blockedGroups.filter(b=>b.outcomeCodes.includes(context.outcomeCode));
    if(blocked.length>1||approved.length&&blocked.length)throw new Error('CONFLICTING_ASSESSMENT_POLICY');
    if(approved.length===1&&approved[0].text!==context.outcomeText)return {...item,context:undefined,reason:'REVIEWED_OUTCOME_TEXT_CHANGED'};
    if(approved.length===1) {
      // Resolve exact topic/unit membership from canonical context, never from the approval list.
      const {outcomeText,navigationModel,...match}=context;
      bindings.push({match,strategy:group.strategy,family:group.family});return item;
    }
    return {...item,context:undefined,reason:blocked[0]?.reason||'NO_REVIEWED_ASSESSMENT_STRATEGY'};
  });
  return {before,expanded,audits,config:{...base,bindings}};
}
export async function curriculumExpansionPlan(datasets:Dataset[],base:OrchestrationConfig,policy:ExpansionPolicy,refill:RefillPolicyConfig,store:Pick<RefillStore,'summary'>,
  select:(items:InventoryScope[])=>InventoryScope[]=items=>items) {
  const mapping=expandCurriculumMapping(datasets,base,policy);
  const before=await createOrchestrationPlan(select(mapping.before),base,refill,store);
  const after=await createOrchestrationPlan(select(mapping.expanded),mapping.config,refill,store);
  const bySubject:Record<string,{before:{discovered:number;supported:number;unsupported:number};after:{discovered:number;supported:number;unsupported:number}}>= {};
  for(const stage of ['before','after'] as const) {
    const plan=stage==='before'?before:after;
    for(const item of select(stage==='before'?mapping.before:mapping.expanded)) {
      const subject=item.scope.subjectId!;
      bySubject[subject]||={before:{discovered:0,supported:0,unsupported:0},after:{discovered:0,supported:0,unsupported:0}};
      bySubject[subject][stage].discovered++;
    }
    for(const item of [...plan.needsRefill,...plan.full,...plan.inventoryErrors] as {scope:CurriculumContext}[])bySubject[item.scope.subjectId][stage].supported++;
    for(const item of plan.unsupported as {scope:CurriculumContext}[])bySubject[item.scope.subjectId][stage].unsupported++;
  }
  return {before,after,bySubject,mappingAudit:mapping.audits};
}
