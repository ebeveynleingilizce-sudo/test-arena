import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveCurriculumContext } from '../../functions/lib/question-engine/curriculum.js';
import { validateCommon } from '../../functions/lib/question-engine/common-validator.js';
import { ValidatorRegistry } from '../../functions/lib/question-engine/registry.js';
import { DuplicateIndex, fingerprint } from '../../functions/lib/question-engine/fingerprint.js';
import { dryRun, validateCandidate } from '../../functions/lib/question-engine/pipeline.js';
import { BaseTenFixtureProvider, baseTenValidator, BASE_TEN_CAPABILITY } from '../../functions/lib/question-engine/fixtures/base-ten.js';

// Local files only. No Firebase imports, seed, network, UI or publication.
const canonical=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif.json',import.meta.url)));
const navigation=JSON.parse(readFileSync(new URL('../../data/mufredat/2-sinif-ui-v2.json',import.meta.url)));
const scope={grade:2,subjectId:'matematik',unitId:'g2-matematik-sayilar-ve-nicelikler-1',topicId:'g2-matematik-sayilari-cozumleme',outcomeCode:'MAT.2.1.2'};
const context=resolveCurriculumContext(canonical,navigation,scope);
const provider=new BaseTenFixtureProvider();
const registry=()=>new ValidatorRegistry().register(baseTenValidator([context]));
const candidate=async()=>structuredClone((await provider.generateQuestions(context,{count:1}))[0]);
const validate=(c,index=new DuplicateIndex(),r=registry(),capability=BASE_TEN_CAPABILITY)=>validateCandidate(context,c,capability,r,index);
const rejected=result=>{assert.equal(result.decision,'REJECT');assert.equal(result.dryRun,true);assert.ok(result.issues.length);};

test('ACCEPT: canonical context → provider → common → independent solver → dry-run gate',async()=>{
  assert.equal(context.outcomeText,'İki basamaklı sayıları çözümleyebilme');assert.equal(context.datasetId,canonical.dataset_id);
  assert.equal(context.curriculumVersion,canonical.schema_version);assert.equal(context.navigationModel,'unit-topic-test');assert.ok(Object.isFrozen(context));
  const [result]=await dryRun(context,provider,{count:1},BASE_TEN_CAPABILITY,registry());
  assert.equal(result.decision,'ACCEPT');assert.equal(result.dryRun,true);assert.equal(result.solvedOptionId,'a');assert.equal(result.fingerprints.content.length,64);
  assert.deepEqual(Object.keys(result).sort(),['decision','dryRun','fingerprints','solvedOptionId']);
});

test('ACCEPT: provider can place correct value under any valid option ID',async()=>{
  const c=await candidate();[c.options[0].id,c.options[1].id]=[c.options[1].id,c.options[0].id];c.correctOptionId='b';
  const r=validate(c);assert.equal(r.decision,'ACCEPT');assert.equal(r.solvedOptionId,'b');
});

test('ACCEPT: bounded fixture samples independently recompute 0, 37 and 99',async()=>{
  const p=new BaseTenFixtureProvider([{tens:0,ones:0},{tens:3,ones:7},{tens:9,ones:9}]);
  const results=await dryRun(context,p,{count:3},BASE_TEN_CAPABILITY,registry());assert.deepEqual(results.map(r=>r.decision),['ACCEPT','ACCEPT','ACCEPT']);
});

for(const explanation of [
  '3 onluk ve 7 birlik 37 eder.',
  '30 + 7 = 37.',
  '3 × 10 + 7 = 37.',
  "Üç onluk 30, yedi birlik 7'dir. Toplam 37 olur.",
  '3 onluk = 30; 7 birlik = 7. 30 + 7 = 37.',
  'Toplam otuz yedi olur.',
])test('ACCEPT: independently verified explanation: '+explanation,async()=>{
  const c=await candidate();c.explanation=explanation;assert.equal(validate(c).decision,'ACCEPT');
});

