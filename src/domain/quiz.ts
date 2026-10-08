import type {QuestionVisual,VisualChoice} from '../../functions/visuals/contract.mjs';
export interface Question { questionId: string; questionText: string; content?: string; visual?: QuestionVisual; visualPlacement?: "above"|"below"; choices: VisualChoice[] }
export interface Quiz { packId?: string; packName?: string; navigationVersion?: number; contentBank?: 'fixture' | 'curriculum'; mode?: 'topic' | 'mixed'; unitId?: string | null; unitName?: string | null; testSessionId: string; gradeLevel: number; subject: string; subjectName: string; topic: string; topicName: string; questionCount: number; questions: Question[]; answeredQuestionIds: string[]; correctCount: number; wrongCount: number; earnedXP: number; status: 'active' | 'completed'; startedAt: number; completedAt: number | null }
export interface Catalog { fixture?: boolean; curricula?: { grade: number; subjects: CurriculumSubject[] }[]; allowedGrades: number[]; entries: { gradeLevel: number; subject: string; subjectName: string; topic: string; topicName: string; count: number }[] }
export interface AnswerResult { answer: { questionId: string; selectedChoiceId: string; isCorrect: boolean; earnedXP: number; correctChoiceId: string; explanation: string }; test: Quiz; totalXP: number }

export interface TestPack { id: string; name: string; count: number }
export interface CurriculumTopic { packs: TestPack[]; id: string; name: string; count: number }
export interface CurriculumUnit { displayName: string; count: number; packs: TestPack[]; id: string; name: string; topics: CurriculumTopic[] }
export interface CurriculumSubject { navigationModel: string; sectionLabel: string; id: string; name: string; count: number; units: CurriculumUnit[] }
