import type { CandidateQuestion, CurriculumContext, DomainValidator, GenerationRequest, QuestionProvider } from '../contracts.js';
import { stableJSON } from '../fingerprint.js';

export const BASE_TEN_TO_NUMBER = 'BASE_TEN_TO_NUMBER';
export const BASE_TEN_CAPABILITY = 'base-ten-to-number@1';
export const baseTenQuestion = 'Görseldeki onluk ve birliklerin gösterdiği sayı kaçtır?';
export const baseTenExplanation = (tens:number,ones:number) => `${tens} × 10 + ${ones} = ${tens*10+ones}`;

// Verify bounded arithmetic claims, not a provider's preferred wording. Every
// clause must be understood and true; unknown prose and negations fail closed.
function verifiesBaseTenExplanation(explanation:string, tens:number, ones:number):boolean {
  const words:Record<string,number> = {sıfır:0,bir:1,iki:2,üç:3,dört:4,beş:5,altı:6,yedi:7,sekiz:8,dokuz:9,
    on:10,yirmi:20,otuz:30,kırk:40,elli:50,altmış:60,yetmiş:70,seksen:80,doksan:90};
  const wordPattern = Object.keys(words).join('|');
  const normalized = explanation.normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/[’]/g,"'")
    .replace(new RegExp(`(?<![\\p{L}\\p{N}])(${wordPattern})(?:\\s+(${wordPattern}))?(?![\\p{L}\\p{N}])`,'gu'),
      (match:string,first:string,second:string|undefined)=> {
        const a=words[first], b=second===undefined?undefined:words[second];
        if(b===undefined) return String(a);
        return a>=10 && b>0 && b<10 ? String(a+b) : match;
      })
    .replace(/([0-9]+)'(?:dır|dir|dur|dür|tır|tir|tur|tür)(?!\p{L})/gu,'$1');
  const clauses=normalized.split(/[.;,]/).map(clause=>clause.trim().replace(/\s+/g,' '));
  // Allow one terminal punctuation mark, but not empty assertions inside prose.
  if(clauses.at(-1)==='') clauses.pop();
  const total=tens*10+ones;
  let hasResult=false;
  for(const clause of clauses) {
    let match:RegExpMatchArray|null;
    if((match=clause.match(/^(\d+)\s*[×x*]\s*10\s*\+\s*(\d+)\s*=\s*(\d+)$/))) {
      if(Number(match[1])!==tens||Number(match[2])!==ones||Number(match[3])!==total) return false;
      hasResult=true;
    } else if((match=clause.match(/^(\d+)\s*\+\s*(\d+)\s*=\s*(\d+)$/))) {
      if(!((Number(match[1])===10*tens&&Number(match[2])===ones)||
          (Number(match[2])===10*tens&&Number(match[1])===ones))||Number(match[3])!==total) return false;
      hasResult=true;
    } else if((match=clause.match(/^(\d+) onluk ve (\d+) birlik\s*(?:=\s*)?(\d+)(?: (?:eder|olur))?$/))) {
      if(Number(match[1])!==tens||Number(match[2])!==ones||Number(match[3])!==total) return false;
      hasResult=true;
    } else if((match=clause.match(/^(\d+) (onluk|birlik)\s*(?:=\s*)?(\d+)(?: (?:eder|olur))?$/))) {
      const expected=match[2]==='onluk'?tens:ones;
      if(Number(match[1])!==expected||Number(match[3])!==expected*(match[2]==='onluk'?10:1)) return false;
    } else if((match=clause.match(/^toplam\s*[:=]?\s*(\d+)(?: (?:eder|olur))?$/))) {
      if(Number(match[1])!==total) return false;
      hasResult=true;
    } else return false;
  }
  return hasResult;
}

// Fixture provider only; no production bank, transport or persistent storage.
export class BaseTenFixtureProvider implements QuestionProvider {
  readonly id = 'deterministic-base-ten-fixture';
  constructor(private readonly samples: readonly {tens:number;ones:number}[] = [{tens:3,ones:7}]) {}
  async generateQuestions(context:CurriculumContext, request:GenerationRequest):Promise<CandidateQuestion[]> {
    if (request.count > this.samples.length) throw new Error('INSUFFICIENT_FIXTURE_SAMPLES');
    return this.samples.slice(0,request.count).map(({tens,ones},i)=>{
      if (!Number.isInteger(tens)||!Number.isInteger(ones)||tens<0||tens>9||ones<0||ones>9) throw new Error('INVALID_FIXTURE');
      const correct=tens*10+ones;
      const values=[correct,(correct+1)%100,(correct+10)%100];
      return {candidateId:'fixture-base-ten-'+i,scope:{...context},type:'multiple-choice',difficulty:'easy',
        question:baseTenQuestion,options:values.map((v,j)=>({id:['a','b','c'][j],text:String(v)})),correctOptionId:'a',
        explanation:baseTenExplanation(tens,ones),visual:{kind:'base-ten',tens,ones,alt:`${tens} onluk çubuk ve ${ones} birlik kare.`},
        visualPlacement:'above',family:BASE_TEN_TO_NUMBER,model:{tens,ones}};
    });
  }
}
// Exact scope bindings supplied by the caller's trusted config; no subject checks in core.
export function baseTenValidator(allowedContexts: readonly CurriculumContext[]):DomainValidator {
  const bindings = new Set(allowedContexts.map(stableJSON));
  return {
    capability:BASE_TEN_CAPABILITY,
    supports:context=>bindings.has(stableJSON(context)),
    validate(candidate) {
      const m=candidate.model, t=m.tens, o=m.ones;
      if (candidate.family!==BASE_TEN_TO_NUMBER || Object.keys(m).sort().join(',')!=='ones,tens' ||
          typeof t!=='number'||typeof o!=='number'||!Number.isInteger(t)||!Number.isInteger(o)||t<0||t>9||o<0||o>9) return {valid:false,code:'MODEL'};
      const v=candidate.visual;
      if (!v||v.kind!=='base-ten'||v.tens!==t||v.ones!==o||v.alt!==`${t} onluk çubuk ve ${o} birlik kare.` ||
          candidate.options.some(option=>option.visual)||candidate.question!==baseTenQuestion) return {valid:false,code:'MODEL_PRESENTATION_MISMATCH'};
      // Recompute from the displayed blocks, never trust the provider's answer key.
      const value=10*v.tens+v.ones;
      if (candidate.options.some(option=>!/^(0|[1-9][0-9]?)$/.test(option.text))) return {valid:false,code:'NUMERIC_OPTIONS'};
      const matches=candidate.options.filter(option=>Number(option.text)===value);
      if(matches.length!==1) return {valid:false,code:'NO_UNIQUE_SOLUTION'};
      if(matches[0].id!==candidate.correctOptionId) return {valid:false,code:'ANSWER_MISMATCH'};
      if(!verifiesBaseTenExplanation(candidate.explanation,t,o)) return {valid:false,code:'EXPLANATION_MISMATCH'};
      return {valid:true,solvedOptionId:matches[0].id};
    }
  };
}