for(const explanation of [
  '3 onluk ve 7 birlik 38 eder.',
  '30 + 7 = 38.',
  "Üç onluk 40, yedi birlik 7'dir. Toplam 37 olur.",
  '30 + 8 = 37.',
  '4 × 10 + 7 = 37.',
  'Toplam otuz sekiz olur.',
  '3 onluk ve 7 birlik 37 etmez.',
  'Toplam 37 olur. 3 onluk 40 eder.',
  'Toplam 37 olur. Bilinmeyen bir iddia.',
])test('REJECT: incorrect or unprovable explanation: '+explanation,async()=>{
  const c=await candidate();c.explanation=explanation;const result=validate(c);rejected(result);assert.equal(result.issues[0].code,'EXPLANATION_MISMATCH');
});

test('independent solver remains authoritative: correct natural explanation cannot rescue wrong key',async()=>{
  const c=await candidate();c.explanation='3 onluk ve 7 birlik 37 eder.';c.correctOptionId='b';
  const result=validate(c);rejected(result);assert.equal(result.issues[0].code,'ANSWER_MISMATCH');
});

for(const [name,mutate] of [
  ['wrong answer key',c=>c.correctOptionId='b'],
  ['wrong grade',c=>c.scope.grade=3],
  ['wrong subject',c=>c.scope.subjectId='other-subject'],
  ['wrong unit',c=>c.scope.unitId='other-unit'],
  ['wrong topic',c=>c.scope.topicId='other-topic'],
  ['wrong outcome',c=>c.scope.outcomeCode='MAT.2.1.1'],
  ['wrong dataset version',c=>c.scope.datasetId='other-dataset'],
  ['wrong curriculum version',c=>c.scope.curriculumVersion='other-version'],
  ['wrong outcome text',c=>c.scope.outcomeText='Invented outcome'],
  ['wrong navigation model',c=>c.scope.navigationModel='other-model'],
  ['nonexistent option ID',c=>c.correctOptionId='z'],
  ['duplicate option IDs',c=>c.options[1].id='a'],
  ['normalized duplicate options',c=>{c.options[0].text='Same';c.options[1].text='  ＳＡＭＥ  ';}],
  ['empty option',c=>c.options[0].text=' '],
  ['two options',c=>c.options.pop()],
  ['unknown type',c=>c.type='essay'],
  ['unknown difficulty',c=>c.difficulty='expert'],
  ['unsupported visual',c=>c.visual.kind='shape-sequence'],
  ['malformed visual count',c=>c.visual.tens=10],
  ['malformed visual field',c=>c.visual.ones='7'],
  ['visual raw SVG',c=>c.visual.svg='<svg/>'],
  ['visual URL',c=>c.visual.url='https://example.test/picture.png'],
  ['missing visual alt',c=>delete c.visual.alt],
  ['visual does not match model',c=>c.visual.tens=4],
  ['missing required visual',c=>{delete c.visual;delete c.visualPlacement;}],
  ['wrong model family',c=>c.family='UNKNOWN_FAMILY'],
  ['extra model field',c=>c.model.answer=37],
  ['wrong explanation',c=>c.explanation='3 × 10 + 7 = 38'],
  ['question contradicts controlled model',c=>c.question='Görseldeki sayının iki katı kaçtır?'],
  ['alt leaks computed answer',c=>c.visual.alt='37 sayısı'],
  ['raw HTML question',c=>c.question='<b>Soru</b>'],
  ['executable content',c=>c.explanation='eval("37")'],
  ['arbitrary URL option',c=>c.options[0].text='https://example.test'],
  ['non-JSON executable field',c=>c.model.run=()=>37],
  ['unknown option metadata',c=>c.options[0].isCorrect=true],
  ['numeric aliases create multiple correct values',c=>c.options[1].text='037'],
  ['no option matches computed value',c=>c.options[0].text='36'],
  ['missing model',c=>delete c.model],
  ['missing scope',c=>delete c.scope],
]) test('REJECT: '+name,async()=>{const c=await candidate();mutate(c);rejected(validate(c));});

