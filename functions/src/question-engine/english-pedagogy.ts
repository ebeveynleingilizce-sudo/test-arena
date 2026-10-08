import type {CandidateQuestion,CurriculumContext} from './contracts.js';
import {isResolvedContext} from './curriculum.js';
import {schoolPlaces,schoolPeople} from '../../visuals/school-life.mjs';
import {englishGrade2Content} from './english-grade2-content.js';

export interface EnglishPedagogyPolicy {
  version:'english-pedagogy@1';
  pedagogyBand:'early-beginner'|'developing'|'intermediate'|'upper-middle';
  grade:number;
  outcome:{code:string;text:string;skill:'receptive-reading';source:string};
  targetLanguagePolicy:{language:'en';purpose:'dialogue-response'|'visual-identification'|'context-reading';inventory:readonly string[]};
  instructionLanguagePolicy:{targetLanguage:'en';aboveLevelMetaLanguage:'tr';allowMetaInstruction:boolean;unknownStem:'independent-review'};
  allowedQuestionFamilies:readonly string[];
  visualPolicy:{role:'presentation'|'semantic';required:boolean;allowedTypes:readonly string[];allowedIds:readonly string[]};
  readingLoad:{maxStemCharacters:number;maxOptionCharacters:number;maxStemWords:number;maxOptionWords:number;maxTotalWords:number};
  optionCountPolicy:{allowed:readonly number[];preferred:number};
  distractorPolicy:{strategy:'communicative-response-contrast'|'within-target-concepts';singleCorrectRequired:true;categoryMixing:'only-for-category-outcome';responseForm:'natural-utterance'|'concept-label';rejectTrivialElimination:true};
}
export const pedagogyChecks=['instructionComprehensible','targetLanguageAligned','vocabularyLoadAppropriate','readingLoadAppropriate',
  'distractorsValid','unambiguous','naturalLanguage'] as const;
export type PedagogyCheck=typeof pedagogyChecks[number]|'visualRelevant';
export function requiredPedagogyChecks(policy:EnglishPedagogyPolicy):readonly PedagogyCheck[]{
  return policy.visualPolicy.role==='semantic'?[...pedagogyChecks,'visualRelevant']:pedagogyChecks;
}
const root='g2-ingilizce-school-life';
const greetings=root+'-greetings-and-introductions-at-school',people=root+'-people-and-places-at-school';
// Reviewed functions from the existing School Life profile/source, not a
// guessed 3–12 grade curriculum or a universal English ban list.
const utterances=['Hello','Hi','Good morning','How are you?','I am fine, thanks','And you?',
  'What is your name?',"What's your name?",'Nice to meet you!','Goodbye','Bye','See you tomorrow',
  'Thank you','Welcome','Sorry','That is OK','Excuse me','Can I sit here?','Sure'];
