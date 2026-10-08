import {stopAIGeneration} from './ai-generation-disabled.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Firestore} from 'firebase-admin/firestore';
import {englishGrade2Content} from '../functions/lib/question-engine/english-grade2-content.js';
import {englishGrade2PilotProfile} from '../functions/lib/question-engine/providers/english-grade2-pilot.js';
import {profileContexts} from '../functions/lib/question-engine/school-life.js';
import {geminiRefillRuntime} from '../functions/lib/question-engine/refill-runtime.js';
import {EmulatorRefillStore} from '../functions/lib/question-engine/refill-store.js';
import {refillPool} from '../functions/lib/question-engine/refill.js';
import {resolveRefillPolicy} from '../functions/lib/question-engine/refill-policy.js';
import {requirePublicationEmulator} from '../functions/lib/question-engine/publication.js';
import {acceptedSnapshot} from '../functions/lib/question-engine/accepted.js';

stopAIGeneration();
const flags=process.argv.slice(2).join(' '),oneBatch=flags==='--resume --generate --publish --one-batch',resume=oneBatch||flags==='--resume --generate --publish';
if(!resume&&flags!=='--clean --generate --publish')throw Error('EXPLICIT_LOCAL_PILOT_FLAGS_REQUIRED');
process.env.FIRESTORE_EMULATOR_HOST||='127.0.0.1:8080';requirePublicationEmulator();
if(!process.env.GEMINI_API_KEY?.trim())throw Error('MISSING_API_KEY');
const db=new Firestore({projectId:'demo-test-arena',host:'127.0.0.1:8080',ssl:false});
const read=path=>JSON.parse(readFileSync(path));
const canonical=read('data/mufredat/2-sinif.json'),nav=read('data/mufredat/2-sinif-ui-v2.json');
const config=read('data/question-engine/refill-policy.json');
const topics=[0,1,0,0,0,0];
const plans=englishGrade2Content.map((unit,i)=>{
  const profile=englishGrade2PilotProfile(unit.unitId,unit.subthemes[topics[i]].id),contexts=profileContexts(canonical,nav,profile);
  // Manual pilot target only; defaults and all generation/token hard limits unchanged.
  const policy=resolveRefillPolicy({...config,targets:[...config.targets,{match:{grade:2,subjectId:'ingilizce',unitId:unit.unitId},targetVerifiedQuestions:15}]},contexts[0],profile.family);
  return {unit,profile,contexts,policy};
});
const isEnglish=q=>(q.gradeLevel??q.grade)===2&&(q.subjectId??q.subject)==='ingilizce';
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
let store;
const report=resume?read('.firebase/english-pilot/report.json'):{cleanup:{questions:0,answers:0,fingerprints:0},units:[],tokenUsage:{input:0,output:0,thinking:0,total:0,unknownUsageCalls:0},rateLimited:false};
report.rateLimited=false;
try {
  const all=await db.collection('questions').get(),selected=all.docs.filter(d=>isEnglish(d.data()));
  const otherQuestions=all.docs.filter(d=>!isEnglish(d.data())).map(d=>[d.id,d.data()]).sort();
  const indexes=await db.collection('questionFingerprints').get(),ids=new Set(selected.map(d=>d.id));
  const linked=indexes.docs.filter(d=>ids.has(d.data().questionId));
  const answers=selected.length?await db.getAll(...selected.map(d=>db.doc('privateQuestionAnswers/'+d.id))):[];
  mkdirSync('.firebase/english-pilot',{recursive:true});
  if(!resume)writeFileSync('.firebase/english-pilot/questions-before.json',JSON.stringify({questions:selected.map(d=>({id:d.id,...d.data()})),answers:answers.filter(d=>d.exists).map(d=>({id:d.id,...d.data()})),fingerprints:linked.map(d=>({id:d.id,...d.data()}))},null,2));
  // One transaction, recheck selectors and documents before deletion. Never touches history/auth/XP.
  if(selected.length+answers.length+linked.length>450)throw Error('CLEANUP_TOO_LARGE_FOR_PILOT');
  if(!resume)await db.runTransaction(async tx=>{
    if(!selected.length)return;
    const fresh=await tx.getAll(...selected.map(d=>d.ref));
    if(fresh.some(d=>!d.exists||!isEnglish(d.data())))throw Error('CLEANUP_SCOPE_CHANGED');
    for(const d of selected)tx.delete(d.ref);
    for(const d of answers)if(d.exists)tx.delete(d.ref);
    for(const d of linked)tx.delete(d.ref);
  });
  if(!resume)report.cleanup={questions:selected.length,answers:answers.filter(d=>d.exists).length,fingerprints:linked.length};
  console.log(JSON.stringify({event:resume?'resume-without-deletion':'cleanup',...report.cleanup}));
  writeFileSync('.firebase/english-pilot/replacement-active.json',JSON.stringify({grade:2,subjectId:'ingilizce',reason:'Local pilot replacement; do not re-seed legacy English demo questions'}));
  store=new EmulatorRefillStore();
  for(let {unit,profile,contexts,policy:basePolicy}of plans){
    if(report.rateLimited)break;
    const previous=report.units.find(u=>u.unitId===unit.unitId);
    if(previous?.finalCount>=15||!oneBatch&&previous?.stopReason==='HARD_LIMIT')continue;
    const policy={...basePolicy};
    const existing=await db.collection('questions').where('gradeLevel','==',2).where('subjectId','==','ingilizce').where('unitId','==',unit.unitId).get();
    if(oneBatch){
      const candidates=unit.subthemes.filter(t=>unit.unitId!=='g2-ingilizce-school-life'||['g2-ingilizce-school-life-greetings-and-introductions-at-school','g2-ingilizce-school-life-people-and-places-at-school'].includes(t.id));
      const count=id=>existing.docs.filter(d=>d.data().topic===id).length;
      const topic=[...candidates].sort((a,b)=>count(a.id)-count(b.id))[0];
      profile=englishGrade2PilotProfile(unit.unitId,topic.id);
      contexts=profileContexts(canonical,nav,profile);
      policy.targetVerifiedQuestions=15-(existing.size-count(topic.id));
    }
    // A separately invoked manual follow-up is bounded to one batch, retaining
    // every original per-run token/provider/verifier ceiling and the target 15.
    if(oneBatch)policy.maxBatches=1;
    else {
      for(const [key,counter]of Object.entries({maxBatches:'batches',maxGeneratedCandidates:'requestedCandidates',maxProviderCalls:'generatorCalls',maxVerifierCalls:'verifierCalls'}))policy[key]-=previous?.[counter]??0;
      policy.maxTotalTokens-=previous?.tokenUsage.total??0;
    }
    if(Object.entries(policy).some(([key,value])=>key.startsWith('max')&&value<1))continue;
    const usage={input:0,output:0,thinking:0,total:0,unknownUsageCalls:0};
    let lastRequest=0;
    const transport=async(url,options)=>{
      // Local pilot pacing only; quota errors still stop the run without retries.
      const wait=Math.max(0,20000-(Date.now()-lastRequest));
      if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
      lastRequest=Date.now();
      const response=await fetch(url,options);
      if(response.status===429)report.rateLimited=true;
      try {const payload=await response.clone().json(),u=payload.usageMetadata;
        if(!u||!Number.isInteger(u.totalTokenCount))usage.unknownUsageCalls++;
        else {usage.input+=u.promptTokenCount??0;usage.output+=u.candidatesTokenCount??0;usage.thinking+=u.thoughtsTokenCount??0;usage.total+=u.totalTokenCount;}
      }catch {usage.unknownUsageCalls++;}
      return response;
    };
    const published=existing.docs.map(d=>({question:d.data().questionText}));let batch=0;
    const result=await refillPool({context:contexts[0],family:profile.family,policy,mode:'publish',verification:'independent_ai',store,
      createRuntime:budget=>{
        const runtime=geminiRefillRuntime(contexts[0],profile,policy,budget,transport,contexts);
        return {...runtime,provider:{id:runtime.provider.id,async generateQuestions(context,request){
          console.log(JSON.stringify({event:'batch',unit:unit.name,batch:++batch,requested:request.count}));
          if(report.rateLimited)throw Error('RATE_LIMIT_STOP');
          const avoid=published.length?['Do not repeat these already accepted facts/functions or create name/option-order variants: '+published.map(q=>q.question).join(' | ')]:[];
          const current={...profile,generationRules:[...profile.generationRules,...avoid],variants:profile.variants.map(p=>({...p,generationRules:[...p.generationRules,...avoid]}))};
          return geminiRefillRuntime(contexts[0],current,policy,budget,transport,contexts).provider.generateQuestions(context,request);
        }},async validate(candidate,duplicates){
          const result=await runtime.validate(candidate,duplicates);
          const snapshot=acceptedSnapshot(result);
          if(snapshot){published.push(snapshot.candidate);console.log(JSON.stringify({event:'accepted',unit:unit.name,count:published.length,family:snapshot.candidate.family}));}
          else console.log(JSON.stringify({event:'rejected',unit:unit.name,reasons:result.issues?.map(i=>i.code)}));
          return result;
        }};
      }});
    const pool=await db.collection('questions').where('gradeLevel','==',2).where('subjectId','==','ingilizce').where('unitId','==',unit.unitId).get();
    const familyDistribution={};for(const q of pool.docs){const family=q.data().provenance?.questionFamily??'unknown';familyDistribution[family]=(familyDistribution[family]??0)+1;}
    const cumulative={...result};
    cumulative.finalCount=pool.size;cumulative.remainingGap=Math.max(0,15-pool.size);cumulative.targetCount=15;
    if(previous){for(const key of ['generated','requestedCandidates','accepted','rejected','duplicatesSkipped','published','unprocessed','generatorCalls','verifierCalls','batches'])cumulative[key]+=previous[key];
      cumulative.rejectReasons={...previous.rejectReasons};for(const[key,n]of Object.entries(result.rejectReasons))cumulative.rejectReasons[key]=(cumulative.rejectReasons[key]??0)+n;
      for(const key of Object.keys(usage))usage[key]+=previous.tokenUsage[key];
      report.units=report.units.filter(u=>u.unitId!==unit.unitId);
    }
    report.units.push({unit:unit.name,unitId:unit.unitId,topicId:contexts[0].subthemeId,outcome:contexts[0].outcomeCode,...cumulative,familyDistribution,tokenUsage:usage});
    for(const key of Object.keys(usage))report.tokenUsage[key]=report.units.reduce((sum,u)=>sum+u.tokenUsage[key],0);
    console.log(JSON.stringify({event:'unit-complete',unit:unit.name,generated:result.generated,accepted:result.accepted,rejected:result.rejected,published:result.published,finalCount:result.finalCount,status:result.status,stopReason:result.stopReason,tokenUsage:usage}));
    writeFileSync('.firebase/english-pilot/report.json',JSON.stringify(report,null,2));
  }
  const final=await db.collection('questions').get();
  report.otherQuestionsUnchanged=hash(otherQuestions)===hash(final.docs.filter(d=>!isEnglish(d.data())).map(d=>[d.id,d.data()]).sort());
  if(!report.otherQuestionsUnchanged)throw Error('OTHER_QUESTIONS_CHANGED');
  report.totalPublished=report.units.reduce((sum,u)=>sum+u.published,0);
  report.finalEnglishCount=final.docs.filter(d=>isEnglish(d.data())).length;
  report.visualIds=[...new Set(final.docs.filter(d=>isEnglish(d.data())).flatMap(d=>d.data().visual?[d.data().visual.asset]:[]))];
  writeFileSync('.firebase/english-pilot/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({event:'complete',totalPublished:report.totalPublished,finalEnglishCount:report.finalEnglishCount,otherQuestionsUnchanged:report.otherQuestionsUnchanged,rateLimited:report.rateLimited,tokenUsage:report.tokenUsage}));
} finally {if(store)await store.close();await db.terminate();}
