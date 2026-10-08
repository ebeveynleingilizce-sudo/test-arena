import {resolveEnglishPedagogy} from '../english-pedagogy.js';
import type { CurriculumContext, GenerationRequest, QuestionProvider } from '../contracts.js';
import { isResolvedContext } from '../curriculum.js';
import {schoolPlaces,schoolPeople,schoolVisualAlt} from '../../../visuals/school-life.mjs';
import { GeminiProviderError, parseGeminiResponse, responseSchema, type GeminiGenerationProfile, type GeminiErrorDetails } from './gemini-contract.js';

export const DEFAULT_GEMINI_MODEL='gemini-3.5-flash-lite';
export interface GeminiMetrics {
  generatedCount:number; latencyMs:number;
  inputTokens:number|null; outputTokens:number|null; thinkingTokens:number|null; totalTokens:number|null;
  errorCode?:string; errorDetails?:Readonly<GeminiErrorDetails>;
}
interface GeminiOptions { model?:string; timeoutMs?:number; getApiKey?:()=>string|undefined; fetch?:typeof fetch; contexts?:readonly CurriculumContext[] }
const token=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=0?v:null;
async function httpError(response:Response):Promise<GeminiProviderError>{
  const details:GeminiErrorDetails={httpStatus:response.status};
  // Inspect only to classify; remote messages/bodies may contain secrets and
  // must never become error text, metrics or refill output.
  try {
    const text=await response.text();
    if(text.length<=250000){
      const error=JSON.parse(text)?.error;
      const statuses=['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','RESOURCE_EXHAUSTED','NOT_FOUND','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED'];
      if(statuses.includes(error?.status))details.apiStatus=error.status;
      if(response.status===400&&typeof error?.message==='string'&&/response[_ ]?json[_ ]?schema|response[_ ]?schema|generation_config\.response|json schema/i.test(error.message))details.reason='SCHEMA_REJECTED';
      if(response.status===400&&typeof error?.message==='string'){
        if(/too many states|schema.{0,40}too (?:complex|large)|schema complexity/i.test(error.message))details.reason='SCHEMA_COMPLEXITY';
        else if(/unsupported (?:schema )?(?:keyword|field)|unknown name/i.test(error.message))details.reason='UNSUPPORTED_SCHEMA_KEYWORD';
        else if(/invalid (?:schema )?type|expected (?:an? )?(?:object|array|string|integer|boolean)/i.test(error.message))details.reason='INVALID_SCHEMA_TYPE';
      }
      // Only Google's field paths made exclusively of known request/schema
      // tokens may leave this boundary. Never copy descriptions or messages.
      const allowed=new Set(['generation_config','generationConfig','response_json_schema','responseJsonSchema','response_schema','responseSchema',
        'response_mime_type','responseMimeType','candidate_count','candidateCount','max_output_tokens','maxOutputTokens','properties','items',
        'questions','scope','grade','subjectId','unitId','themeId','topicId','subthemeId','outcomeCode','outcomeText','navigationModel','curriculumVersion','datasetId',
        'visual','kind','asset','alt','speech','visualPlacement','family','model','question','options','id','text','correctOptionId','explanation','difficulty',
        'type','enum','required','additionalProperties','propertyOrdering','anyOf','oneOf','nullable','minLength','maxLength','minItems','maxItems','minimum','maximum']);
      if(response.status===400&&Array.isArray(error?.details)){
        const fields:string[]=error.details.filter((d:Record<string,unknown>)=>d?.['@type']==='type.googleapis.com/google.rpc.BadRequest')
          .flatMap((d:Record<string,unknown>)=>Array.isArray(d.fieldViolations)?d.fieldViolations:[])
          .map((v:Record<string,unknown>)=>v?.field).filter((field:unknown):field is string=>typeof field==='string'&&field.length<=400&&
            /^(?:generation_config|generationConfig)\./.test(field)&&/^[a-zA-Z0-9_.\[\]"]+$/.test(field)&&
            (field.match(/[a-zA-Z_][a-zA-Z0-9_]*|\d+/g)??[]).every(t=>allowed.has(t)||/^\d{1,3}$/.test(t)));
        if(fields.length)details.requestFields=Object.freeze([...new Set(fields)].slice(0,8));
      }
      if(response.status===400&&error&&typeof error==='object'&&!Array.isArray(error)){
        const entries=Array.isArray(error.details)?error.details:[];
        const badRequests=entries.filter((d:Record<string,unknown>)=>d?.['@type']==='type.googleapis.com/google.rpc.BadRequest');
        const violations=badRequests.flatMap((d:Record<string,unknown>)=>Array.isArray(d.fieldViolations)?d.fieldViolations:[]);
        // Presence/count metadata distinguishes absent remote details from
        // details discarded by the field-path whitelist. Do not invent reasons.
        if(!details.reason&&!details.requestFields)details.diagnostics=Object.freeze({
          messagePresent:typeof error.message==='string'&&error.message.length>0,
          detailCount:entries.length,badRequestCount:badRequests.length,fieldViolationCount:violations.length,
          filteredFieldCount:violations.filter((v:Record<string,unknown>)=>typeof v?.field==='string').length
        });
      }
    }
  }catch {/* HTTP status remains useful even with an unreadable remote body. */}
  return new GeminiProviderError(response.status===429?'RATE_LIMIT':response.status===401||response.status===403?'AUTH_ERROR':'HTTP_ERROR',Object.freeze(details));
}
export class GeminiProvider implements QuestionProvider {
  readonly id='gemini';
  readonly model:string;
  private readonly timeoutMs:number;
  private readonly transport:typeof fetch;
  private readonly key:()=>string|undefined;
  private metrics:Readonly<GeminiMetrics>|undefined;
  get lastRun(){return this.metrics;}
  constructor(private readonly profile:GeminiGenerationProfile, private readonly options:GeminiOptions={}){
    this.model=options.model??process.env.GEMINI_MODEL??DEFAULT_GEMINI_MODEL;
    this.timeoutMs=options.timeoutMs??30000;
    if(!/^[a-zA-Z0-9.-]{1,80}$/.test(this.model)||!Number.isInteger(this.timeoutMs)||this.timeoutMs<10||this.timeoutMs>60000)throw new GeminiProviderError('INVALID_CONFIGURATION');
    this.transport=options.fetch??fetch;
    this.key=options.getApiKey??(()=>process.env.GEMINI_API_KEY);
  }
  async generateQuestions(context:CurriculumContext, request:GenerationRequest):Promise<unknown[]>{
    const start=performance.now(),metrics:GeminiMetrics={generatedCount:0,latencyMs:0,inputTokens:null,outputTokens:null,thinkingTokens:null,totalTokens:null};
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      if(!isResolvedContext(context)||Object.entries(this.profile.scope).some(([k,v])=>context[k as keyof CurriculumContext]!==v))throw new GeminiProviderError('UNSUPPORTED_CONTEXT');
      if(!Number.isInteger(request.count)||request.count<1||request.count>5||Object.keys(request).some(k=>k!=='count'))throw new GeminiProviderError('INVALID_REQUEST');
      const apiKey=this.key()?.trim();if(!apiKey)throw new GeminiProviderError('MISSING_API_KEY');
      // Explicit whitelist: no student, teacher, class, user prompt or history payload.
      const curriculum={grade:context.grade,subjectId:context.subjectId,
        ...(context.unitId?{unitId:context.unitId}:{}),...(context.themeId?{themeId:context.themeId}:{}),
        ...(context.topicId?{topicId:context.topicId}:{}),...(context.subthemeId?{subthemeId:context.subthemeId}:{}),
        outcomeCode:context.outcomeCode,outcomeText:context.outcomeText,navigationModel:context.navigationModel,
        curriculumVersion:context.curriculumVersion,datasetId:context.datasetId};
      const body={
        systemInstruction:{parts:[{text:'Generate untrusted educational question candidates, never approval decisions. Return only structured JSON. Echo the exact canonical scope; do not invent curriculum links. No HTML, SVG, CSS, JavaScript, URLs, tools, persistent IDs or personal data.'}]},
        contents:[{role:'user',parts:[{text:JSON.stringify({curriculum,gradePolicy:this.profile.gradePolicy,count:request.count,
          ...(this.profile.gradePolicy.language==='en'?{responseContract:'Return scopeKey, family, question, difficulty, options (id/text), correctOptionId, explanation, visualType, visualId, visualAlt, visualSpeech. No scope/type/model/visual object. Use exactly the supplied scopeKey/family pairing. Use visualType none and empty visualId/visualAlt/visualSpeech for text questions. Otherwise copy the allowed descriptor kind into visualType, asset into visualId, alt into visualAlt, and dialogue speech into visualSpeech; empty speech for other visuals.',
            pedagogyPolicies:[this.profile,...(this.profile.variants??[])].map((p,i)=>{const policy=resolveEnglishPedagogy((this.options.contexts??[context])[i],p.family);if(!policy)throw new GeminiProviderError('UNSUPPORTED_PEDAGOGY_SCOPE');return policy;}),
            scopeBindings:[this.profile,...(this.profile.variants??[])].map((p,i)=>({scopeKey:`scope-${i}`,family:p.family,curriculum:(this.options.contexts??[context])[i],visualType:p.visual})),
            visualDescriptors:[this.profile,...(this.profile.variants??[])].flatMap(p=>{
              const assets=p.visual==='school-dialogue'?['two-pupils']:p.visual==='school-place'?schoolPlaces:p.visual==='school-person'?schoolPeople:[];
              return assets.map(asset=>({visualType:p.visual,visualId:asset,visualAlt:schoolVisualAlt[asset]}));
            }),
            languagePolicy:'Keep learned short target utterances in English. If level-appropriate meta-instructions are needed by the supplied family, they may be Turkish. Never add instructions to SCHOOL_LIFE_DIALOGUE stems.'}:{ }),
          family:this.profile.family,generationRules:this.profile.generationRules,allowedVisualCapabilities:this.profile.visual==='none'?[]:[this.profile.visual],
          ...(this.profile.variants?.length?{variants:[{family:this.profile.family,curriculum:context,visual:this.profile.visual},...this.profile.variants.map((p,i)=>({family:p.family,curriculum:this.options.contexts?.[i+1],visual:p.visual,generationRules:p.generationRules}))],
            batchDiversity:this.profile.batchDiversity??'For 5 candidates: 2 visual dialogues, 1 school place, 1 school person, 1 different visual dialogue. Include every supplied family; never five copies of one purpose.'}:{})})}]}],
        generationConfig:{responseMimeType:'application/json',responseJsonSchema:responseSchema(context,this.profile,request.count,this.options.contexts),
          candidateCount:1,maxOutputTokens:8192}
      };
      const task=(async()=>{
        const response=await this.transport(`https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,{
          method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body),signal:controller.signal});
        if(!response.ok)throw await httpError(response);
        const text=await response.text();if(text.length>250000)throw new GeminiProviderError('OVERSIZED_RESPONSE');
        let payload:Record<string,unknown>;try{payload=JSON.parse(text);}catch{throw new GeminiProviderError('MALFORMED_RESPONSE');}
        const usage=payload?.usageMetadata as Record<string,unknown>|undefined;
        metrics.inputTokens=token(usage?.promptTokenCount);metrics.outputTokens=token(usage?.candidatesTokenCount);
        metrics.thinkingTokens=token(usage?.thoughtsTokenCount);metrics.totalTokens=token(usage?.totalTokenCount);
        const candidates=parseGeminiResponse(payload,this.profile,request.count,this.options.contexts??[context]);metrics.generatedCount=candidates.length;return candidates;
      })();
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new GeminiProviderError('TIMEOUT'));},this.timeoutMs);});
      return await Promise.race([task,timeout]);
    }catch(error){
      // Never leak remote bodies, key, request payload or network exception messages.
      const safe=error instanceof GeminiProviderError?error:new GeminiProviderError(controller.signal.aborted?'TIMEOUT':'PROVIDER_ERROR');
      metrics.errorCode=safe.code;if(Object.keys(safe.details).length)metrics.errorDetails=safe.details;throw safe;
    }finally{
      if(timer)clearTimeout(timer);metrics.latencyMs=Math.round(performance.now()-start);this.metrics=Object.freeze({...metrics});
    }
  }
}
