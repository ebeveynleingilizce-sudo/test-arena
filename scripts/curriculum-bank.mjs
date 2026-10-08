import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parsePresentation, resolveStimulus } from '../functions/visuals/contract.mjs';
import { normalizeV3Visual } from './v3-visuals.mjs';
import { resolveCanonicalScope, canonicalUnits, canonicalTopics } from './canonical-scope.mjs';
import { packageVisual } from './package-images.mjs';

const dataRoot = fileURLToPath(new URL('../data/', import.meta.url));
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

// One import adapter into the existing questions/privateQuestionAnswers model.
// No question text, options or curriculum identifiers are generated here.
function loadTechnicalBank(root = dataRoot) {
  const schema = read(join(root, 'soru-bankasi/SCHEMA.json'));
  const curricula = [], records = [], questionIds = new Set();
  for (const file of readdirSync(join(root, 'mufredat')).filter(f => /^\d+-sinif-ui\.json$/.test(f))) {
    const ui = read(join(root, 'mufredat', file)), canonical = read(join(root, 'mufredat', file.replace('-ui', '')));
    ensure(ui.grade === canonical.grade && ui.sourceDatasetId === canonical.dataset_id, 'Müfredat kaynak/kademe uyuşmazlığı.');
    const subjectIds = new Set(), tree = { grade: ui.grade, datasetId: ui.datasetId, sourceDatasetId: ui.sourceDatasetId, subjects: [] };
    for (const subject of ui.subjects) {
      ensure(identifier(subject.id) && !subjectIds.has(subject.id), 'Geçersiz/tekrarlı ders kimliği.'); subjectIds.add(subject.id);
      const source = canonical.subjects.find(s => s.id === subject.id);
      ensure(source, `Kanonik ders bulunamadı: ${subject.id}`);
      const sourceUnits = source.skill_domains || source.themes, units = [], topicIds = new Set(), unitIds = new Set();
      for (const unit of subject.units) {
        const sourceUnit = sourceUnits.find(u => u.id === unit.id);
        ensure(identifier(unit.id) && !unitIds.has(unit.id) && sourceUnit, `Kanonik ünite bulunamadı: ${unit.id}`); unitIds.add(unit.id);
        for (const topic of unit.topics) {
          ensure(identifier(topic.id) && !topicIds.has(topic.id), `Geçersiz/tekrarlı konu: ${topic.id}`); topicIds.add(topic.id);
          if (sourceUnit.topics || sourceUnit.subthemes) ensure((sourceUnit.topics || sourceUnit.subthemes).some(t => t.id === topic.id), `Kanonik konu bulunamadı: ${topic.id}`);
          const codes = sourceUnit.outcomes?.map(o => o.code) || sourceUnit.topics?.flatMap(t => t.outcomes.map(o => o.code)) || sourceUnit.outcome_codes || [];
          ensure((topic.outcomeCodes || []).every(c => codes.includes(c)), `Kanonik kazanım bulunamadı: ${topic.id}`);
        }
        units.push({ id: unit.id, name: unit.name, topics: unit.topics.map(t => ({ id: t.id, name: t.name })) });
      }
      tree.subjects.push({ id: subject.id, name: subject.name, units });
      // Explicit active sources: never discover/activate draft files by glob.
      const bankFiles = [`${subject.id}.json`];
      if (ui.grade === 2 && subject.id === 'matematik') bankFiles.push('matematik-2-sinif-unite-1-50-soru-v3-pdf-mantigi.json','matematik-2-sinif-unite-2-60-soru-v1.json');
      for (const bankFile of bankFiles) {
      const bank = read(join(root, 'soru-bankasi', `${ui.grade}-sinif`, bankFile));
      const isV3 = bankFile === 'matematik-2-sinif-unite-1-50-soru-v3-pdf-mantigi.json';
      const isUnit2 = bankFile === 'matematik-2-sinif-unite-2-60-soru-v1.json';
      ensure(bank.grade === ui.grade && bank.subjectId === subject.id && bank.questionCount === bank.questions.length && (bank.pilotStatus === 'reviewed-v2' || (isV3 || isUnit2) && bank.pilotStatus === 'ready-for-local-validation'), `Soru bankası başlığı doğrulanamadı: ${subject.id}`);
      for (const sourceQuestion of bank.questions) {
        // Immutable V2 question/answer history must not be overwritten with different content.
        const q = isV3 ? {...sourceQuestion,id:sourceQuestion.id.replace('-u1-v2-','-u1-v3-'),
          ...(sourceQuestion.visual ? {visual:normalizeV3Visual(sourceQuestion.visual),visualPlacement:'above'} : {}),
          options:sourceQuestion.options.map(o=>({...o,text:o.text ?? '',...(o.visual?{visual:normalizeV3Visual(o.visual)}:{})}))} : sourceQuestion;
        ensure((q.grade === undefined || q.grade === bank.grade) && (q.subjectId === undefined || q.subjectId === subject.id), `Soru kademe/ders uyuşmazlığı: ${q.id}`);
        ensure(schema.questionContract.required.every(k => k in q), `Eksik soru alanı: ${q.id}`);
        ensure(identifier(q.id) && !questionIds.has(q.id), `Geçersiz/tekrarlı soru kimliği: ${q.id}`); questionIds.add(q.id);
        const unit = subject.units.find(u => u.id === q.unitId), topic = unit?.topics.find(t => t.id === q.topicId);
        ensure(topic, `Soru yanlış ünite/konuya bağlı: ${q.id}`);
        ensure(schema.questionContract.type.includes(q.type) && schema.questionContract.difficulty.includes(q.difficulty), `Soru türü/zorluğu geçersiz: ${q.id}`);
        ensure(typeof q.question === 'string' && q.question.trim() && typeof q.explanation === 'string' && q.explanation.trim(), `Soru/açıklama boş: ${q.id}`);
        ensure(Array.isArray(q.options) && [3,4].includes(q.options.length) && new Set(q.options.map(o => o.id)).size === q.options.length && q.options.every(o => schema.questionContract.optionIds.includes(o.id)), `Şıklar geçersiz: ${q.id}`);
        const presentation = parsePresentation(q.question, q.options.map(o => ({choiceId:o.id,text:o.text,visual:o.visual})),resolveStimulus(q.visual,q.stimulusId,bank.stimuli),q.visualPlacement,q.content);
        ensure(q.options.some(o => o.id === q.correctOptionId), `Doğru şık kimliği bulunamadı: ${q.id}`);
        const sourceUnit = sourceUnits.find(u => u.id === unit.id);
        if (q.outcomeCode) ensure(q.outcomeMappingStatus !== 'theme-level-only' && topic.outcomeCodes?.includes(q.outcomeCode), `Kesin kazanım eşlemesi doğrulanamadı: ${q.id}`);
        else ensure(q.outcomeMappingStatus === 'theme-level-only', `Kazanım eşleme durumu eksik: ${q.id}`);
        ensure((q.candidateOutcomeCodes || []).every(c => sourceUnit.outcome_codes?.includes(c)), `Aday kazanım kaynakta yok: ${q.id}`);
        records.push({ question: { questionId: q.id, gradeLevel: bank.grade, grade: bank.grade, subject: subject.id, subjectId: subject.id, subjectName: subject.name,
          ...(q.themeId ? {themeId:q.themeId} : {}), unitId: unit.id, unitName: unit.name, topic: topic.id, topicId: topic.id, topicName: topic.name,
          ...presentation, type: q.type, difficulty: q.difficulty,
          status: 'published', isDemo: false, sourceDatasetId: ui.sourceDatasetId },
          answer: { correctChoiceId: q.correctOptionId, correctOptionId: q.correctOptionId, explanation: q.explanation,
            outcomeMappingStatus: q.outcomeCode ? 'exact' : q.outcomeMappingStatus,
            ...(q.outcomeCode ? { outcomeCode: q.outcomeCode } : {}), ...(q.candidateOutcomeCodes ? { candidateOutcomeCodes: q.candidateOutcomeCodes } : {}) } });
      }
      }
    }
    curricula.push(tree);
  }
  return { curricula, records };
}

