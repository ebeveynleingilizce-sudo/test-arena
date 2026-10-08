import { randomUUID } from 'node:crypto';
import { parseVisual } from '../../../visuals/contract.mjs';
import type { CurriculumContext, CurriculumScope } from '../contracts.js';
import {isResolvedContext} from '../curriculum.js';

export type JSONSchema = Record<string,unknown>;
export interface GeminiGenerationProfile {
  id:string;
  scope:CurriculumScope;
  capability:string;
  family:string;
  gradePolicy:{ language:string; readingLevel:string; maxQuestionLength:number; maxOptionLength:number };
  generationRules:readonly string[];
  modelSchema:JSONSchema;
  optionCount?:3;
  visual:'none'|'base-ten'|'school-dialogue'|'school-place'|'school-person';
  variants?:readonly GeminiGenerationProfile[];
  batchDiversity?:string;
}
export interface GeminiErrorDetails {
  httpStatus?:number;
  apiStatus?:'INVALID_ARGUMENT'|'UNAUTHENTICATED'|'PERMISSION_DENIED'|'RESOURCE_EXHAUSTED'|'NOT_FOUND'|'INTERNAL'|'UNAVAILABLE'|'DEADLINE_EXCEEDED';
  reason?:'SCHEMA_REJECTED'|'SCHEMA_COMPLEXITY'|'UNSUPPORTED_SCHEMA_KEYWORD'|'INVALID_SCHEMA_TYPE';
  requestFields?:readonly string[];
  diagnostics?:Readonly<{messagePresent:boolean;detailCount:number;badRequestCount:number;fieldViolationCount:number;filteredFieldCount:number}>;
}
export class GeminiProviderError extends Error {
  constructor(readonly code:string, readonly details:Readonly<GeminiErrorDetails>={}) { super(code);this.name='GeminiProviderError'; }
}
const object = (properties:JSONSchema, required=Object.keys(properties)):JSONSchema => ({type:'object',properties,required,additionalProperties:false});
const string = (maxLength:number):JSONSchema => ({type:'string',minLength:1,maxLength});
export function responseSchema(context:CurriculumContext, profile:GeminiGenerationProfile, count:number,contexts:readonly CurriculumContext[]=[context]):JSONSchema {
  if(profile.gradePolicy.language==='en'){
    if(contexts.length!==1+(profile.variants?.length??0))throw new GeminiProviderError('UNRESOLVED_VARIANTS');
    const text={type:'string'};
    return object({questions:{type:'array',minItems:count,maxItems:count,items:object({
      scopeKey:text,family:text,question:text,difficulty:text,
      options:{type:'array',items:object({id:text,text})},correctOptionId:text,explanation:text,
      visualType:text,visualId:text,visualAlt:text,visualSpeech:text
    })}});
  }
  if(profile.variants?.length){
    const profiles=[{...profile,variants:undefined},...profile.variants];
    if(contexts.length!==profiles.length)throw new GeminiProviderError('UNRESOLVED_VARIANTS');
    return object({questions:{type:'array',minItems:count,maxItems:count,items:{anyOf:profiles.map((p,i)=>
      ((responseSchema(contexts[i],p,1).properties as JSONSchema).questions as JSONSchema).items)}}});
  }
  const scope=object(Object.fromEntries(Object.entries(context).map(([k,v])=>[k,{type:typeof v==='number'?'integer':'string',enum:[v]}])));
  const properties:JSONSchema={
    scope,type:{type:'string',enum:['multiple-choice']},difficulty:{type:'string',enum:['easy','medium','hard']},
    question:string(profile.gradePolicy.maxQuestionLength),
    options:{type:'array',minItems:3,maxItems:profile.optionCount??4,items:object({id:{type:'string',enum:profile.optionCount===3?['a','b','c']:['a','b','c','d']},text:string(profile.gradePolicy.maxOptionLength)})},
    correctOptionId:{type:'string',enum:profile.optionCount===3?['a','b','c']:['a','b','c','d']},explanation:string(1000),
    family:{type:'string',enum:[profile.family]},model:profile.modelSchema
  };
  if(profile.visual==='base-ten'){
    properties.visual=object({kind:{type:'string',enum:['base-ten']},tens:{type:'integer',minimum:0,maximum:9},ones:{type:'integer',minimum:0,maximum:9},alt:string(300)});
    properties.visualPlacement={type:'string',enum:['above']};
  }
  return object({questions:{type:'array',minItems:count,maxItems:count,items:object(properties)}});
}
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
// Never repair answer keys or overwrite echoed scope. Common/domain validators
// receive the model's claims unchanged, under fresh ephemeral server candidate IDs.
export function extractGeminiJSON(payload:unknown):unknown {
  if(!record(payload))throw new GeminiProviderError('MALFORMED_RESPONSE');
  if(record(payload.promptFeedback)&&payload.promptFeedback.blockReason)throw new GeminiProviderError('BLOCKED_RESPONSE');
  if(!Array.isArray(payload.candidates)||payload.candidates.length!==1)throw new GeminiProviderError('EMPTY_OR_MULTIPLE_RESPONSE');
  const answer=payload.candidates[0];
  if(!record(answer)||answer.finishReason!=='STOP'||!record(answer.content)||!Array.isArray(answer.content.parts))throw new GeminiProviderError('INCOMPLETE_RESPONSE');
  const textParts=answer.content.parts.filter(p=>record(p)&&p.thought!==true);
  // Gemini may attach an opaque thoughtSignature to a normal JSON text part.
  // It is transport metadata, not another content type or candidate field.
  if(!textParts.length||textParts.some(p=>typeof p.text!=='string'||
    (p.thoughtSignature!==undefined&&typeof p.thoughtSignature!=='string')||
    Object.keys(p).some(k=>!['text','thought','thoughtSignature'].includes(k))))throw new GeminiProviderError('EMPTY_OR_NON_TEXT_RESPONSE');
  const text=textParts.map(p=>p.text).join('');
  if(!text.trim()||text.length>200000)throw new GeminiProviderError('EMPTY_OR_OVERSIZED_RESPONSE');
  let data:unknown;try{data=JSON.parse(text);}catch{throw new GeminiProviderError('MALFORMED_JSON');}
  return data;
}
export function parseGeminiResponse(payload:unknown, profile:GeminiGenerationProfile, count:number,contexts:readonly CurriculumContext[]=[]):unknown[] {
  const data=extractGeminiJSON(payload);
  if(!record(data)||Object.keys(data).some(k=>k!=='questions')||!Array.isArray(data.questions)||data.questions.length!==count)throw new GeminiProviderError('INVALID_BATCH');
  if(profile.gradePolicy.language==='en'){
    const profiles=[profile,...(profile.variants??[])];
    if(contexts.length!==profiles.length||contexts.some((ctx,i)=>!isResolvedContext(ctx)||Object.entries(profiles[i].scope).some(([k,v])=>ctx[k as keyof CurriculumContext]!==v)))throw new GeminiProviderError('UNRESOLVED_VARIANTS');
    const fields=['scopeKey','family','question','difficulty','options','correctOptionId','explanation','visualType','visualId','visualAlt','visualSpeech'];
    data.questions=data.questions.map(q=>{
      if(!record(q)||Object.keys(q).some(k=>!fields.includes(k))||fields.some(k=>!(k in q)))throw new GeminiProviderError('FORBIDDEN_FIELD');
      if(fields.filter(k=>k!=='options').some(k=>typeof q[k]!=='string'))throw new GeminiProviderError('MALFORMED_CANDIDATE');
      const index=profiles.findIndex((_,i)=>q.scopeKey===`scope-${i}`);
      if(index<0||q.family!==profiles[index].family)throw new GeminiProviderError('UNSUPPORTED_CONTEXT');
      const visualType=q.visualType as string;
      if(visualType!==profiles[index].visual)throw new GeminiProviderError('UNSUPPORTED_VISUAL');
      if(visualType==='none'&&(q.visualId!==''||q.visualAlt!==''||q.visualSpeech!==''))throw new GeminiProviderError('UNSUPPORTED_VISUAL');
      if(visualType!=='school-dialogue'&&q.visualSpeech!=='')throw new GeminiProviderError('MALFORMED_VISUAL');
      // Trusted scope binding is server-owned. Never repair the answer or the
      // descriptor claims; the existing visual/common/domain validators check them.
      return {scope:contexts[index],type:'multiple-choice',family:q.family,question:q.question,difficulty:q.difficulty,
        options:q.options,correctOptionId:q.correctOptionId,explanation:q.explanation,model:{},
        ...(visualType==='none'?{}:{visual:{kind:visualType,asset:q.visualId,alt:q.visualAlt,
          ...(visualType==='school-dialogue'?{speech:q.visualSpeech}:{})},visualPlacement:'above'})};
    });
  }
  return parseQuestionBatch(data,profile,count);
}
function parseQuestionBatch(data:Record<string,unknown>,profile:GeminiGenerationProfile,count:number):unknown[]{
  if(!Array.isArray(data.questions)||data.questions.length!==count)throw new GeminiProviderError('INVALID_BATCH');
  const questions=data.questions;
  if(profile.variants?.length){
    const profiles=[{...profile,variants:undefined},...profile.variants];
    if(count>=3 && profiles.some(p=>!questions.some(q=>record(q)&&q.family===p.family)))throw new GeminiProviderError('BATCH_DIVERSITY');
    return questions.flatMap(q=>{
      const p=record(q)?profiles.find(p=>p.family===q.family):undefined;
      if(!p)throw new GeminiProviderError('UNSUPPORTED_FAMILY');
      return parseQuestionBatch({questions:[q]},p,1);
    });
  }
  const allowed=['scope','type','difficulty','question','options','correctOptionId','explanation','family','model',...(profile.visual!=='none'?['visual','visualPlacement']:[])];
  return data.questions.map(q=>{
    if(!record(q)||Object.keys(q).some(k=>!allowed.includes(k)))throw new GeminiProviderError('FORBIDDEN_FIELD');
    if(profile.optionCount!==undefined&&(!Array.isArray(q.options)||q.options.length!==profile.optionCount||
      q.options.some(o=>!record(o)||!['a','b','c'].includes(String(o.id)))))throw new GeminiProviderError('INVALID_OPTIONS');
    if(profile.visual==='base-ten'){
      if(!record(q.visual)||q.visual.kind!=='base-ten')throw new GeminiProviderError('UNSUPPORTED_VISUAL');
      try{parseVisual(q.visual);}catch{throw new GeminiProviderError('MALFORMED_VISUAL');}
    }
    if(profile.visual.startsWith('school-')){
      if(!record(q.visual)||q.visual.kind!==profile.visual||q.visualPlacement!=='above')throw new GeminiProviderError('UNSUPPORTED_VISUAL');
      try{parseVisual(q.visual);}catch{throw new GeminiProviderError('MALFORMED_VISUAL');}
    }
    if(Array.isArray(q.options)&&q.options.some(o=>record(o)&&Object.keys(o).some(k=>!['id','text'].includes(k))))throw new GeminiProviderError('FORBIDDEN_OPTION_FIELD');
    return {...q,candidateId:randomUUID()};
  });
}