for(const claim of ['verified','approved','published','trusted'])test('REJECT: candidate self-declares '+claim,async()=>{
  const c=await candidate();c[claim]=true;rejected(validate(c));
});

test('REJECT: unknown capability/domain and out-of-profile exact context',async()=>{
  const c=await candidate();rejected(validate(c,new DuplicateIndex(),registry(),'unknown-domain'));
  const r=new ValidatorRegistry().register(baseTenValidator([]));rejected(validate(c,new DuplicateIndex(),r));
});

test('REJECT: validator exceptions, missing solution and duplicate registration fail closed',async()=>{
  const c=await candidate();
  const throwing={capability:BASE_TEN_CAPABILITY,supports:()=>true,validate:()=>{throw new Error('broken');}};
  rejected(validate(c,new DuplicateIndex(),new ValidatorRegistry().register(throwing)));
  rejected(validate(c,new DuplicateIndex(),new ValidatorRegistry().register({...throwing,validate:()=>({valid:true,solvedOptionId:'z'})})));
  const r=registry();assert.throws(()=>r.register(baseTenValidator([context])),/DUPLICATE_CAPABILITY/);
});

test('REJECT: duplicate; ID, option order, answer label and difficulty do not evade fingerprint',async()=>{
  const c=await candidate(),index=new DuplicateIndex();assert.equal(validate(c,index).decision,'ACCEPT');
  c.candidateId='new-id';c.difficulty='hard';c.options.reverse();
  [c.options[0].id,c.options[2].id]=[c.options[2].id,c.options[0].id];c.correctOptionId='c';
  const r=validate(c,index);rejected(r);assert.equal(r.issues[0].code,'DUPLICATE');
});

test('fingerprints normalize text/order and ignore alt; structural variations retain family/model',async()=>{
  const c=await candidate(),copy=structuredClone(c),initial=fingerprint(c);
  copy.question='  '+copy.question.toLocaleUpperCase('tr-TR')+'  ';copy.options.reverse();copy.visual.alt='Başka erişilebilir açıklama';
  assert.deepEqual(fingerprint(copy),initial);
  copy.question='Ali yerine Ayşe';assert.equal(fingerprint(copy).structural,initial.structural);assert.notEqual(fingerprint(copy).content,initial.content);
});

test('rejected candidates do not poison duplicate index; dry-run batch detects its own duplicates',async()=>{
  const c=await candidate(),index=new DuplicateIndex();c.correctOptionId='b';rejected(validate(c,index));c.correctOptionId='a';assert.equal(validate(c,index).decision,'ACCEPT');
  const p=new BaseTenFixtureProvider([{tens:3,ones:7},{tens:3,ones:7}]);
  assert.deepEqual((await dryRun(context,p,{count:2},BASE_TEN_CAPABILITY,registry())).map(r=>r.decision),['ACCEPT','REJECT']);
});

test('unresolved/forged context is rejected before provider invocation',async()=>{
  let called=false;const p={id:'test-provider',generateQuestions:async()=>{called=true;return [];}};
  rejected((await dryRun({...context},p,{count:1},BASE_TEN_CAPABILITY,registry()))[0]);assert.equal(called,false);
  rejected(validateCandidate({...context},await candidate(),BASE_TEN_CAPABILITY,registry()));
});

test('invalid batches, count limits and provider errors fail closed',async()=>{
  for(const count of [0,21,1.5])rejected((await dryRun(context,provider,{count},BASE_TEN_CAPABILITY,registry()))[0]);
  for(const output of [[],{},[await candidate(),await candidate()]])rejected((await dryRun(context,{id:'bad',generateQuestions:async()=>output},{count:1},BASE_TEN_CAPABILITY,registry()))[0]);
  rejected((await dryRun(context,{id:'bad',generateQuestions:async()=>{throw new Error('offline');}},{count:1},BASE_TEN_CAPABILITY,registry()))[0]);
});

