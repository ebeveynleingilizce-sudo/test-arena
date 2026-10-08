import {englishGrade2Content} from '../english-grade2-content.js';
import type {GeminiGenerationProfile} from './gemini-contract.js';

// Uses the existing knowledge-grounded runtime, wire schema and publication gate.
// Text-only is intentional: no missing/review image or newly approved asset is used.
export function englishGrade2PilotProfile(unitId:string,subthemeId:string):GeminiGenerationProfile {
  const unit=englishGrade2Content.find(u=>u.unitId===unitId),topic=unit?.subthemes.find(t=>t.id===subthemeId);
  if(!unit||!topic||unitId==='g2-ingilizce-school-life'&&!['g2-ingilizce-school-life-greetings-and-introductions-at-school','g2-ingilizce-school-life-people-and-places-at-school'].includes(subthemeId))throw new Error('UNSUPPORTED_PILOT_SCOPE');
  const scope={grade:2,subjectId:'ingilizce',unitId,subthemeId,outcomeCode:unit.outcomeCode};
  const rules=[`Assess only the named subtheme: ${topic.name}. The broader source inventory is revision/reference, not permission to change scope.`,
    'Exactly three natural text options, IDs a/b/c, one defensible correct answer. No images, HTML, paths or Unicode asset identifiers. All visual wire fields empty and visualType none.',
    'Use only the official target language inventory and its explicit revisional language. Target language is English. Do not add Turkish instructions or English assessment meta-instructions.',
    'Generate different communicative functions or reading facts, not renamed people, reordered options or near-identical templates. Use plausible same-task distractors. Explain briefly in English.',
    'No invented scenes, unavailable pictures, missing preceding dialogue or unsupported facts. A bare Who is she? or What is this? without a referent is not a complete question.',
    'Do not test a grammatical rule, spelling trivia, listening, pronunciation, speaking or writing performance. This is receptive reading under the exact R3 outcome.'];
  const shared={scope,capability:'knowledge-grounded@1',visual:'none' as const,optionCount:3 as const,modelSchema:{type:'object',properties:{},additionalProperties:false},
    gradePolicy:{language:'en',readingLevel:'Grade 2 early beginner; official unit target/revisional language only',maxQuestionLength:180,maxOptionLength:70}};
  const reading:GeminiGenerationProfile={...shared,id:'english-grade2-context-reading',family:'ENGLISH_CONTEXT_READING',generationRules:[...rules,
    'Give a short complete context, usually one or two simple sentences, then a short natural factual question using taught target chunks. The context must resolve the answer. No blanks, no Choose/Read/Which expression instructions. Vary possession, location, speaker, description, quantity or preferences only when source/subtheme permits.']};
  return {...shared,id:'english-grade2-dialogue-response',family:'ENGLISH_DIALOGUE_RESPONSE',generationRules:[...rules,
    'The stem is one short natural conversational turn. Reply options are all plausible taught English utterances but only one fits this turn. No labels, ellipses, blanks or instruction wrapper. If the subtheme cannot support a complete dialogue, reject rather than invent unrelated language.'],
    variants:[reading],batchDiversity:'Use both supplied families when count >=3: prefer 3 context-reading and 2 different dialogue-response items for 5 candidates. For smaller batches retain quality over artificial variation. Each must test a distinct fact/function in the exact subtheme.'};
}
