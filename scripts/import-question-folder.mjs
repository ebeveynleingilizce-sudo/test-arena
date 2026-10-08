import {readdirSync,readFileSync,realpathSync,lstatSync,mkdirSync,openSync,closeSync,unlinkSync,writeFileSync,renameSync,existsSync} from 'node:fs';
import {join,relative,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {initializeApp,getApps,deleteApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {prepareQuestionBank} from './curriculum-bank.mjs';
import {publishPackageImages} from './package-images.mjs';
const project=fileURLToPath(new URL('../',import.meta.url));
const defaultFolder=join(project,'data/questions');
const state=join(project,'.firebase/question-bank-sync');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function assertLocalSync(){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||(process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'demo-test-arena')!=='demo-test-arena')throw Error('Yalnız local demo-test-arena emulator desteklenir.');
}
function scan(folder){
 const base=realpathSync(folder),files=[];if(relative(project,base).startsWith('..')||lstatSync(folder).isSymbolicLink())throw Error('Kaynak proje dışında.');
 function visit(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(lstatSync(p).isSymbolicLink())throw Error('Sembolik bağlantı kabul edilmez.');if(e.isDirectory())visit(p);else if(e.isFile()&&e.name.toLowerCase().endsWith('.json')&&!/^(manifest|schema)\.json$/i.test(e.name)){const raw=readFileSync(p,'utf8');files.push({path:p,file:relative(base,p),raw,hash:digest(raw)});}}}
 visit(base);return files.sort((a,b)=>a.file.localeCompare(b.file));
}
function lock(){mkdirSync(state,{recursive:true});const path=join(state,'sync.lock');
 try{const fd=openSync(path,'wx');writeFileSync(fd,String(process.pid));closeSync(fd);}catch(e){if(e.code!=='EEXIST')throw e;let pid=Number(readFileSync(path,'utf8'));try{process.kill(pid,0);throw Object.assign(Error('Başka bir soru bankası güncellemesi devam ediyor.'),{code:'SYNC_BUSY'});}catch(err){if(err.code!=='ESRCH')throw err;unlinkSync(path);return lock();}}
 return ()=>unlinkSync(path);
}
export async function importQuestionFolder({folder=defaultFolder,log=console.log}={}){
 assertLocalSync();
 const absolute=resolve(folder);if(absolute!==resolve(defaultFolder))throw Error('Sync requires the fixed data/questions directory.');
 const release=lock();
 try{
 const registryFile=join(state,'managed.json');let managed=existsSync(registryFile)?JSON.parse(readFileSync(registryFile,'utf8')):{};
 if(!managed||typeof managed!=='object'||Array.isArray(managed)||Object.entries(managed).some(([id,v])=>!/^[-A-Za-z0-9_]{1,128}$/.test(id)||!v||!/^[a-f0-9]{64}$/.test(v.question)||!/^[a-f0-9]{64}$/.test(v.answer)||(v.removed!==undefined&&typeof v.removed!=='boolean')))throw Error('Invalid local ownership registry; sync stopped.');
 Object.setPrototypeOf(managed,null);
 const save=()=>{const tmp=registryFile+'.tmp';writeFileSync(tmp,JSON.stringify(managed,null,2));renameSync(tmp,registryFile);};
 const app=getApps().find(a=>a.name==='prepared-bank-import')||initializeApp({projectId:'demo-test-arena'},'prepared-bank-import'),db=getFirestore(app);
 const report={files:[],scanned:0,validBanks:0,imported:0,unchanged:0,removedQuestions:0,removedAnswers:0,conflicts:0,failed:0,deletionSkipped:false,totalActive:0,completedAt:''};
 let files=[];try{files=scan(absolute);}catch{report.failed++;report.files.push({file:'data/questions',ok:false,reason:'Kaynak klasör güvenli biçimde taranamadı.'});}
 report.scanned=files.length;const desired=new Map(),banks=[];
 for(const f of files){try{let bank;try{bank=JSON.parse(f.raw);}catch{throw Error('JSON okunamadı/geçersiz.');}const prepared=prepareQuestionBank(bank,undefined,{packageDirectory:dirname(f.path)});
  for(const r of prepared.records){const id=r.question.questionId;if(desired.has(id))throw Error('Bankalar arasında tekrarlanan soru ID: '+id);desired.set(id,r);}
  banks.push({...f,records:prepared.records,curriculum:prepared.curricula[0],assets:prepared.assets});report.validBanks++;
 }catch(e){report.failed++;report.files.push({file:f.file,ok:false,reason:e.code?'Müfredat veya kaynak dosyası okunamadı.':String(e.message).slice(0,240)});}}
 for(const bank of banks){try{publishPackageImages(bank.assets,join(project,'public/assets/question-images'));const result=await db.runTransaction(async tx=>{
  const curriculumRef=db.doc('curricula/'+bank.curriculum.grade),curriculum=await tx.get(curriculumRef);
  if(curriculum.exists&&curriculum.data().sourceDatasetId!==bank.curriculum.sourceDatasetId)throw Error('Existing curriculum source differs.');
  const refs=bank.records.flatMap(r=>[db.doc('questions/'+r.question.questionId),db.doc('privateQuestionAnswers/'+r.question.questionId)]),old=await tx.getAll(...refs);
  const accepted=[];let imported=0,unchanged=0,conflicts=0;
  for(const [i,r]of bank.records.entries()){const pair=old.slice(i*2,i*2+2),values=[r.question,r.answer];if((managed[r.question.questionId]&&(managed[r.question.questionId].question!==digest(r.question)||managed[r.question.questionId].answer!==digest(r.answer)))||pair.some((d,j)=>d.exists&&!isDeepStrictEqual(d.data(),values[j]))){conflicts++;continue;}accepted.push(r);pair.every(d=>d.exists)?unchanged++:imported++;}
  // Ownership is durable before a Firestore commit, so an interrupted import remains recoverable.
  for(const r of accepted)managed[r.question.questionId]={question:digest(r.question),answer:digest(r.answer)};save();
  // Provision a newly defined canonical grade once; never rewrite existing curricula.
  if(!curriculum.exists&&accepted.length)tx.create(curriculumRef,bank.curriculum);
  for(const [i,r]of bank.records.entries())if(accepted.includes(r))for(const [j,v]of [r.question,r.answer].entries())if(!old[i*2+j].exists)tx.create(refs[i*2+j],v);
  return {imported,unchanged,conflicts};
 });report.imported+=result.imported;report.unchanged+=result.unchanged;report.conflicts+=result.conflicts;
 const entry={file:bank.file,ok:result.conflicts===0,...result,...(result.conflicts?{reason:`${result.conflicts} soru değişmiş ancak aynı ID kullanılmış. Yeni question ID kullanın.`}:{})};report.files.push(entry);
 }catch{report.failed++;report.files.push({file:bank.file,ok:false,reason:'Local Firestore import işlemi başarısız; silme iptal edildi.'});}}
 if(!report.failed&&!report.conflicts){try{const current=scan(absolute);if(digest(current.map(f=>[f.file,f.hash]))!==digest(files.map(f=>[f.file,f.hash])))throw Error('changed');}catch{report.failed++;report.files.push({file:'data/questions',ok:false,reason:'Tarama sırasında kaynak değişti; silme iptal edildi.'});}}
 report.deletionSkipped=!!(report.failed||report.conflicts);

 if(!report.deletionSkipped){
  const orphanIds=Object.keys(managed).filter(id=>!desired.has(id)&&!managed[id].removed);
  for(let offset=0;offset<orphanIds.length;offset+=100){const ids=orphanIds.slice(offset,offset+100);
   const outcomes=await db.runTransaction(async tx=>{const refs=ids.flatMap(id=>[db.doc('questions/'+id),db.doc('privateQuestionAnswers/'+id)]),docs=await tx.getAll(...refs);
    return ids.map((id,i)=>{const pair=docs.slice(i*2,i*2+2),saved=managed[id];if(pair.some((d,j)=>d.exists&&digest(d.data())!==saved[j===0?'question':'answer']))return {id,unsafe:true,q:0,a:0};pair.forEach((d,j)=>{if(d.exists)tx.delete(refs[i*2+j]);});return {id,unsafe:false,q:Number(pair[0].exists),a:Number(pair[1].exists)};});
   });
   for(const outcome of outcomes){if(outcome.unsafe){report.failed++;report.files.push({file:outcome.id,ok:false,reason:'Managed record changed externally; preserved.'});continue;}report.removedQuestions+=outcome.q;report.removedAnswers+=outcome.a;managed[outcome.id].removed=true;}save();
  }
 }

 report.totalActive=(await db.collection('questions').where('status','==','published').get()).size;report.completedAt=new Date().toISOString();
 log(`Question bank sync: files scanned ${report.scanned}; valid banks ${report.validBanks}; new questions ${report.imported}; unchanged ${report.unchanged}; removed questions ${report.removedQuestions}; removed private answers ${report.removedAnswers}; conflicts ${report.conflicts}; errors ${report.failed}.`);
 for(const f of report.files.filter(f=>!f.ok))log(`[SORU BANKASI] ${f.file}: ${f.reason}`);
 if(report.deletionSkipped)log('Güvenlik nedeniyle silme senkronizasyonu yapılmadı.');return report;
 }finally{release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{await importQuestionFolder();}catch{console.error('Local soru bankası sync başlatılamadı.');process.exitCode=1;}finally{await Promise.all(getApps().filter(a=>a.name==='prepared-bank-import').map(deleteApp));}}