// Legacy technical records remain immutable. Only this v2 tree drives students.
export function loadCurriculumBank(root = dataRoot, {records: suppliedRecords, grade = 2} = {}) {
  const records = suppliedRecords ?? loadTechnicalBank(root).records;
  const ui = read(join(root, `mufredat/${grade}-sinif-ui-v2.json`));
  const canonical = read(join(root, `mufredat/${grade}-sinif.json`));
  ensure(ui.grade === canonical.grade && ui.sourceDatasetId === canonical.dataset_id, 'V2 kaynak/kademe uyuşmazlığı.');
  const mapped = new Set(), unmapped = [];
  const tree = { grade: ui.grade, datasetId: ui.datasetId, sourceDatasetId: ui.sourceDatasetId, navigationVersion: ui.schemaVersion, subjects: [] };
  for (const s of ui.subjects) {
    const source = canonical.subjects.find(x => x.id === s.id);
    ensure(source && ['theme-test','unit-topic-test','theme-topic-test'].includes(s.navigationModel), 'V2 ders modeli geçersiz.');
    const units = s.units.map(u => {
      const sourceUnit = canonicalUnits(source).find(x => x.id === u.id);
      ensure(sourceUnit && identifier(u.id), 'V2 ünite kanonik kaynakta yok: ' + u.id);
      const topics = (u.topics || []).map(t => {
        const sourceTopic = canonicalTopics(sourceUnit).find(x => x.id === t.id);
        ensure(sourceTopic && identifier(t.id), 'V2 konu kaynakta yok: ' + t.id);
        for (const code of t.outcomeCodes || []) resolveCanonicalScope(canonical,{grade:ui.grade,subjectId:s.id,unitId:u.id,topicId:t.id,outcomeCode:code});
        // Unit 2's approved source owns new packs. Old pilot documents/history stay immutable.
        const questionIds = records.filter(r => r.question.grade === ui.grade && r.question.subjectId === s.id && r.question.unitId === u.id && r.question.topicId === t.id &&
          (suppliedRecords !== undefined || s.id !== 'matematik' || u.id !== 'g2-matematik-sayilar-ve-nicelikler-1' || r.question.questionId.startsWith('g2-mat-u2-v1-')) &&
          (!r.answer.outcomeCode || t.outcomeCodes?.includes(r.answer.outcomeCode) || suppliedRecords !== undefined && sourceTopic.outcomes?.some(o=>o.code===r.answer.outcomeCode))).map(r => r.question.questionId);
        questionIds.forEach(id => mapped.add(id));
        return { id:t.id, name:t.name, questionIds };
      });
      // Turkish requires an explicit theme ID. Skill/outcome codes cannot infer a theme.
      const questionIds = records.filter(r => r.question.grade === ui.grade && r.question.subjectId === s.id && (r.question.themeId || r.question.unitId) === u.id).map(r => r.question.questionId);
      questionIds.forEach(id => mapped.add(id));
      return { id:u.id, name:u.name, displayName:u.displayName, order:u.order, topics, questionIds };
    });
    tree.subjects.push({ id:s.id, name:s.name, navigationModel:s.navigationModel, sectionLabel:s.sectionLabel, units });
  }
  for (const r of records) if (!mapped.has(r.question.questionId)) unmapped.push({questionId:r.question.questionId, subjectId:r.question.subjectId, unitId:r.question.unitId, topicId:r.question.topicId, reason:'V2 navigasyonunda kesin tema/ünite/konu eşleşmesi yok.'});
  return {curricula:[tree],records,unmapped};
}

