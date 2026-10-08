export interface Counts { solved: number; correct: number; wrong: number }
export type Period = 'overall' | 'weekly';
export interface Performance { overall: Counts; weekly: Counts; academicXP: number; weeklyAcademicXP: number }
export interface AnalyticsStudent extends Performance { studentId: string; displayName: string; classId: string; className: string; gradeLevel: number; overallRank: number; weeklyRank: number; signals: string[]; lastAnswerAt: number | null }
export interface AnalyticsClass extends Performance { classId: string; className: string; defaultGradeLevel: number; studentCount: number }
export interface Dimension { kind: 'subject' | 'topic' | 'unit'; unitId?: string; unitName?: string; gradeLevel: number; subject: string; subjectName: string; topic?: string; topicName?: string; overall: Counts; weekly: Counts }
export interface AnalyticsReport { weekKey: string; serverNow: number; classes: AnalyticsClass[]; students: AnalyticsStudent[]; totals: Performance & { classCount: number; studentCount: number }; dimensions: Dimension[] }
export const percent = (counts: Counts) => counts.solved ? `%${Math.round(counts.correct / counts.solved * 100)}` : 'Henüz veri yok';
export const number = (value: number) => value.toLocaleString('tr-TR');
export function sortStudents(students: AnalyticsStudent[], sort: string, period: Period) {
  return [...students].sort((a,b) => {
    const x = a[period], y = b[period];
    const rateA = x.solved ? x.correct / x.solved : null, rateB = y.solved ? y.correct / y.solved : null;
    let order = 0;
    if (sort === 'most') order = y.solved - x.solved;
    if (sort === 'least') order = x.solved - y.solved;
    if (sort === 'high' || sort === 'low') order = rateA === null ? (rateB === null ? 0 : 1) : rateB === null ? -1 : (sort === 'high' ? rateB-rateA : rateA-rateB);
    if (sort === 'xp') order = period === 'overall' ? b.academicXP-a.academicXP : b.weeklyAcademicXP-a.weeklyAcademicXP;
    if (sort === 'arena') order = period === 'overall' ? a.overallRank-b.overallRank : a.weeklyRank-b.weeklyRank;
    return order || a.displayName.localeCompare(b.displayName, 'tr') || a.studentId.localeCompare(b.studentId);
  });
}
