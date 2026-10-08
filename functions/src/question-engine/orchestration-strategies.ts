import type {CurriculumContext,GradeLevelPolicy} from './contracts.js';
import {isResolvedContext} from './curriculum.js';
import {geminiDryRunProfiles} from './providers/gemini-profiles.js';
import type {GeminiGenerationProfile} from './providers/gemini-contract.js';

// Strategy templates contain no curriculum scope. Old dry-run profiles remain unchanged.
const baseTen=geminiDryRunProfiles.find(p=>p.capability==='base-ten-to-number@1')!;
export const generationStrategies={
  'base-ten-mcq@1':{capability:'base-ten-to-number@1',verification:'deterministic',visual:'base-ten',
    modelSchema:baseTen.modelSchema,generationRules:baseTen.generationRules},
  'knowledge-mcq@1':{capability:'knowledge-grounded@1',verification:'independent_ai',visual:'none',
    modelSchema:{type:'object',properties:{},additionalProperties:false},generationRules:[
      'Measure only the exact supplied curriculum outcome, using the supplied grade/language policy.',
      'Three or four distinct text options with one unambiguous answer. No visual. Return model as an empty object.'
    ]}
} as const;
type Match=Partial<Pick<CurriculumContext,'grade'|'subjectId'|'unitId'|'themeId'|'topicId'|'subthemeId'|'outcomeCode'|'datasetId'|'curriculumVersion'>>;
export interface OrchestrationConfig {
  minimumUsable:number;
  minimumOverrides:{match:Match;minimumUsable:number}[];
  gradePolicies:Record<string,GradeLevelPolicy>;
  bindings:{match:Match;strategy:string;family:string;requiredVisualKinds?:string[]}[];
}
const keys=['grade','subjectId','unitId','themeId','topicId','subthemeId','outcomeCode','datasetId','curriculumVersion'];
export function matches(context:CurriculumContext,match:Match) {
  if(!Object.keys(match).length||Object.keys(match).some(k=>!keys.includes(k)))throw new Error('INVALID_CAPABILITY_MAPPING');
  return Object.entries(match).every(([k,v])=>context[k as keyof CurriculumContext]===v);
}
export function resolveGeneration(context:CurriculumContext,config:OrchestrationConfig) {
  const unsupported=(reason:string)=>({status:'UNSUPPORTED' as const,reason});
  if(!isResolvedContext(context))return unsupported('CURRICULUM_MAPPING_INCOMPLETE');
  const bindings=config.bindings.filter(b=>matches(context,b.match));
  if(!bindings.length)return unsupported('NO_GENERATION_STRATEGY');
  if(bindings.some(b=>!Object.hasOwn(generationStrategies,b.strategy)))return unsupported('NO_GENERATION_STRATEGY');
  const ordered=bindings.map(binding=>({binding,strategy:generationStrategies[binding.strategy as keyof typeof generationStrategies]}));
  const deterministic=ordered.filter(b=>b.strategy.verification==='deterministic'),eligible=deterministic.length?deterministic:ordered;
  if(eligible.length!==1)return unsupported('AMBIGUOUS_CAPABILITY_MAPPING');
  const {binding,strategy}=eligible[0],gradePolicy=config.gradePolicies[String(context.grade)];
  if(!gradePolicy?.language||!gradePolicy.readingLevel||!Number.isInteger(gradePolicy.maxQuestionLength)||gradePolicy.maxQuestionLength<1||
    !Number.isInteger(gradePolicy.maxOptionLength)||gradePolicy.maxOptionLength<1)return unsupported('NO_GRADE_POLICY');
  if(!/^[A-Z][A-Z0-9_]{1,80}$/.test(binding.family))return unsupported('INVALID_FAMILY_MAPPING');
  const visualKinds=strategy.visual==='none'?[]:[strategy.visual];
  if(binding.requiredVisualKinds?.some(k=>!visualKinds.includes(k as 'base-ten')))return unsupported('UNSUPPORTED_VISUAL_REQUIREMENT');
  const profile:GeminiGenerationProfile={id:binding.strategy,scope:{grade:context.grade,subjectId:context.subjectId,
    unitId:context.unitId,themeId:context.themeId,topicId:context.topicId,subthemeId:context.subthemeId,outcomeCode:context.outcomeCode},
    capability:strategy.capability,family:binding.family,gradePolicy,visual:strategy.visual,
    modelSchema:strategy.modelSchema,generationRules:strategy.generationRules};
  // Remove absent scope keys so this can later feed the unchanged profile/runtime contract.
  for(const key of Object.keys(profile.scope))if(profile.scope[key as keyof typeof profile.scope]===undefined)delete profile.scope[key as keyof typeof profile.scope];
  return {status:'SUPPORTED' as const,strategy:binding.strategy,verification:strategy.verification,
    allowedQuestionTypes:['multiple-choice'],allowedVisualKinds:visualKinds,profile};
}
export function minimumUsable(context:CurriculumContext,config:OrchestrationConfig) {
  let minimum=config.minimumUsable;
  for(const entry of config.minimumOverrides)if(matches(context,entry.match))minimum=entry.minimumUsable;
  if(!Number.isInteger(minimum)||minimum<1||minimum>1000)throw new Error('INVALID_MINIMUM_USABLE');
  return minimum;
}
