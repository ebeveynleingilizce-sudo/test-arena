import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { arenaPeriod, readProgress } from './arena-store.js';
import { supportSignals, add, zero, readAnalytics, writeAnalytics, currentSummary, type Summary, type Dimension, type AnalyticsPlan } from './analytics-store.js';
interface ReportStudent extends Summary { studentId: string; displayName: string; classId: string; className: string; gradeLevel: number; academicXP: number; weeklyAcademicXP: number; overallRank: number; weeklyRank: number; signals: string[]; createdAt: number | null }

export const teacherAnalytics = onCall({ region: 'europe-west1', minInstances: 0, maxInstances: 3,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' }, async request => {
  if (!request.auth || !['password', 'google.com'].includes(String(request.auth.token.firebase?.sign_in_provider))) {
    throw new HttpsError('permission-denied', 'Öğretmen girişi gerekli.');
  }
  const data = request.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(k => !['classId', 'studentId'].includes(k))
    || Object.values(data).some(v => typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v))) {
    throw new HttpsError('invalid-argument', 'Geçersiz filtre.');
  }
  const db = getFirestore(), root = db.doc(`teachers/${request.auth.uid}`), now = new Date();
  const rosterQuery = root.collection('students').where('status', '==', 'active').limit(2001);
  return db.runTransaction(async tx => {
    const [classDocs, studentDocs] = await Promise.all([tx.get(root.collection('classes')), tx.get(rosterQuery)]);
    if (studentDocs.size > 2000) throw new HttpsError('resource-exhausted', 'Sayfalı raporlama gerekli.');
    if (data.classId && !classDocs.docs.some(c => c.id === data.classId)) throw new HttpsError('not-found', 'Sınıf bulunamadı.');
    if (data.studentId && !studentDocs.docs.some(s => s.id === data.studentId)) throw new HttpsError('not-found', 'Öğrenci bulunamadı.');
    const summaries = studentDocs.empty ? [] : await tx.getAll(...studentDocs.docs.map(s => s.ref.collection('analytics').doc('summary')));
    const learning = studentDocs.empty ? [] : await tx.getAll(...studentDocs.docs.map(s => s.ref.collection('learning').doc('summary')));
    const period = arenaPeriod(now);
    const initialized = new Map<string, AnalyticsPlan>();
    const students: ReportStudent[] = [];
    for (let i = 0; i < studentDocs.size; i++) {
      const s = studentDocs.docs[i], p = await readProgress(tx, s.ref, learning[i].data() || {}, now);
      if (!summaries[i].exists || summaries[i].data()!.version !== 2) initialized.set(s.id, await readAnalytics(tx, s.ref, now));
      const summary = currentSummary(initialized.get(s.id)?.summary ?? summaries[i].data() as Summary, now), student = s.data();
      students.push({ studentId: s.id, displayName: `${student.firstName} ${student.lastName}`.trim(),
        classId: student.classId, className: student.className, gradeLevel: student.gradeLevel,
        createdAt: student.createdAt?.toMillis() ?? null,
        ...summary, academicXP: p.academicXP, weeklyAcademicXP: p.weeklyAcademicXP,
        overallRank: 0, weeklyRank: 0, signals: [] as string[] });
    }
    const classes = classDocs.docs.map(c => {
      const members = students.filter(s => s.classId === c.id);
      for (const [field, rankField] of [['academicXP', 'overallRank'], ['weeklyAcademicXP', 'weeklyRank']] as const) {
        const sorted = [...members].sort((a, b) => b[field] - a[field] || (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0));
        let rank = 0;
        sorted.forEach((s, i) => { if (!i || s[field] !== sorted[i - 1][field]) rank = i + 1; s[rankField] = rank; });
      }
      const volumes = members.map(s => s.weekly.solved);
      members.forEach(s => { s.signals = supportSignals(s, volumes, now); });
      return { classId: c.id, className: c.data().className, defaultGradeLevel: c.data().defaultGradeLevel,
        studentCount: members.length, overall: members.reduce((a,s) => add(a,s.overall), zero()),
        weekly: members.reduce((a,s) => add(a,s.weekly), zero()),
        academicXP: members.reduce((a,s) => a+s.academicXP,0), weeklyAcademicXP: members.reduce((a,s) => a+s.weeklyAcademicXP,0) };
    });
    const selected = students.filter(s => (!data.classId || s.classId === data.classId) && (!data.studentId || s.studentId === data.studentId));
    const dimensions = new Map<string, Dimension>();
    if (data.classId || data.studentId) {
      for (const s of selected) {
        const plan = initialized.get(s.studentId);
        const values = plan ? [...plan.dimensions] : (await tx.get(root.collection('students').doc(s.studentId).collection('analyticsDimensions'))).docs.map(d => [d.id, d.data() as Dimension] as const);
        for (const [key, data] of values) {
          const value = currentSummary(data, now) as Dimension, old = dimensions.get(key);
          dimensions.set(key, old ? { ...old, overall: add(old.overall, value.overall), weekly: add(old.weekly, value.weekly) } : value);
        }
      }
    }
    // All reads precede migration writes; canonical answers are read only once
    // for pre-M5 students, atomically with any concurrent submissions.
    initialized.forEach((plan, sid) => writeAnalytics(tx, root.collection('students').doc(sid), plan));
    return { weekKey: period.weekKey, serverNow: now.getTime(), classes, students,
      totals: { classCount: classes.length, studentCount: students.length,
        overall: students.reduce((a,s) => add(a,s.overall), zero()), weekly: students.reduce((a,s) => add(a,s.weekly), zero()),
        academicXP: students.reduce((a,s) => a+s.academicXP,0), weeklyAcademicXP: students.reduce((a,s) => a+s.weeklyAcademicXP,0) },
      dimensions: [...dimensions.values()] };
  });
});
