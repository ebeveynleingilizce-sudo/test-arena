import type { QuestionVisual } from '../../visuals/contract.mjs';
import type {EnglishPedagogyPolicy,PedagogyCheck} from './english-pedagogy.js';

export interface CurriculumScope {
  grade: number;
  subjectId: string;
  unitId?: string;
  themeId?: string;
  topicId?: string;
  subthemeId?: string;
  outcomeCode: string;
}
export interface CurriculumContext extends CurriculumScope {
  outcomeText: string;
  navigationModel: string;
  curriculumVersion: string;
  datasetId: string;
}
// Candidates contain no trust, publication or approval fields.
export interface CandidateQuestion {
  candidateId: string;
  scope: CurriculumContext;
  type: 'multiple-choice';
  difficulty: 'easy' | 'medium' | 'hard';
  question: string;
  options: { id: string; text: string; visual?: QuestionVisual }[];
  correctOptionId: string;
  explanation: string;
  visual?: QuestionVisual;
  visualPlacement?: 'above' | 'below';
  family: string;
  model: Record<string, unknown>;
}
export interface GenerationRequest { count: number }
export interface QuestionProvider {
  readonly id: string;
  // Output remains untrusted even when a deterministic provider is used.
  generateQuestions(context: CurriculumContext, request: GenerationRequest): Promise<unknown[]>;
}
export interface GradeLevelPolicy {
  language:string; readingLevel:string; maxQuestionLength:number; maxOptionLength:number;
}
// A separate blind solve: never contains the generator's key, explanation,
// model, candidate ID, user history or an approval request.
export interface VerificationInput {
  curriculum:CurriculumContext;
  gradePolicy:GradeLevelPolicy;
  question:string;
  options:{id:string;text:string;visual?:unknown}[];
  visual?:unknown;
  pedagogy?:{family:string;policy:EnglishPedagogyPolicy;needsSemanticStemReview:boolean};
}
export interface VerificationEvidence {
  selectedOptionId:string|null;
  justification:string;
  hasSingleCorrectAnswer:boolean;
  curriculumAligned:boolean;
  gradeAppropriate:boolean;
  factuallySound:boolean;
  questionClear:boolean;
  visualConsistent:boolean;
  confidence:number;
  issues:string[];
}
export type EnglishVerificationEvidence=VerificationEvidence & Partial<Record<PedagogyCheck,boolean>>;
export interface QuestionVerifier {
  readonly id:string;
  // Structured model output remains untrusted until the server quality gate.
  verify(input:VerificationInput):Promise<unknown>;
}
export type Stage = 'context' | 'provider' | 'common' | 'domain' | 'quality';
export interface ValidationIssue { stage: Stage; code: string }
export type DomainResult = { valid: true; solvedOptionId: string } | { valid: false; code: string };
export interface DomainValidator {
  readonly capability: string;
  supports(context: CurriculumContext): boolean;
  validate(candidate: CandidateQuestion, context: CurriculumContext): DomainResult;
}
export interface Fingerprints { content: string; structural: string }
export type ValidationResult =
  | { decision: 'ACCEPT'; dryRun: true; fingerprints: Fingerprints; solvedOptionId: string }
  | { decision: 'REJECT'; dryRun: true; issues: ValidationIssue[] };
