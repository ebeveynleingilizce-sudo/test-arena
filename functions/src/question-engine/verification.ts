import {resolveEnglishPedagogy,inspectEnglishPedagogy} from './english-pedagogy.js';
import type { CandidateQuestion, CurriculumContext, DomainResult, GradeLevelPolicy, QuestionVerifier, VerificationInput } from './contracts.js';
import { semantics, stableJSON } from './fingerprint.js';
import { ValidatorRegistry } from './registry.js';
import { aiVerificationGate } from './quality-gate.js';

interface VerifierBinding {
  capability:string; verifier:QuestionVerifier; contexts:readonly CurriculumContext[];
  families:readonly string[]; gradePolicy:GradeLevelPolicy; visualKinds:readonly string[];
}
// Trusted server configuration. A candidate cannot select its own verifier.
export class VerifierRegistry {
  private readonly bindings=new Map<string,VerifierBinding>();
  register(binding:VerifierBinding) {
    if(!binding.capability||this.bindings.has(binding.capability)) throw new Error('DUPLICATE_CAPABILITY');
    this.bindings.set(binding.capability,{...binding,contexts:[...binding.contexts],families:[...binding.families],
      gradePolicy:{...binding.gradePolicy},visualKinds:[...binding.visualKinds]});
    return this;
  }
  get(capability:string){return this.bindings.get(capability);}
}
function freeze<T>(value:T):T {
  if(value&&typeof value==='object') {for(const child of Object.values(value)) freeze(child);Object.freeze(value);}
  return value;
}
function blindInput(candidate:CandidateQuestion,context:CurriculumContext,policy:GradeLevelPolicy):VerificationInput {
  // Explicit DTO, never spread a candidate. Alt/model can echo an answer; do not
  // transmit them. Visuals have already passed the shared presentation parser.
  return freeze({curriculum:context,
    gradePolicy:{language:policy.language,readingLevel:policy.readingLevel,
      maxQuestionLength:policy.maxQuestionLength,maxOptionLength:policy.maxOptionLength},
    question:candidate.question,options:candidate.options.map(o=>({id:o.id,text:o.text,
      ...(o.visual?{visual:semantics(o.visual)}:{})})),
    // A controlled two-pupil dialogue is decorative characters plus the exact
    // stem (equality checked by common validation). No unseen clue is removed.
    ...(candidate.visual&&candidate.visual.kind!=='school-dialogue'?{visual:semantics(candidate.visual)}:{})});
}
export class VerificationRouter {
  constructor(readonly deterministic:ValidatorRegistry,private readonly independent:VerifierRegistry) {}
  async verify(candidate:CandidateQuestion,context:CurriculumContext,capability:string):Promise<DomainResult> {
    const pedagogy=context.subjectId==='ingilizce'?resolveEnglishPedagogy(context,candidate.family):null;
    if(context.subjectId==='ingilizce'&&!pedagogy)return {valid:false,code:'UNSUPPORTED_PEDAGOGY_SCOPE'};
    const inspection=pedagogy?inspectEnglishPedagogy(candidate,pedagogy):null;
    if(inspection&&!inspection.valid)return {valid:false,code:inspection.code!};
    const validator=this.deterministic.get(capability);
    let solved:DomainResult|undefined;
    // A failed deterministic solve must never fall back to a more permissive AI.
    if(validator) {
      try {solved=validator.supports(context)?validator.validate(candidate,context):{valid:false,code:'UNSUPPORTED_SCOPE'};
        if(!solved.valid||!pedagogy)return solved;
        if(solved.solvedOptionId!==candidate.correctOptionId)return {valid:false,code:'ANSWER_MISMATCH'};}
      catch {return {valid:false,code:'VALIDATOR_ERROR'};}
    }
    const binding=this.independent.get(capability);
    if(!binding) return {valid:false,code:'UNKNOWN_CAPABILITY'};
    if(!binding.contexts.some(c=>stableJSON(c)===stableJSON(context))||!binding.families.includes(candidate.family))
      return {valid:false,code:'UNSUPPORTED_SCOPE'};
    const visuals=[candidate.visual,...candidate.options.map(o=>o.visual)].filter(v=>v!==undefined);
    if(visuals.some(v=>!binding.visualKinds.includes(v.kind))) return {valid:false,code:'UNSUPPORTED_VERIFIER_VISUAL'};
    if(candidate.question.length>binding.gradePolicy.maxQuestionLength||candidate.options.some(o=>o.text.length>binding.gradePolicy.maxOptionLength))
      return {valid:false,code:'VERIFIER_CONTENT_LIMIT'};
    try {const input=blindInput(candidate,context,binding.gradePolicy);
      const evidence=await binding.verifier.verify(pedagogy?freeze({...input,pedagogy:{family:candidate.family,policy:pedagogy,needsSemanticStemReview:inspection!.needsSemanticStemReview}}):input);
      const result=aiVerificationGate(evidence,candidate,pedagogy??undefined);
      return result.valid&&solved?solved:result;}
    // Provider messages may contain secrets or remote bodies. Only a fixed code.
    catch {return {valid:false,code:'VERIFICATION_FAILURE'};}
  }
}