export function resolveEnglishPedagogy(context:CurriculumContext,family:string):EnglishPedagogyPolicy|null {
  if(isResolvedContext(context)&&context.grade===2&&context.subjectId==='ingilizce'&&['ENGLISH_DIALOGUE_RESPONSE','ENGLISH_CONTEXT_READING'].includes(family)) {
    const unit=englishGrade2Content.find(u=>u.unitId===context.unitId&&u.outcomeCode===context.outcomeCode);
    if(!unit||unit.outcomeText!==context.outcomeText||!unit.subthemes.some(t=>t.id===context.subthemeId))return null;
    const dialogue=family==='ENGLISH_DIALOGUE_RESPONSE';
    return {version:'english-pedagogy@1',pedagogyBand:'early-beginner',grade:2,
      outcome:{code:context.outcomeCode,text:context.outcomeText,skill:'receptive-reading',source:unit.source},
      targetLanguagePolicy:{language:'en',purpose:dialogue?'dialogue-response':'context-reading',inventory:[unit.inventory]},
      instructionLanguagePolicy:{targetLanguage:'en',aboveLevelMetaLanguage:'tr',allowMetaInstruction:false,unknownStem:'independent-review'},
      allowedQuestionFamilies:[family],visualPolicy:{role:'presentation',required:false,allowedTypes:[],allowedIds:[]},
      readingLoad:{maxStemCharacters:dialogue?100:180,maxOptionCharacters:70,maxStemWords:dialogue?16:30,maxOptionWords:12,maxTotalWords:66},
      optionCountPolicy:{allowed:[3],preferred:3},distractorPolicy:{strategy:dialogue?'communicative-response-contrast':'within-target-concepts',singleCorrectRequired:true,
        categoryMixing:'only-for-category-outcome',responseForm:dialogue?'natural-utterance':'concept-label',rejectTrivialElimination:true}};
  }
  if(!isResolvedContext(context)||context.grade!==2||context.subjectId!=='ingilizce'||context.unitId!==root||context.outcomeCode!=='ENG.2.1.R3')return null;
  const dialogue=family==='SCHOOL_LIFE_DIALOGUE'&&context.subthemeId===greetings;
  const place=family==='SCHOOL_LIFE_PLACE'&&context.subthemeId===people;
  const person=family==='SCHOOL_LIFE_PERSON'&&context.subthemeId===people;
  if(!dialogue&&!place&&!person)return null;
  return {
    version:'english-pedagogy@1',pedagogyBand:'early-beginner',grade:context.grade,
    outcome:{code:context.outcomeCode,text:context.outcomeText,skill:'receptive-reading',source:'https://tymm.meb.gov.tr/ingilizce-dersi-temel-egitim/unite/629'},
    targetLanguagePolicy:{language:'en',purpose:dialogue?'dialogue-response':'visual-identification',inventory:dialogue?utterances:[place?'What is this?':'Who is this?',...(place?schoolPlaces:schoolPeople)]},
    instructionLanguagePolicy:{targetLanguage:'en',aboveLevelMetaLanguage:'tr',allowMetaInstruction:false,unknownStem:'independent-review'},
    allowedQuestionFamilies:[family],
    visualPolicy:{role:dialogue?'presentation':'semantic',required:!dialogue,
      allowedTypes:[dialogue?'school-dialogue':place?'school-place':'school-person'],allowedIds:dialogue?['two-pupils']:place?schoolPlaces:schoolPeople},
    readingLoad:{maxStemCharacters:100,maxOptionCharacters:70,maxStemWords:16,maxOptionWords:12,maxTotalWords:60},
    optionCountPolicy:{allowed:[3],preferred:3},
    distractorPolicy:{strategy:dialogue?'communicative-response-contrast':'within-target-concepts',singleCorrectRequired:true,categoryMixing:'only-for-category-outcome',responseForm:dialogue?'natural-utterance':'concept-label',rejectTrivialElimination:true}
  };
}
// Explicit assessment contract derived from trusted policy. No golden IDs,
// stem blacklist, candidate answer or fixture-dependent classification.
// This is verifier prompt context, never a generator response schema.
export function englishPedagogyEvaluation(policy:EnglishPedagogyPolicy,family:string) {
  const dialogue=policy.targetLanguagePolicy.purpose==='dialogue-response';
  const reading=policy.targetLanguagePolicy.purpose==='context-reading';
  const rubric:Record<PedagogyCheck,string>={
    instructionComprehensible:'Assess the language a learner must understand to perform the task, not whether an adult can solve it. Separate the assessed target expression from directions about selecting, categorizing or judging expressions. If answering requires additional English assessment vocabulary or syntax outside the supplied outcome/target inventory and pedagogy band, this check is false even when the question is short, grammatical and has one correct answer. Enforce allowMetaInstruction and aboveLevelMetaLanguage; using Turkish alone does not prove task alignment.',
    targetLanguageAligned:dialogue?
      'The stem must function as a natural conversational turn whose reply demonstrates the supplied outcome. A metalinguistic classification or appropriateness-selection task is a different communicative purpose, even if its options include taught words. Such a purpose mismatch is false. Judge semantic function, not a prefix or exact wording. Inventory membership is evidence of taught language, not approval of the full question.':
      reading?'Assess literal understanding of a short self-contained written context using only source target language and previously taught/revisional language. A direct factual question is target reading, not adult assessment meta-language. No absent image, external facts, hidden scenario, grammar terminology or ungrounded kinship inference. Merely spotting the only response-shaped option is false.':
      'The target expression and controlled visual must assess the supplied identification outcome; an extra verbal classification task outside that purpose is false. The learner must recognize the concept from the visual, not infer it from answer labels.',
    vocabularyLoadAppropriate:'Evaluate all stem and option vocabulary relative to grade, pedagogyBand, skill and targetLanguagePolicy. Do not assume short English assessment terminology is taught because the answers use familiar words. Unsupported additional language demand is false; missing evidence is false.',
    readingLoadAppropriate:'Apply every readingLoad bound to the complete stem and options. Also assess syntax and cognitive reading demand for the pedagogy band: being below character/word limits does not establish comprehensibility.',
    distractorsValid:policy.distractorPolicy.strategy==='communicative-response-contrast'?
      'Evaluate separately from hasSingleCorrectAnswer. Each wrong option must be a natural conversational utterance within the learner language range and a plausible response-form alternative, but wrong for this specific communicative function. Conventional short or one-word conversational turns are allowed; isolated unrelated category labels are not. False if the learner can select the only response-shaped option merely by lexical category, length or form without understanding the target turn. False if another option is also a natural appropriate reply; never require identical length or full sentences.':
      'Wrong options must be meaningful, taught concept labels under distractorPolicy and demonstrably wrong for the supplied visual/task. Same-category options are useful only when exactly one satisfies the actual question; a category-membership task with multiple qualifying options is false. Reject trivial surface-form elimination and unrelated options.',
    unambiguous:'Check pragmatic as well as grammatical ambiguity. Exactly one option must be appropriate using only the supplied stem and visual. Do not invent a preceding conversation, situation or speaker intent. If a response depends on a missing conversational antecedent, this check is false, even if the stem appears in the target inventory.',
    naturalLanguage:'Check natural English grammar, word order and idiomatic conversational use for stem and every option. Being able to guess the intended meaning does not excuse malformed English. Legitimate conventional short conversational turns are allowed.',
    visualRelevant:'Only a semantic visual can satisfy this check. Its supplied controlled kind/asset must provide the relevant identification evidence without answer-labelled hints. Decorative characters are not semantic evidence. Do not infer a missing diagram.'
  };
  return {
    grade:policy.grade,pedagogyBand:policy.pedagogyBand,outcome:{code:policy.outcome.code,text:policy.outcome.text},skill:policy.outcome.skill,family,
    targetLanguagePolicy:policy.targetLanguagePolicy,instructionLanguagePolicy:policy.instructionLanguagePolicy,
    readingLoad:policy.readingLoad,optionCountPolicy:policy.optionCountPolicy,distractorPolicy:policy.distractorPolicy,visualPolicy:policy.visualPolicy,
    requiredEvidence:Object.fromEntries(requiredPedagogyChecks(policy).map(check=>[check,rubric[check]])),
    decisionRule:'Every required evidence field must independently satisfy its rubric. One correct answer is insufficient. Never compensate for a failed pedagogy check with correctness, confidence or another successful check. If policy/context cannot justify a check confidently, return false and an issue; no REVIEW verdict exists.'
  };
}
const normalize=(text:string)=>text.toLowerCase().replace(/[’]/g,"'").replace(/[!?.,]/g,'').replace(/\s+/g,' ').trim();
const words=(text:string)=>text.trim().split(/\s+/).filter(Boolean).length;
export function inspectEnglishPedagogy(candidate:CandidateQuestion,policy:EnglishPedagogyPolicy):{valid:boolean;code?:string;needsSemanticStemReview:boolean}{
  const limit=policy.readingLoad;
  if(!policy.allowedQuestionFamilies.includes(candidate.family)||candidate.scope.grade!==policy.grade||candidate.scope.outcomeCode!==policy.outcome.code)
    return {valid:false,code:'PEDAGOGY_SCOPE',needsSemanticStemReview:true};
  if(!policy.optionCountPolicy.allowed.includes(candidate.options.length))return {valid:false,code:'PEDAGOGY_OPTION_COUNT',needsSemanticStemReview:true};
  if(candidate.question.length>limit.maxStemCharacters||words(candidate.question)>limit.maxStemWords||candidate.options.some(o=>o.text.length>limit.maxOptionCharacters||words(o.text)>limit.maxOptionWords)||
    words(candidate.question)+candidate.options.reduce((sum,o)=>sum+words(o.text),0)>limit.maxTotalWords)return {valid:false,code:'PEDAGOGY_READING_LOAD',needsSemanticStemReview:true};
  const visual=candidate.visual as {kind:string;asset?:string}|undefined;
  if(policy.visualPolicy.required&&!visual||visual&&(!policy.visualPolicy.allowedTypes.includes(visual.kind)||!visual.asset||!policy.visualPolicy.allowedIds.includes(visual.asset)))
    return {valid:false,code:'PEDAGOGY_VISUAL_POLICY',needsSemanticStemReview:true};
  // An unfamiliar short stem is not automatically "grade appropriate". The
  // independent reviewer must establish whether it is taught target language
  // or above-level assessment meta-language. No rejection by a few substrings.
  const known=policy.targetLanguagePolicy.inventory.some(s=>normalize(s)===normalize(candidate.question));
  return {valid:true,needsSemanticStemReview:!known};
}
