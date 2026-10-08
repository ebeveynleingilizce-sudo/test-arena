import type { CurriculumContext, CurriculumScope } from './contracts.js';

type Node = { id: string; name?: string; outcomes?: { code: string; text: string }[]; topics?: Node[]; subthemes?: Node[] };
export interface CanonicalCurriculum {
  grade: number; schema_version: string; dataset_id: string;
  subjects: { id: string; units?: Node[]; themes?: Node[]; skill_domains?: Node[] }[];
}
export interface CurriculumNavigation {
  grade: number; sourceDatasetId: string;
  subjects: { id: string; navigationModel: string; units: Node[] }[];
}
const contexts = new WeakSet<object>();
export const isResolvedContext = (value: unknown): value is CurriculumContext =>
  !!value && typeof value === 'object' && contexts.has(value);

// Pure adapter: caller supplies local canonical data; no database or publication.
// An outcome-code list alone is not a precise topic/outcome link or outcome text.
export function resolveCurriculumContext(canonical: CanonicalCurriculum, navigation: CurriculumNavigation,
  scope: CurriculumScope): CurriculumContext {
  if (!Number.isInteger(scope.grade) || scope.grade < 2 || scope.grade > 12 || scope.grade !== canonical.grade ||
      navigation.grade !== canonical.grade || navigation.sourceDatasetId !== canonical.dataset_id ||
      !canonical.dataset_id || !canonical.schema_version ||
      Object.keys(scope).some(k => !['grade','subjectId','unitId','themeId','topicId','subthemeId','outcomeCode'].includes(k)) ||
      !scope.subjectId || !scope.outcomeCode || (!scope.unitId && !scope.themeId) || (scope.topicId && scope.subthemeId)) {
    throw new Error('INVALID_CURRICULUM_SCOPE');
  }
  const subject = canonical.subjects.filter(s => s.id === scope.subjectId);
  const nav = navigation.subjects.filter(s => s.id === scope.subjectId);
  if (subject.length !== 1 || nav.length !== 1 || !nav[0].navigationModel) throw new Error('UNKNOWN_SUBJECT');
  if (scope.unitId && scope.themeId && scope.unitId !== scope.themeId && nav[0].navigationModel !== 'theme-test') throw new Error('CONFLICTING_UNIT_THEME');
  const s = subject[0], nodes = [...(s.units || []), ...(s.themes || []), ...(s.skill_domains || [])];
  const unit = nodes.filter(n => n.id === (scope.unitId || scope.themeId));
  if (unit.length !== 1) throw new Error('UNKNOWN_UNIT');
  if (scope.themeId && (s.themes || []).filter(t => t.id === scope.themeId).length !== 1) throw new Error('UNKNOWN_THEME');
  const displayUnit = nav[0].units.filter(n => n.id === (scope.themeId || scope.unitId));
  if (displayUnit.length !== 1) throw new Error('UNKNOWN_NAVIGATION_UNIT');
  const childId = scope.topicId || scope.subthemeId;
  const children = scope.subthemeId ? unit[0].subthemes : unit[0].topics;
  const child = childId ? (children || []).filter(t => t.id === childId) : [];
  if (childId && child.length !== 1) throw new Error('UNKNOWN_TOPIC');
  if (childId && nav[0].navigationModel !== 'theme-test' &&
      !(displayUnit[0].topics || displayUnit[0].subthemes || []).some(t => t.id === childId)) throw new Error('UNKNOWN_NAVIGATION_TOPIC');
  const outcomes = (childId ? child[0] : unit[0]).outcomes || [];
  const exact = outcomes.filter(o => o.code === scope.outcomeCode && typeof o.text === 'string' && o.text.trim());
  if (exact.length !== 1) throw new Error('NO_EXACT_OUTCOME');
  const context: CurriculumContext = Object.freeze({ ...scope, outcomeText: exact[0].text,
    navigationModel: nav[0].navigationModel, curriculumVersion: canonical.schema_version, datasetId: canonical.dataset_id });
  contexts.add(context);
  return context;
}
