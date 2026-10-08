// Canonical identifiers are explicit metadata, never derived from question IDs.
const ensure = (condition, message) => { if (!condition) throw Error(message); };
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const children = (node, keys) => keys.flatMap(key => node[key] || []);
export const canonicalUnits = subject => {
  const units = children(subject, ['units', 'themes']);
  return units.length ? units : subject.skill_domains || [];
};
export const canonicalTopics = unit => children(unit, ['topics', 'subthemes', 'skill_domains']);
const outcomes = node => [
  ...(node.outcomes || []).map(o => typeof o === 'string' ? {code:o} : o),
  ...(node.outcome_codes || []).map(code => ({code})),
  ...canonicalTopics(node).flatMap(outcomes)
];

export function resolveCanonicalScope(canonical, {grade, subjectId, unitId, topicId, skillId, outcomeCode, outcomeId}) {
  ensure(canonical.grade === grade, 'Kanonik kademe uyuşmuyor.');
  const subject = canonical.subjects.find(s => s.id === subjectId);
  ensure(subject, 'Kanonik ders bulunamadı: ' + subjectId);
  ensure(identifier(unitId), 'Geçerli unitId zorunludur.');
  const units = canonicalUnits(subject).filter(u => u.id === unitId);
  ensure(units.length === 1, 'Kanonik ünite/tema bulunamadı: ' + unitId);
  const unit = units[0];
  // Subject-level skills are independent of themes when the source defines them so.
  const members = [...canonicalTopics(unit), ...(children(subject,['units','themes']).length ? subject.skill_domains || [] : [])];
  const resolveMember = (id, field) => {
    if (id === undefined) return undefined;
    ensure(identifier(id), 'Geçersiz ' + field + '.');
    const matches = members.filter(t => t.id === id);
    ensure(matches.length === 1, 'Kanonik konu/beceri bulunamadı: ' + field + '=' + id);
    return matches[0];
  };
  const topic = resolveMember(topicId, 'topicId'), skill = resolveMember(skillId, 'skillId');
  ensure(!topic || !skill || topic.id === skill.id, 'Topic/skill ilişkisi kaynakta doğrulanamadı.');
  const detailed = [topic, skill].filter(Boolean);
  const lists = detailed.length ? detailed.map(outcomes) : [outcomes(unit)];
  const resolveOutcome = (value, field) => {
    if (value === undefined) return undefined;
    ensure(typeof value === 'string' && value.trim(), 'Geçersiz ' + field + '.');
    ensure(lists.every(list => list.some(o => o[field === 'outcomeId' ? 'id' : 'code'] === value)), 'Kazanım kaynakta doğrulanamadı: ' + field + '=' + value);
    return lists[0].find(o => o[field === 'outcomeId' ? 'id' : 'code'] === value);
  };
  const byCode = resolveOutcome(outcomeCode, 'outcomeCode'), byId = resolveOutcome(outcomeId, 'outcomeId');
  ensure(!byCode || !byId || byCode.code === byId.code && byCode.id === byId.id, 'Kazanım kodu/kimliği uyuşmuyor.');
  return {subject, unit, topic, skill, outcome:byCode || byId,
    level:byCode || byId ? 'outcome' : detailed.length ? 'topic-skill' : 'unit-theme'};
}
