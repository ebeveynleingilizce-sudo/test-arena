import {readFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCurriculumBank,prepareQuestionBank} from './curriculum-bank.mjs';
const dataRoot=fileURLToPath(new URL('../data/',import.meta.url));
export function isCurriculumFile(file,raw){
 if(/(?:^|[\\/])\d+-sinif(?:-ui(?:-v\d+)?)?(?:-eslesmis)?\.json$/i.test(file))return true;
 try{const value=JSON.parse(raw);return Array.isArray(value.subjects)&&!Array.isArray(value.questions)&&(value.dataset_id||value.sourceDatasetId);}catch{return false;}
}
// Per-run preflight: no module/mtime cache, and one diagnostic per broken grade.
export function planQuestionFiles(files,root=dataRoot){
 const banks=[],errors=[],parsed=[],contexts=new Map();
 for(const f of files){try{parsed.push({...f,bank:JSON.parse(f.raw)});}catch{errors.push({file:f.file,ok:false,reason:'JSON okunamadı/geçersiz.'});}}
 for(const grade of new Set(parsed.map(f=>f.bank?.grade).filter(g=>Number.isInteger(g)&&g>=2&&g<=12))){
  try{contexts.set(grade,{canonical:JSON.parse(readFileSync(join(root,`mufredat/${grade}-sinif.json`),'utf8')),navigation:loadCurriculumBank(root,{grade,records:[]}).curricula[0]});}
  catch(e){contexts.set(grade,null);errors.push({file:`mufredat/${grade}-sinif.json + ${grade}-sinif-ui-v2.json`,ok:false,reason:e.message,affectedFiles:parsed.filter(f=>f.bank.grade===grade).map(f=>f.file)});}
 }
 const desired=new Set();
 for(const f of parsed){if(contexts.get(f.bank?.grade)===null)continue;try{
  const p=prepareQuestionBank(f.bank,root,{packageDirectory:dirname(f.path),curriculumContext:contexts.get(f.bank?.grade)});
  for(const r of p.records)if(desired.has(r.question.questionId))throw Error('Bankalar arasında tekrarlanan soru ID: '+r.question.questionId);
  p.records.forEach(r=>desired.add(r.question.questionId));banks.push({...f,records:p.records,curriculum:p.curricula[0],assets:p.assets});
 }catch(e){errors.push({file:f.file,ok:false,reason:e.message});}}
 return {banks,errors};
}