test('common validator rejects duplicate visual-only options despite different alt text',async()=>{
  const c=await candidate();c.options[0]={id:'a',text:'',visual:{kind:'geometry',shape:'cube',alt:'Küp modeli'}};
  c.options[1]={id:'b',text:'',visual:{kind:'geometry',shape:'cube',alt:'Aynı modelin açıklaması'}};
  assert.equal(validateCommon(context,c).valid,false);
});

test('canonical resolver rejects grade/subject/unit/topic/outcome mismatches and cross-topic outcomes',()=>{
  for(const delta of [{grade:1},{grade:13},{grade:3},{subjectId:'unknown'},{unitId:'unknown'},{topicId:'unknown'},{outcomeCode:'unknown'},{outcomeCode:'MAT.2.1.1'}])assert.throws(()=>resolveCurriculumContext(canonical,navigation,{...scope,...delta}));
  assert.throws(()=>resolveCurriculumContext(canonical,{...navigation,sourceDatasetId:'wrong'},scope));
  assert.throws(()=>resolveCurriculumContext(canonical,navigation,{...scope,themeId:'g2-matematik-nesnelerin-geometrisi-1'}));
});

test('Turkish navigation theme and technical skill domain remain separate',()=>{
  const ctx=resolveCurriculumContext(canonical,navigation,{grade:2,subjectId:'turkce',themeId:'g2-turkce-degerlerimizle-variz',unitId:'g2-turkce-dinleme-izleme',outcomeCode:'T.D.2.1'});
  assert.equal(ctx.navigationModel,'theme-test');assert.equal(ctx.outcomeText,'Dinlemeyi/izlemeyi yönetebilme');assert.notEqual(ctx.themeId,ctx.unitId);
});

test('English code lists do not invent exact subtheme/outcome mappings',()=>{
  assert.throws(()=>resolveCurriculumContext(canonical,navigation,{grade:2,subjectId:'ingilizce',themeId:'g2-ingilizce-school-life',subthemeId:'g2-ingilizce-school-life-days-of-the-week',outcomeCode:'ENG.2.1.R1'}),/NO_EXACT_OUTCOME/);
});

test('data-only contract fixture supports arbitrary new subject IDs, Theme/Subtheme and grades 2–12',()=>{
  // Synthetic contract data only; never imported as real curriculum or question content.
  for(let grade=2;grade<=12;grade++){
    const node={id:'theme',subthemes:[{id:'subtheme',outcomes:[{code:'FIXTURE.1',text:'Contract fixture outcome'}]}]};
    const source={grade,schema_version:'fixture-v1',dataset_id:'fixture-'+grade,subjects:[{id:'new-subject',themes:[node]}]};
    const nav={grade,sourceDatasetId:source.dataset_id,subjects:[{id:'new-subject',navigationModel:'theme-topic-test',units:[node]}]};
    const ctx=resolveCurriculumContext(source,nav,{grade,subjectId:'new-subject',themeId:'theme',subthemeId:'subtheme',outcomeCode:'FIXTURE.1'});
    assert.equal(ctx.grade,grade);assert.equal(ctx.subjectId,'new-subject');assert.equal(baseTenValidator([context]).supports(ctx),false);
  }
});

test('core imports have no publication, Firebase, Gemini or app-entry dependencies',()=>{
  for(const name of ['contracts','curriculum','fingerprint','common-validator','registry','quality-gate','pipeline','fixtures/base-ten']){
    const text=readFileSync(new URL('../../functions/src/question-engine/'+name+'.ts',import.meta.url),'utf8');
    assert.doesNotMatch(text,/from\s+['"](?:firebase|@google|.*(?:quiz|analytics|arena|index)\.js)/);
  }
  const entry=readFileSync(new URL('../../functions/src/index.ts',import.meta.url),'utf8');assert.equal(entry.includes('question-engine'),false);
});
