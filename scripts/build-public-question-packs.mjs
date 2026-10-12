import {mkdirSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {planQuestionFiles,isCurriculumFile} from './question-bank-plan.mjs';
import {loadCurriculumBank} from './curriculum-bank.mjs';
import {bankProjection} from '../shared/question-bank.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildPublicQuestionPacks(destination=join(root,'dist/question-packs')){
 const files=[];function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isSymbolicLink())continue;if(entry.isDirectory())visit(path);else if(entry.name.endsWith('.json')){const raw=readFileSync(path,'utf8');if(!isCurriculumFile(path,raw)&&! /^(?:manifest|schema)\.json$/i.test(entry.name))files.push({path,file:path,raw});}}}
 visit(join(root,'data/questions'));
 // CI receives only published public DTOs, never private prepared sources.
 // Vite has already copied public/question-packs into the output directory.
 if(files.length===0){
  const manifest=JSON.parse(readFileSync(join(destination,'manifest.json'),'utf8'));
  if(manifest.version!==1||!manifest.packs||!Object.keys(manifest.packs).length)throw Error('Published public question packs are missing');
  for(const [id,digest]of Object.entries(manifest.packs)){
   if(!/^[a-f0-9]{64}$/.test(id))throw Error('Invalid public pack ID');
   const body=readFileSync(join(destination,id+'.json'),'utf8');
   if(createHash('sha256').update(body).digest('hex')!==digest||/"(?:correctOptionId|correctChoiceId|explanation|answer|answers)"\s*:/.test(body))throw Error('Public pack integrity failure');
  }
  return {packs:Object.keys(manifest.packs).length,excludedFiles:0,source:'published-public-packs'};
 }
 const plan=planQuestionFiles(files),records=plan.banks.flatMap(b=>b.records),manifest={version:1,packs:{}};
 mkdirSync(destination,{recursive:true});
 for(const grade of new Set(plan.banks.map(b=>b.curriculum.grade))){
  const tree=loadCurriculumBank(join(root,'data'),{grade,records:records.filter(r=>r.question.gradeLevel===grade)}).curricula[0];
  const projection=await bankProjection(tree,records.filter(r=>r.question.gradeLevel===grade));
  for(const pack of projection.templates){
   // Projection contains private keys alongside public data. Only the immutable
   // public payload is serialized; active status is always checked by rules.
   const {active,...publicData}=pack.data,body=JSON.stringify(publicData);
   if(/"(?:correctOptionId|correctChoiceId|explanation|answer|answers)"\s*:/.test(body))throw Error('Private field in public pack');
   const sha256=createHash('sha256').update(body).digest('hex');writeFileSync(join(destination,pack.id+'.json'),body);manifest.packs[pack.id]=sha256;
  }
 }
 writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest));
 return {packs:Object.keys(manifest.packs).length,excludedFiles:plan.errors.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await buildPublicQuestionPacks()));