// Prepared files use the same presentation whitelist and public/private adapter.
// Nothing from the bank is spread into a public document.
export function prepareQuestionBank(bank, root = dataRoot, {packageDirectory} = {}) {
  const schema=read(join(root,'soru-bankasi/SCHEMA.json')).questionContract;
  ensure(bank && Number.isInteger(bank.grade) && bank.grade>=2 && bank.grade<=12 && identifier(bank.subjectId),'Geçersiz banka kademe/ders bilgisi.');
  ensure(Array.isArray(bank.questions) && bank.questions.length>0 && bank.questions.length<=200,'Banka 1–200 soru içermelidir.');
  ensure(bank.questionCount===undefined || bank.questionCount===bank.questions.length,'questionCount soru sayısıyla uyuşmuyor.');
  const canonical=read(join(root,`mufredat/${bank.grade}-sinif.json`));
  const navigation=loadCurriculumBank(root,{records:[],grade:bank.grade}).curricula[0];
  const subject=navigation.subjects.find(s=>s.id===bank.subjectId);
  ensure(subject,'Ders navigasyonda bulunamadı.');
  const metadata=['unitId','topicId','skillId','outcomeCode','outcomeId'];
  const ids=new Set(),records=[],assets=[];
  const visual=v=>packageVisual(v,packageDirectory,assets);
  ensure(bank.stimuli===undefined || bank.stimuli && typeof bank.stimuli==='object' && !Array.isArray(bank.stimuli) && Object.keys(bank.stimuli).length<=30,'Geçersiz ortak görsel listesi.');
  const stimuli=bank.stimuli===undefined?undefined:Object.fromEntries(Object.entries(bank.stimuli).map(([id,v])=>[id,visual(v)]));
  for(const q of bank.questions){
    ensure(q && identifier(q.id) && !ids.has(q.id),'Geçersiz veya tekrarlanan soru ID.');ids.add(q.id);
    ensure(schema.required.every(k=>k in q),`Eksik soru alanı: ${q.id}`);
    ensure((q.grade===undefined||q.grade===bank.grade)&&(q.subjectId===undefined||q.subjectId===bank.subjectId),'Soru kademe/ders uyuşmazlığı.');
    const scopeInput={grade:bank.grade,subjectId:bank.subjectId};
    for(const key of metadata){
      const inherited=key==='unitId' ? bank.unitId ?? bank.unit?.id : bank[key];
      ensure(q[key]===undefined||inherited===undefined||q[key]===inherited,`Banka/soru ${key} uyuşmuyor: ${q.id}`);
      scopeInput[key]=q[key]===undefined ? inherited : q[key];
    }
    const resolved=resolveCanonicalScope(canonical,scopeInput),unit=subject.units.find(u=>u.id===scopeInput.unitId);
    ensure(unit,`Ünite öğrenci navigasyonunda bulunamadı: ${scopeInput.unitId}`);
    ensure(!q.themeId||q.themeId===unit.id,`Tema/ünite bilgisi uyuşmuyor: ${q.id}`);
    const topic=unit.topics.find(t=>t.id===scopeInput.topicId),detail=resolved.topic||resolved.skill;
    ensure(schema.type.includes(q.type)&&schema.difficulty.includes(q.difficulty),`Tür/zorluk geçersiz: ${q.id}`);
    ensure(typeof q.question==='string'&&q.question.trim()&&(q.explanation===undefined||typeof q.explanation==='string'),`Soru metni veya açıklama türü geçersiz: ${q.id}`);
    ensure(Array.isArray(q.options)&&[3,4].includes(q.options.length)&&new Set(q.options.map(o=>o.id)).size===q.options.length&&q.options.every(o=>schema.optionIds.includes(o.id)),`Şıklar geçersiz: ${q.id}`);
    ensure(q.options.some(o=>o.id===q.correctOptionId),`Doğru seçenek bulunamadı: ${q.id}`);
    const outcomeCode=resolved.outcome?.code;
    if(resolved.outcome)ensure(q.outcomeMappingStatus!=='theme-level-only',`Kazanım eşleme durumu geçersiz: ${q.id}`);
    else ensure(q.outcomeMappingStatus===undefined||q.outcomeMappingStatus==='theme-level-only',`Kazanım eşleme durumu geçersiz: ${q.id}`);
    ensure(Array.isArray(q.candidateOutcomeCodes||[])&&(q.candidateOutcomeCodes||[]).every(code=>resolved.unit.outcome_codes?.includes(code)),`Aday kazanım kaynakta yok: ${q.id}`);
    const presentation=parsePresentation(q.question,q.options.map(o=>({choiceId:o.id,text:o.text,visual:visual(o.visual)})),resolveStimulus(visual(q.visual),q.stimulusId,stimuli),q.visualPlacement,q.content);
    records.push({question:{questionId:q.id,gradeLevel:bank.grade,grade:bank.grade,subject:subject.id,subjectId:subject.id,subjectName:subject.name,
      unitId:unit.id,unitName:unit.name,...(q.themeId?{themeId:q.themeId}:{}),
      // Legacy topic fields are runtime grouping keys; unit.id fallback is NOT a skill mapping.
      topic:detail?.id||unit.id,topicId:detail?.id||unit.id,topicName:topic?.name||unit.name,
      ...(scopeInput.skillId?{skillId:scopeInput.skillId}:{}),
      ...presentation,type:q.type,difficulty:q.difficulty,status:'published',isDemo:false,sourceDatasetId:navigation.sourceDatasetId},
      answer:{correctChoiceId:q.correctOptionId,correctOptionId:q.correctOptionId,explanation:q.explanation??'',outcomeMappingStatus:resolved.outcome?'exact':'theme-level-only',
        ...(outcomeCode?{outcomeCode}:{}),...(scopeInput.outcomeId?{outcomeId:scopeInput.outcomeId}:{}),...(q.candidateOutcomeCodes?{candidateOutcomeCodes:q.candidateOutcomeCodes}:{})}});
  }
  const mapped=loadCurriculumBank(root,{records,grade:bank.grade});
  ensure(mapped.unmapped.length===0,'Bankadaki bazı sorular navigasyonla eşleşmiyor.');
  return {...mapped,assets};
}
