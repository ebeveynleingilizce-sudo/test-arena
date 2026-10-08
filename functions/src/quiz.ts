import { getFirestore, Timestamp, FieldValue, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { onCall, HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { randomInt } from 'node:crypto';
import { testPacks } from './test-packs.js';
import { poolNavigation, poolScopeIds } from './question-engine/pool-navigation.js';
import { parsePresentation } from '../visuals/contract.mjs';
import { arenaRow, readProgress, publicArenaRow } from './arena-store.js';
import { readAnswerAnalytics, acceptAnswer, writeAnalytics } from './analytics-store.js';

const options = { region: 'europe-west1', minInstances: 0, maxInstances: 3,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true' };
const db = () => getFirestore();
const studentRoot = (uid: string, sid: string) => db().doc(`teachers/${uid}/students/${sid}`);
function input(value: unknown, keys: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !keys.includes(key)) || keys.some(key => !(key in value))) {
    throw new HttpsError('invalid-argument', 'İstek alanlarını kontrol et.');
  }
}
function identifier(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new HttpsError('invalid-argument', 'Geçersiz kimlik.');
  return value;
}
const allowedGrades = (grade: number) => grade === 2 ? [2] : [grade - 1, grade];
export async function activeStudent(request: CallableRequest, tx: Transaction) {
  if (!request.auth || request.auth.token.firebase?.sign_in_provider !== 'custom') {
    throw new HttpsError('permission-denied', 'Öğrenci oturumu gerekli.');
  }
  const session = await tx.get(db().doc(`studentSessions/${request.auth.uid}`));
  if (!session.exists) throw new HttpsError('permission-denied', 'Öğrenci oturumu geçersiz.');
  const { teacherUid, studentId, credentialVersion } = session.data()!;
  const root = studentRoot(teacherUid, studentId), student = await tx.get(root);
  if (!student.exists || student.data()!.status !== 'active' || student.data()!.credentialVersion !== credentialVersion) {
    throw new HttpsError('permission-denied', 'Öğrenci erişimi iptal edildi.');
  }
  const fixture = process.env.FUNCTIONS_EMULATOR === 'true' && (await tx.get(db().doc(`teachers/${teacherUid}`))).data()?.testFixtureBank === true;
  return { fixture, root, teacherUid, studentId, classId: student.data()!.classId as string,
    student: student.data()!, gradeLevel: student.data()!.gradeLevel as number };
}
function checkGrade(studentGrade: number, requested: unknown) {
  if (!Number.isInteger(requested) || !allowedGrades(studentGrade).includes(Number(requested))) {
    throw new HttpsError('permission-denied', 'Bu kademenin içeriğine erişemezsin.');
  }
  return Number(requested);
}
function shuffle<T>(items: T[]) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = randomInt(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
// Explicit DTO: private answer keys and outcome codes never enter selection/question payloads.
function publicQuestion(q: DocumentData) {
  let presentation;
  try {presentation = parsePresentation(q.questionText,q.choices,q.visual,q.visualPlacement,q.content);} catch {throw new HttpsError('failed-precondition','Soru görseli veya seçenekleri doğrulanamadı.');}
  return { questionId: q.questionId, gradeLevel: q.gradeLevel, subject: q.subject, topic: q.topic,
    ...(q.unitId ? { grade: q.gradeLevel, subjectId: q.subject, subjectName: q.subjectName, unitId: q.unitId, unitName: q.unitName, topicId: q.topic, topicName: q.topicName } : {}),
    ...(q.themeId ? {themeId:q.themeId} : {}), ...presentation };
}
function testDTO(data: DocumentData) {
  if (data.contentBank === 'curriculum' && data.subject === 'turkce' && !data.packId) data = {...data,unitName:null,topicName:'Türkçe Testi'};
  return { testSessionId: data.testSessionId, studentId: data.studentId, gradeLevel: data.gradeLevel,
    subject: data.subject, subjectName: data.subjectName, topic: data.topic, topicName: data.topicName,
    ...(data.packId ? {packId:data.packId, packName:data.packName, navigationVersion:data.navigationVersion} : {}),
    ...(data.contentBank ? { contentBank: data.contentBank, mode: data.mode, grade: data.gradeLevel, subjectId: data.subject, unitId: data.unitId, unitName: data.unitName } : {}),
    questionCount: data.questionCount, questions: data.questions.map(publicQuestion), answeredQuestionIds: data.answeredQuestionIds,
    correctCount: data.correctCount, wrongCount: data.wrongCount, earnedXP: data.earnedXP, status: data.status,
    startedAt: data.startedAt.toMillis(), completedAt: data.completedAt?.toMillis() ?? null };
}
function checkBank(fixture: boolean, test: DocumentData) {
  const bank = test.contentBank || (test.questionIds.some((q: string) => q.startsWith('demo_')) ? 'fixture' : 'curriculum');
  if (bank !== (fixture ? 'fixture' : 'curriculum')) throw new HttpsError('permission-denied', 'Bu test eski test ortamına ait; yeni içerikten bir test seç.');
}

export const quizCatalog = onCall(options, async request => {
  const identity = await db().runTransaction(tx => activeStudent(request, tx)), grades = allowedGrades(identity.gradeLevel);
  const pool = await db().collection('questions').where('gradeLevel', 'in', grades).where('status', '==', 'published').where('isDemo', '==', identity.fixture).get();
  if (identity.fixture) {
    // Emulator-only compatibility adapter for existing technical regression fixtures.
    const entries = new Map<string, DocumentData>();
    for (const doc of pool.docs) {
      const q = doc.data(), key = `${q.gradeLevel}:${q.subject}:${q.topic}`;
      const entry = entries.get(key) || { gradeLevel: q.gradeLevel, subject: q.subject, subjectName: q.subjectName, topic: q.topic, topicName: q.topicName, count: 0 };
      entry.count++; entries.set(key, entry);
    }
    return { allowedGrades: grades, entries: [...entries.values()], curricula: [], fixture: true };
  }
  const trees = await db().getAll(...grades.map(g => db().doc('curricula/' + g)));
  const availableIds = new Set(pool.docs.map(q => q.id));
  const packs = (ids: string[]) => testPacks(ids.filter(id => availableIds.has(id))).map(p => ({id:p.id,name:p.name,count:p.questionIds.length}));
  const curricula = trees.filter(d => d.exists).map(d => {
    const c = poolNavigation(d.data()!,pool.docs.map(q=>q.data()));
    return { grade:c.grade, subjects:c.subjects.map((s: DocumentData) => ({
      id:s.id, name:s.name, navigationModel:s.navigationModel, sectionLabel:s.sectionLabel,
      count:s.units.reduce((n: number,u: DocumentData) => n + u.questionIds.filter((id: string) => availableIds.has(id)).length,0),
      units:s.units.map((u: DocumentData) => ({id:u.id,name:u.name,displayName:u.displayName,
        count:u.questionIds.filter((id: string) => availableIds.has(id)).length,
        packs:s.navigationModel === 'theme-test' ? packs(u.questionIds) : [],
        topics:u.topics.map((t: DocumentData) => ({id:t.id,name:t.name,count:t.questionIds.filter((id: string) => availableIds.has(id)).length,packs:packs(t.questionIds)}))
      }))
    })) };
  });
  return { allowedGrades: grades, curricula, entries: [], fixture: false };
});

export const startTest = onCall(options, async request => {
  return db().runTransaction(async tx => {
    const identity = await activeStudent(request, tx);
    const packaged = !identity.fixture;
    const curriculum = !identity.fixture ? await tx.get(db().doc('curricula/' + checkGrade(identity.gradeLevel, request.data?.grade))) : undefined;
    const themeOnly = !identity.fixture && curriculum?.data()?.subjects.find((s: DocumentData) => s.id === request.data?.subjectId)?.navigationModel === 'theme-test';
    input(request.data, identity.fixture ? ['gradeLevel','subject','topic','questionCount'] : ['grade','subjectId','unitId',...(themeOnly ? [] : ['topicId']),'packId']);
    const gradeLevel = checkGrade(identity.gradeLevel, identity.fixture ? request.data.gradeLevel : request.data.grade);
    const subject = identifier(identity.fixture ? request.data.subject : request.data.subjectId);
    const topic = themeOnly && packaged ? null : identifier(identity.fixture ? request.data.topic : request.data.topicId);
    const unitId = identity.fixture ? null : identifier(request.data.unitId);
    let questionCount = request.data.questionCount;
    let scope: DocumentData | undefined, curriculumUnit: DocumentData | undefined, curriculumSubject: DocumentData | undefined;
    if (!identity.fixture) {
      const curriculum = await tx.get(db().doc('curricula/' + gradeLevel));
      curriculumSubject = curriculum.data()?.subjects.find((s: DocumentData) => s.id === subject);
      curriculumUnit = curriculumSubject?.units.find((u: DocumentData) => u.id === unitId);
      scope = themeOnly && packaged ? curriculumUnit : curriculumUnit?.topics.find((t: DocumentData) => t.id === topic);
      if (!scope) throw new HttpsError('invalid-argument', 'Ders, ünite veya konu bulunamadı.');
      const previous = await tx.get(identity.root.collection('testSessions').limit(1));
      if (previous.docs.some(d => d.data().contentBank === 'fixture' || d.data().questionIds.some((q: string) => q.startsWith('demo_')))) throw new HttpsError('failed-precondition', 'Bu öğrenci eski demo geçmişine sahip. Gerçek içerik için yeni bir öğrenci kaydı kullan.');
    }
    let query = db().collection('questions').where('gradeLevel','==',gradeLevel).where('subject','==',subject).where('status','==','published').where('isDemo','==',identity.fixture);
    if (identity.fixture) query = query.where('topic','==',topic);
    const pool = await tx.get(query);
    const scopeIds=identity.fixture?[]:poolScopeIds(scope!.questionIds,pool.docs.map(q=>q.data()),
      {grade:gradeLevel,subjectId:subject,unitId:unitId!,sourceDatasetId:curriculum?.data()?.sourceDatasetId,...(topic?{topicId:topic}:{})});
    let poolDocs = identity.fixture ? pool.docs : pool.docs.filter(q => scopeIds.includes(q.id));
    let pack: ReturnType<typeof testPacks>[number] | undefined;
    if (packaged) {
      pack = testPacks(poolDocs.map(q => q.id)).find(p => p.id === request.data.packId);
      if (!pack) throw new HttpsError('failed-precondition', 'Bu seçimde test paketi bulunmuyor.');
      poolDocs = poolDocs.filter(q => pack!.questionIds.includes(q.id)); questionCount = poolDocs.length;
    }
    if (identity.fixture ? ![10,20,30,50].includes(questionCount) : !Number.isInteger(questionCount) || questionCount < 1 || questionCount > 50) throw new HttpsError('invalid-argument', 'Geçersiz soru sayısı.');
    if (poolDocs.length < questionCount) throw new HttpsError('failed-precondition', 'Bu seçimde istenen sayıda soru bulunmuyor.');
    const awards = await tx.getAll(...poolDocs.map(q => identity.root.collection('awardedQuestions').doc(q.id)));
    const fresh = poolDocs.filter((_, i) => !awards[i].exists), practiced = poolDocs.filter((_, i) => awards[i].exists);
    const selected = [...shuffle(fresh), ...shuffle(practiced)].slice(0, questionCount);
    const answerKeys = await tx.getAll(...selected.map(q => db().collection('privateQuestionAnswers').doc(q.id)));
    const privateKeys: Record<string, DocumentData> = {};
    const questions = selected.map((q, index) => {
      const data = q.data(), key = answerKeys[index].data();
      const correctChoiceId = identity.fixture ? key?.correctChoiceId : key?.correctOptionId;
      if (data.questionId !== q.id || !Array.isArray(data.choices) || data.choices.length < 2
        || new Set(data.choices.map((c: { choiceId: string }) => c.choiceId)).size !== data.choices.length
        || !key || !data.choices.some((c: { choiceId: string }) => c.choiceId === correctChoiceId)) throw new HttpsError('failed-precondition', 'Soru içeriği doğrulanamadı.');
      privateKeys[q.id] = { correctChoiceId, explanation: String(key.explanation || ''),
        ...(key.outcomeMappingStatus ? { outcomeMappingStatus: key.outcomeMappingStatus } : {}),
        ...(key.outcomeCode && key.outcomeMappingStatus === 'exact' ? { outcomeCode: key.outcomeCode } : {}),
        ...(key.candidateOutcomeCodes ? { candidateOutcomeCodes: key.candidateOutcomeCodes } : {}) };
      const safe = publicQuestion(data);
      return {...safe,choices:shuffle(safe.choices)};
    });
    const test = identity.root.collection('testSessions').doc(), first = selected[0].data();
    const data = { testSessionId: test.id, studentId: identity.studentId, teacherUid: identity.teacherUid,
      contentBank: identity.fixture ? 'fixture' : 'curriculum', mode: 'topic',
      gradeLevel, subject, subjectName: first.subjectName, topic, topicName: identity.fixture ? first.topicName : themeOnly ? '' : scope!.name,
      unitId, unitName: identity.fixture ? null : curriculumUnit!.displayName,
      ...(pack ? {packId:pack.id,packName:pack.name,navigationVersion:3} : {}),
      questionCount, questionIds: selected.map(q => q.id), questions, answeredQuestionIds: [],
      correctCount: 0, wrongCount: 0, earnedXP: 0, status: 'active', startedAt: Timestamp.now(), completedAt: null };
    tx.create(test, data);
    tx.create(db().collection('privateTestKeys').doc(test.id), privateKeys);
    return testDTO(data);
  });
});

export const getTestSession = onCall(options, async request => {
  input(request.data, ['testSessionId']); const testId = identifier(request.data.testSessionId);
  return db().runTransaction(async tx => {
    const identity = await activeStudent(request, tx), test = await tx.get(identity.root.collection('testSessions').doc(testId));
    if (!test.exists) throw new HttpsError('not-found', 'Test bulunamadı.');
    checkGrade(identity.gradeLevel, test.data()!.gradeLevel); checkBank(identity.fixture, test.data()!);
    return testDTO(test.data()!);
  });
});

export const submitAnswer = onCall(options, async request => {
  input(request.data, ['testSessionId', 'questionId', 'selectedChoiceId']);
  const testId = identifier(request.data.testSessionId), questionId = identifier(request.data.questionId), selectedChoiceId = identifier(request.data.selectedChoiceId);
  return db().runTransaction(async tx => {
    // Session and canonical student are inside the XP transaction: revocation or
    // grade edits conflict with an in-flight award and force a fresh auth check.
    const identity = await activeStudent(request, tx), testRef = identity.root.collection('testSessions').doc(testId);
    const test = await tx.get(testRef);
    if (!test.exists) throw new HttpsError('not-found', 'Test bulunamadı.');
    const data = test.data()!; checkGrade(identity.gradeLevel, data.gradeLevel); checkBank(identity.fixture, data);
    if (!data.questionIds.includes(questionId)) throw new HttpsError('invalid-argument', 'Soru bu teste ait değil.');
    const answerRef = testRef.collection('answers').doc(questionId), summaryRef = identity.root.collection('learning').doc('summary');
    const [locked, summary] = await tx.getAll(answerRef, summaryRef);
    // (testSessionId, questionId) is the immutable idempotency key. Replays and
    // attempts to switch a submitted choice return the first authoritative result.
    if (locked.exists) {
      const a = locked.data()!;
      return { answer: { questionId, selectedChoiceId: a.selectedChoiceId, isCorrect: a.isCorrect, earnedXP: a.earnedXP,
        correctChoiceId: a.correctChoiceId, explanation: a.explanation }, test: testDTO(data), totalXP: summary.data()?.totalXP || 0 };
    }
    if (data.status !== 'active') throw new HttpsError('failed-precondition', 'Bu test tamamlandı.');
    const question = data.questions.find((q: { questionId: string }) => q.questionId === questionId);
    if (!question.choices.some((c: { choiceId: string }) => c.choiceId === selectedChoiceId)) throw new HttpsError('invalid-argument', 'Geçersiz seçenek.');
    const awardRef = identity.root.collection('awardedQuestions').doc(questionId);
    const [keyDoc, award] = await tx.getAll(db().collection('privateTestKeys').doc(testId), awardRef);
    const key = keyDoc.data()?.[questionId];
    if (!key) throw new HttpsError('failed-precondition', 'Cevap anahtarı bulunamadı.');
    const isCorrect = selectedChoiceId === key.correctChoiceId, earnedXP = isCorrect && !award.exists ? 1 : 0;
    const current: DocumentData = { totalXP: 0, answeredCount: 0, correctCount: 0, wrongCount: 0, ...summary.data() };
    const now = new Date();
    const progress = await readProgress(tx, identity.root, current, now);
    const analyticsContext = { ...data, ...question };
    const analytics = await readAnswerAnalytics(tx, identity.root, analyticsContext, now);
    const totalXP = current.totalXP + earnedXP;
    const answer = { questionId, selectedChoiceId, isCorrect, earnedXP, correctChoiceId: key.correctChoiceId, explanation: key.explanation };
    const answeredQuestionIds = [...data.answeredQuestionIds, questionId], completed = answeredQuestionIds.length === data.questionCount;
    const next = { ...data, answeredQuestionIds, correctCount: data.correctCount + (isCorrect ? 1 : 0),
      wrongCount: data.wrongCount + (isCorrect ? 0 : 1), earnedXP: data.earnedXP + earnedXP,
      status: completed ? 'completed' : 'active', completedAt: completed ? Timestamp.now() : null };
    acceptAnswer(analytics, analyticsContext, isCorrect, now);
    writeAnalytics(tx, identity.root, analytics);
    tx.create(answerRef, { ...answer, studentId: identity.studentId, testSessionId: testId,
      ...(question.themeId ? {themeId:question.themeId} : {}),
      ...(question.unitId ? { grade: question.gradeLevel, subjectId: question.subject, unitId: question.unitId, topicId: question.topic,
        outcomeMappingStatus: key.outcomeMappingStatus, ...(key.outcomeCode ? { outcomeCode: key.outcomeCode } : {}) } : {}), answeredAt: Timestamp.fromDate(now) });
    if (earnedXP) {
      tx.create(awardRef, { questionId, firstTestSessionId: testId, awardedAt: Timestamp.fromDate(now), xp: 1, source: 'academic', weekKey: progress.period.weekKey });
      tx.set(progress.weekRef, { weekKey: progress.period.weekKey, academicXP: progress.weeklyAcademicXP + 1 });
      tx.set(arenaRow(identity.teacherUid, identity.classId, identity.studentId), publicArenaRow(identity.student,
        progress.academicXP + 1, progress.weeklyAcademicXP + 1, progress.period.weekKey));
    }
    if (!earnedXP && current.academicXP === undefined) {
      tx.set(progress.weekRef, { weekKey: progress.period.weekKey, academicXP: progress.weeklyAcademicXP });
      tx.set(arenaRow(identity.teacherUid, identity.classId, identity.studentId), publicArenaRow(identity.student,
        progress.academicXP, progress.weeklyAcademicXP, progress.period.weekKey));
    }
    tx.set(summaryRef, { totalXP, academicXP: (current.academicXP ?? current.totalXP) + earnedXP,
      answeredCount: current.answeredCount + 1, correctCount: current.correctCount + (isCorrect ? 1 : 0),
      wrongCount: current.wrongCount + (isCorrect ? 0 : 1) }, { merge: true });
    tx.set(identity.root.collection('performance').doc(`${analyticsContext.gradeLevel}_${analyticsContext.subject}_${analyticsContext.topic}`), {
      gradeLevel: analyticsContext.gradeLevel, subject: analyticsContext.subject, topic: analyticsContext.topic,
      ...(question.unitId ? { unitId: question.unitId, topicId: question.topic, subjectId: question.subject, grade: question.gradeLevel } : {}),
      answeredCount: FieldValue.increment(1), correctCount: FieldValue.increment(isCorrect ? 1 : 0),
      wrongCount: FieldValue.increment(isCorrect ? 0 : 1), earnedXP: FieldValue.increment(earnedXP)
    }, { merge: true });
    tx.update(testRef, { answeredQuestionIds, correctCount: next.correctCount, wrongCount: next.wrongCount,
      earnedXP: next.earnedXP, status: next.status, completedAt: next.completedAt });
    return { answer, test: testDTO(next), totalXP };
  });
});
