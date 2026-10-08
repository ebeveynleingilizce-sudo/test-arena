import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {expandCurriculumMapping,curriculumExpansionPlan} from '../../functions/lib/question-engine/curriculum-mapping.js';
import {resolveGeneration} from '../../functions/lib/question-engine/orchestration-strategies.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url)));
const datasets=[{canonical:read('../../data/mufredat/2-sinif.json'),navigation:read('../../data/mufredat/2-sinif-ui-v2.json')}];
const base=read('../../data/question-engine/orchestration-policy.json'),policy=read('../../data/question-engine/curriculum-expansion-policy.json'),refill=read('../../data/question-engine/refill-policy.json');
const summary=async()=>({count:0,curated:0,aiVerified:0,byFamily:{},byDifficulty:{},fingerprints:[]});
test('3C baseline 219/2/217 is preserved; expansion safely enables six additional outcomes',async()=>{
  const r=await curriculumExpansionPlan(datasets,base,policy,refill,{summary});
  assert.equal(r.before.summary.discoveredScopes,219);assert.equal(r.before.summary.supportedScopes,2);assert.equal(r.before.summary.unsupportedScopes,217);
  assert.equal(r.before.unsupportedReasons.CURRICULUM_MAPPING_INCOMPLETE,171);
  assert.equal(r.after.summary.discoveredScopes,219);assert.equal(r.after.summary.supportedScopes,8);assert.equal(r.after.summary.unsupportedScopes,211);
});
test('171 actual roots: eight empty themes, twenty unmapped skills, 128 textless codes, fifteen unlinked subthemes',()=>{
  const {audits}=expandCurriculumMapping(datasets,base,policy),reasons={};
  for(const a of audits)if(a.reason)reasons[a.reason]=(reasons[a.reason]||0)+1;
  assert.deepEqual(reasons,{THEME_OUTCOME_LINK_MISSING:8,SKILL_THEME_LINK_MISSING:20,OUTCOME_TEXT_MISSING:128,TOPIC_OUTCOME_LINK_MISSING:15});
  assert.equal(audits.filter(a=>a.canonicalRelation==='EXACT').length,68);
});
test('academic skill outcome is recognized without inventing a navigation theme',()=>{
  const m=expandCurriculumMapping(datasets,base,policy),a=m.audits.find(a=>a.scope.outcomeCode==='T.O.2.2');
  assert.equal(a.canonicalRelation,'EXACT');assert.equal(a.navigationRelation,'UNRESOLVED');assert.ok(a.outcomeText);
  const row=m.expanded.find(i=>i.scope.outcomeCode==='T.O.2.2');assert.equal(row.reason,'SKILL_THEME_LINK_MISSING');assert.equal(row.context,undefined);assert.equal(row.scope.themeId,undefined);
});
test('English is not made supported by guessing L/R/W/S meaning or subtheme membership',()=>{
  const m=expandCurriculumMapping(datasets,base,policy),rows=m.expanded.filter(i=>i.scope.subjectId==='ingilizce');
  assert.equal(rows.length,143);assert.ok(rows.every(i=>!i.context));
  assert.ok(rows.filter(i=>i.scope.outcomeCode).every(i=>!i.scope.subthemeId));
});
test('deterministic math binding retained and other mathematical operations not sent to generic verifier',()=>{
  const m=expandCurriculumMapping(datasets,base,policy),math=m.expanded.filter(i=>i.scope.subjectId==='matematik');
  const usable=math.filter(i=>i.context);assert.equal(usable.length,1);
  assert.equal(resolveGeneration(usable[0].context,m.config).verification,'deterministic');
  assert.equal(math.filter(i=>i.reason==='DETERMINISTIC_OR_VISUAL_CAPABILITY_REQUIRED').length,24);
});
test('performance, source-dependent and special visual outcomes remain unsupported',async()=>{
  const r=await curriculumExpansionPlan(datasets,base,policy,refill,{summary});
  assert.equal(r.after.unsupportedReasons.PERFORMANCE_ASSESSMENT_REQUIRED,9);
  assert.equal(r.after.unsupportedReasons.SOURCE_OR_LOCAL_CONTEXT_REQUIRED,6);
  assert.equal(r.after.unsupportedReasons.SPECIAL_VISUAL_CAPABILITY_REQUIRED,1);
});
test('changed canonical text invalidates reviewed approval even when code remains unchanged',()=>{
  const changed=structuredClone(datasets),subject=changed[0].canonical.subjects.find(s=>s.id==='hayat-bilgisi');
  subject.themes[1].topics[0].outcomes[0].text='Sözlü veya yazılı performans oluşturabilme';
  const row=expandCurriculumMapping(changed,base,policy).expanded.find(i=>i.scope.outcomeCode==='HB.2.2.1');
  assert.equal(row.reason,'REVIEWED_OUTCOME_TEXT_CHANGED');assert.equal(row.context,undefined);
});
test('new unreviewed outcome fails closed instead of inheriting all-subject MCQ support',()=>{
  const d=structuredClone(datasets),s=d[0].canonical.subjects.find(s=>s.id==='hayat-bilgisi');
  s.themes[0].topics.push({id:'new-topic',outcomes:[{code:'HB.NEW',text:'Listening performance'}]});
  d[0].navigation.subjects.find(s=>s.id==='hayat-bilgisi').units[0].topics.push({id:'new-topic'});
  const row=expandCurriculumMapping(d,base,policy).expanded.find(i=>i.scope.outcomeCode==='HB.NEW');
  assert.equal(row.reason,'NO_REVIEWED_ASSESSMENT_STRATEGY');
});
test('approval does not manufacture topic relation or change canonical/navigation/config',()=>{
  const snapshot=JSON.stringify({datasets,base,policy});expandCurriculumMapping(datasets,base,policy);
  assert.equal(JSON.stringify({datasets,base,policy}),snapshot);
});
test('topic is optional for an exact theme-level canonical outcome with theme-test navigation',()=>{
  const d=[{canonical:{grade:2,schema_version:'1',dataset_id:'d',subjects:[{id:'new',themes:[{id:'theme',outcomes:[{code:'O',text:'Exact theme outcome'}]}]}]},
    navigation:{grade:2,sourceDatasetId:'d',subjects:[{id:'new',navigationModel:'theme-test',units:[{id:'theme'}]}]}}];
  const p={groups:[{match:{subjectId:'new'},strategy:'knowledge-mcq@1',family:'KNOWLEDGE_MCQ',approvedOutcomes:[{code:'O',text:'Exact theme outcome'}],blockedGroups:[]}]};
  const m=expandCurriculumMapping(d,{...base,bindings:[]},p),row=m.expanded[0];
  assert.ok(row.context);assert.equal(row.context.topicId,undefined);assert.equal(resolveGeneration(row.context,m.config).status,'SUPPORTED');
});
test('conflicting or duplicate assessment approvals stop instead of bypassing restrictions',()=>{
  const p=structuredClone(policy);p.groups[0].approvedOutcomes.push(p.groups[0].approvedOutcomes[1]);
  assert.throws(()=>expandCurriculumMapping(datasets,base,p),/DUPLICATE_APPROVAL/);
});
test('read-only planning has no callable AI/refill/write dependency',async()=>{
  const r=await curriculumExpansionPlan(datasets,base,policy,refill,{summary,publish:()=>assert.fail(),acquire:()=>assert.fail()});
  assert.equal(r.after.generatorCalls,0);assert.equal(r.after.verifierCalls,0);assert.equal(r.after.publications,0);
  const source=readFileSync(new URL('../../functions/src/question-engine/curriculum-mapping.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/new Gemini|geminiRefillRuntime|refillPool\(|\.publish\(|\.acquire\(|\.verify\(|\.generateQuestions\(/);
});
