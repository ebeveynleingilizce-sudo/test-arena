import { parsePresentation } from '../../visuals/contract.mjs';
import type { CandidateQuestion, CurriculumContext } from './contracts.js';
import { normalizeText, semantics, stableJSON } from './fingerprint.js';
import {schoolDialogueStemValid} from '../../visuals/school-life.mjs';

const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const exact = (v: Record<string, unknown>, allowed: string[]) => Object.keys(v).every(k => allowed.includes(k));
const safeText = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max &&
  !/<\/?[a-z!]|(?:https?:\/\/|javascript:|data:)|\b(?:eval\s*\(|function\s*\(|document\.|window\.)/i.test(v) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(v);
type CommonResult = { valid:true; candidate:CandidateQuestion } | { valid:false; code:string };
const candidateKeys = ['candidateId','scope','type','difficulty','question','options','correctOptionId','explanation','visual','visualPlacement','family','model'];
function jsonData(value:unknown, depth=0):boolean {
  if (depth>20) return false;
  if (value===null || typeof value==='boolean') return true;
  if (typeof value==='string') return value.length<=10000 && !/<\/?[a-z!]|https?:\/\/|javascript:|data:/i.test(value);
  if (typeof value==='number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length<=100 && value.every(v=>jsonData(v,depth+1));
  return record(value) && Object.keys(value).length<=40 && Object.entries(value).every(([k,v])=>!['__proto__','constructor','prototype'].includes(k)&&jsonData(v,depth+1));
}

export function validateCommon(context: CurriculumContext, raw: unknown): CommonResult {
  try {
    if (!record(raw) || !exact(raw,candidateKeys) || !jsonData(raw)) return {valid:false,code:'SCHEMA'};
    // Copy JSON first: do not let a provider retain mutable references to accepted data.
    const serialized = JSON.stringify(raw);
    if (!serialized || serialized.length > 30000) return {valid:false,code:'SCHEMA'};
    const c: unknown = JSON.parse(serialized);
    if (!record(c) || !exact(c,candidateKeys) ||
        !safeText(c.candidateId,128) || !/^[A-Za-z0-9_-]+$/.test(String(c.candidateId)) ||
        !record(c.scope) || stableJSON(c.scope) !== stableJSON(context)) return {valid:false,code:'SCHEMA_OR_SCOPE'};
    if (c.type !== 'multiple-choice' || !['easy','medium','hard'].includes(String(c.difficulty))) return {valid:false,code:'QUESTION_TYPE'};
    if (!safeText(c.question,10000) || !safeText(c.explanation,4000) || !safeText(c.family,100) || !record(c.model) || Object.keys(c.model).length > 20) return {valid:false,code:'UNSUPPORTED_CONTENT'};
    // Presentation policy for this generation family only. Reject, never strip
    // instructions or rewrite an untrusted stem; independent answer solving stays intact.
    if (c.family === 'SCHOOL_LIFE_DIALOGUE' && !schoolDialogueStemValid(c.question))
      return {valid:false,code:'DIALOGUE_STEM_FORMAT'};
    if (!Array.isArray(c.options) || ![3,4].includes(c.options.length)) return {valid:false,code:'OPTION_COUNT'};
    const ids = new Set<string>(), values = new Set<string>();
    for (const o of c.options) {
      if (!record(o) || !exact(o,['id','text','visual']) || !['a','b','c','d'].includes(String(o.id)) || ids.has(String(o.id)) ||
          typeof o.text !== 'string' || (o.text.trim() ? !safeText(o.text,4000) : !o.visual)) return {valid:false,code:'OPTIONS'};
      ids.add(String(o.id));
      const value = normalizeText(o.text);
      // Same visible text is duplicate even if a visual was added to one option.
      const key = value || stableJSON(semantics(o.visual));
      if (values.has(key)) return {valid:false,code:'DUPLICATE_OPTIONS'};
      values.add(key);
    }
    if (typeof c.correctOptionId !== 'string' || !ids.has(c.correctOptionId)) return {valid:false,code:'ANSWER_OPTION'};
    // This shared parser is the sole visual/presentation validator.
    const presentation = parsePresentation(c.question,c.options.map(o => ({choiceId:o.id,text:o.text,visual:o.visual})),c.visual,c.visualPlacement);
    if(presentation.visual?.kind==='school-dialogue' &&
      (c.family!=='SCHOOL_LIFE_DIALOGUE'||presentation.visual.speech!==presentation.questionText)) return {valid:false,code:'DIALOGUE_VISUAL_MISMATCH'};
    const candidate = { ...c, question:presentation.questionText,
      options:presentation.choices.map(o => ({id:o.choiceId,text:o.text,...(o.visual ? {visual:o.visual} : {})})),
      ...(presentation.visual ? {visual:presentation.visual} : {}) } as unknown as CandidateQuestion;
    return {valid:true,candidate};
  } catch { return {valid:false,code:'MALFORMED_PRESENTATION'}; }
}
