import type { GeminiGenerationProfile } from './gemini-contract.js';

// Dry-run configuration, not an auto-publication policy or production question source.
export const geminiDryRunProfiles:readonly GeminiGenerationProfile[]=[
  {
    id:'math-base-ten',scope:{grade:2,subjectId:'matematik',unitId:'g2-matematik-sayilar-ve-nicelikler-1',topicId:'g2-matematik-sayilari-cozumleme',outcomeCode:'MAT.2.1.2'},
    capability:'base-ten-to-number@1',family:'BASE_TEN_TO_NUMBER',visual:'base-ten',
    gradePolicy:{language:'tr',readingLevel:'2. sınıf, kısa ve somut ifadeler',maxQuestionLength:300,maxOptionLength:40},
    modelSchema:{type:'object',properties:{tens:{type:'integer',minimum:1,maximum:9},ones:{type:'integer',minimum:0,maximum:9}},required:['tens','ones'],additionalProperties:false},
    generationRules:[
      'Use distinct tens/ones models. The visual must exactly represent the model.',
      'Question must be exactly: Görseldeki onluk ve birliklerin gösterdiği sayı kaçtır?',
      'Use three or four distinct numeric text options, integers 0–99. Compute the correct option independently.',
      'Explanation format: {tens} × 10 + {ones} = {value}.',
      'Alt format: {tens} onluk çubuk ve {ones} birlik kare. Do not put the computed value in alt.',
      'Use visualPlacement above; no option visuals.'
    ]
  },
  {
    id:'life-studies-planning',scope:{grade:2,subjectId:'hayat-bilgisi',unitId:'g2-hayat-bilgisi-ben-ve-okulum',topicId:'g2-hayat-bilgisi-zaman-yonetimi',outcomeCode:'HB.2.1.1'},
    capability:'knowledge-grounded@1',family:'DAILY_PLANNING',visual:'none',
    gradePolicy:{language:'tr',readingLevel:'2. sınıf, günlük yaşam ve basit sözcükler',maxQuestionLength:300,maxOptionLength:120},
    modelSchema:{type:'object',properties:{},additionalProperties:false},
    generationRules:['Measure the exact supplied outcome about planning in daily life.','Three or four distinct options with one unambiguous claimed answer.','No visuals or unsupported curriculum mapping. Return model as an empty object.']
  },
  {
    id:'english-school-life',
    scope:{grade:2,subjectId:'ingilizce',unitId:'g2-ingilizce-school-life',
      subthemeId:'g2-ingilizce-school-life-greetings-and-introductions-at-school',outcomeCode:'ENG.2.1.R3'},
    capability:'knowledge-grounded@1',family:'SCHOOL_LIFE_DIALOGUE',visual:'school-dialogue',optionCount:3,
    gradePolicy:{language:'en',readingLevel:'Grade 2 zero-beginner English; short greetings and introductions at school; reading comprehension only, not speaking performance',maxQuestionLength:100,maxOptionLength:70},
    modelSchema:{type:'object',properties:{},additionalProperties:false},
    generationRules:[
      'The question stem must contain ONLY one short natural English utterance spoken to the pupil, for example: What is your name? or How are you? or Nice to meet you! Measure understanding of the reply, not listening, pronunciation or speaking performance.',
      'Never put instructions or narrative context in the stem: no Read the dialogue, Choose the best reply, Choose the correct answer, Complete the dialogue, Look and choose, speaker labels, colons, dashes, ellipses, underscores, blanks or line breaks. Do not write both sides of a dialogue.',
      'Exactly three distinct text options with IDs a, b, c and one unambiguous answer. Use only school-dialogue / two-pupils above. Its speech must be exactly the short question stem. No option visuals. The renderer supplies the missing reply as a question mark.',
      'Use only the School Life source language: Hello, Hi, Good morning, How are you, I am fine thanks, And you, What is your name, My name is, I am, Nice to meet you, Goodbye, Bye, See you tomorrow, Thank you, Welcome, Sorry, That is OK, Excuse me, Can I sit here, Sure.',
      'Vary the spoken utterances: asking well-being, asking a name, meeting a new pupil, polite apology/request, or leave-taking. For a five-item batch use five different communicative purposes, not name substitutions of one template. These purposes guide generation only; do not describe the situation in the stem.',
      'The utterance and options alone must establish one unambiguous reply. Distractors should be understandable English but clearly wrong as replies to that utterance, not nonsense. If two replies could be natural, replace the distractor rather than add instructions or narrative to the stem.',
      'No school-place/person recognition in the dialogue subtheme. Use the separate supplied visual families and their exact scopes. Do not invent curriculum links, assets, audio or speaking tasks. Explain the reply briefly in natural English.'
    ],
    variants:[
      {
        id:'english-school-life-place',scope:{grade:2,subjectId:'ingilizce',unitId:'g2-ingilizce-school-life',subthemeId:'g2-ingilizce-school-life-people-and-places-at-school',outcomeCode:'ENG.2.1.R3'},
        capability:'school-vocabulary@1',family:'SCHOOL_LIFE_PLACE',visual:'school-place',optionCount:3,
        gradePolicy:{language:'en',readingLevel:'Grade 2 zero-beginner English; identifying school places',maxQuestionLength:100,maxOptionLength:70},
        modelSchema:{type:'object',properties:{},additionalProperties:false},
        generationRules:['Stem must be exactly What is this? Use school-place with classroom, library or garden. Options must be a classroom, a library, a garden, in varied order. The chosen asset determines the answer. No option visuals. Use the exact supplied descriptor alt; no raw graphics, URLs, HTML or SVG. Explanation must be a short positive identification such as It is a library. Do not mention the distractor concepts in the explanation.']
      },
      {
        id:'english-school-life-person',scope:{grade:2,subjectId:'ingilizce',unitId:'g2-ingilizce-school-life',subthemeId:'g2-ingilizce-school-life-people-and-places-at-school',outcomeCode:'ENG.2.1.R3'},
        capability:'school-vocabulary@1',family:'SCHOOL_LIFE_PERSON',visual:'school-person',optionCount:3,
        gradePolicy:{language:'en',readingLevel:'Grade 2 zero-beginner English; identifying school people',maxQuestionLength:100,maxOptionLength:70},
        modelSchema:{type:'object',properties:{},additionalProperties:false},
        generationRules:['Stem must be exactly Who is this? Use school-person with teacher, pupil or headmaster. Options must be a teacher, a pupil, a headmaster, in varied order. The chosen asset determines the answer. No option visuals. Use the exact supplied descriptor alt; no raw graphics, URLs, HTML or SVG. Explanation must be a short positive identification such as It is a teacher. Do not mention the distractor concepts in the explanation.']
      }
    ]
  }
];
// knowledge-grounded requires an explicitly registered independent verifier.
// Without that server-side binding it remains REJECT / UNKNOWN_CAPABILITY.
