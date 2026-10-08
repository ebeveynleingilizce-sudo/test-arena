import { getFirestore, Timestamp, type DocumentReference, type Transaction, type DocumentData } from 'firebase-admin/firestore';

// Calendar conversion uses the named time zone, including its historical offsets.
export function arenaPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const number = (type: string) => Number(parts.find(p => p.type === type)!.value);
  const day = new Date(Date.UTC(number('year'), number('month') - 1, number('day')));
  const weekday = (day.getUTCDay() + 6) % 7;
  const monday = new Date(day.getTime() - weekday * 86400000);
  const thursday = new Date(monday.getTime() + 3 * 86400000);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(((thursday.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  const zonedMidnight = (localDate: number) => {
    let instant = localDate;
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    for (let i = 0; i < 3; i++) {
      const fields = formatter.formatToParts(new Date(instant));
      const n = (type: string) => Number(fields.find(p => p.type === type)!.value);
      const represented = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
      instant += localDate - represented;
    }
    return instant;
  };
  return { weekKey: `${year}-W${String(week).padStart(2, '0')}`, startsAt: zonedMidnight(monday.getTime()),
    endsAt: zonedMidnight(monday.getTime() + 7 * 86400000) };
}

export const arenaRow = (teacherUid: string, classId: string, studentId: string) =>
  getFirestore().doc(`teachers/${teacherUid}/classes/${classId}/leaderboard/${studentId}`);

export async function readProgress(tx: Transaction, root: DocumentReference, summary: DocumentData, now: Date) {
  const period = arenaPeriod(now), weekRef = root.collection('academicWeeks').doc(period.weekKey);
  const bucket = await tx.get(weekRef);
  let weeklyAcademicXP = bucket.data()?.academicXP ?? 0;
  // One-time M2 compatibility: all legacy XP was awarded from questions. Only
  // legacy records may reconstruct a missing bucket from immutable award dates.
  if (!bucket.exists && summary.academicXP === undefined && (summary.totalXP ?? 0) > 0) {
    const legacy = await tx.get(root.collection('awardedQuestions')
      .where('awardedAt', '>=', Timestamp.fromMillis(period.startsAt))
      .where('awardedAt', '<', Timestamp.fromMillis(period.endsAt)));
    weeklyAcademicXP = legacy.docs.reduce((sum, doc) => sum + (doc.data().xp === 1 ? 1 : 0), 0);
  }
  return { period, weekRef, academicXP: summary.academicXP ?? summary.totalXP ?? 0, weeklyAcademicXP };
}

export function publicArenaRow(student: DocumentData, academicXP: number, weeklyAcademicXP: number, weekKey: string) {
  return { studentId: student.studentId, classId: student.classId,
    displayName: `${student.firstName} ${student.lastName}`.trim(), academicXP, weeklyAcademicXP, weekKey };
}
