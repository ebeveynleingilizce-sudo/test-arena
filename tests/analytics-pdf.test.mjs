import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import pdfMake from 'pdfmake/build/pdfmake.js';
import fonts from 'pdfmake/build/vfs_fonts.js';
const compiled=await build({entryPoints:['src/domain/analytics-pdf.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
const {analyticsPdfDocument}=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const counts={solved:9,correct:8,wrong:1,blank:1},performance={overall:counts,weekly:counts,academicXP:8,weeklyAcademicXP:8};
const students=Array.from({length:120},(_,i)=>({...performance,studentId:String(i),displayName:`Öğrenci ${i} Şahin Çığ Öztürk`,classId:'class',className:'DOSTLAR',gradeLevel:6,overallRank:i+1,weeklyRank:120-i,signals:[],lastAnswerAt:null}));
const report={weekKey:'2026-W42',serverNow:1791792000000,availablePeriods:['overall','weekly'],classes:[{...performance,classId:'class',className:'DOSTLAR',defaultGradeLevel:6,studentCount:120}],students,totals:{...performance,classCount:1,studentCount:120},dimensions:[{kind:'topic',gradeLevel:6,subject:'matematik',subjectName:'Matematik',topic:'kesir',topicName:'Kesirlerle işlemler ve çözüm stratejileri',unitId:'unit',unitName:'Sayılar ve İşlemler',overall:counts,weekly:counts}]};
test('PDF snapshot preserves period, visible student order, counters and Turkish labels without changing the source',async()=>{
 const original=structuredClone(report),input={report,period:'weekly',section:'general',students:[students[119],students[0]],classId:'class',showMetrics:true};
 const doc=analyticsPdfDocument(input),serialized=JSON.stringify(doc.content);
 assert(serialized.includes('Bu hafta'));assert(serialized.includes('Öğrenci 119'));assert(!serialized.includes('Öğrenci 118'));assert(serialized.indexOf('Öğrenci 119')<serialized.indexOf('Öğrenci 0'));assert.deepEqual(report,original);assert.equal(doc.pageOrientation,'landscape');
 const detail=analyticsPdfDocument({...input,section:'topics',studentId:'0',students:[students[0]],subjectLabel:'Matematik',unitLabel:'Sayılar ve İşlemler'});
 assert.equal(detail.pageOrientation,'portrait');assert(JSON.stringify(detail.content).includes('Sayılar ve İşlemler'));assert(JSON.stringify(detail.content).includes('Kesirlerle işlemler'));assert(!JSON.stringify(detail.content).includes('Öğrenci 119'));
});
test('PDF generator paginates a long Turkish class roster with embedded fonts',async()=>{
 const doc=analyticsPdfDocument({report,period:'overall',section:'general',students,classId:'class',showMetrics:true});
 const buffer=await new Promise((resolve,reject)=>{try{pdfMake.createPdf(doc,undefined,undefined,fonts).getBuffer(resolve);}catch(e){reject(e);}});
 assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert(buffer.length>10000);await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/analytics-stress.pdf',buffer);
});
test('student PDF includes every lesson, unit and topic in both periods, irrespective of the selected screen tab',async()=>{
 const dimensions=['Matematik','Türkçe'].flatMap((name,i)=>['subject','unit','topic'].map(kind=>({kind,gradeLevel:6,subject:'subject-'+i,subjectName:name,...(kind==='subject'?{}:{unitId:'unit-'+i,unitName:i?'Sözcükte Anlam':'Sayılar ve İşlemler'}),...(kind==='topic'?{topic:'topic-'+i,topicName:i?'Eş Anlamlı Sözcükler':'Kesirlerde Karşılaştırma'}:{}),overall:{solved:10,correct:i?5:8,wrong:i?5:2,blank:1},weekly:{solved:3,correct:2,wrong:1,blank:1}})));
 const snapshot={...report,students:[{...students[0],displayName:'Elif Şahin Öztürk',overall:{solved:20,correct:13,wrong:7,blank:2},weekly:{solved:6,correct:4,wrong:2,blank:2},academicXP:13,weeklyAcademicXP:4}],dimensions},original=structuredClone(snapshot);
 const history={complete:false,rows:[{testSessionId:'ready-test',gradeLevel:6,subjectName:'Matematik',unitName:'Sayılar ve İşlemler',packName:'Kesirler - Test 1',status:'completed',startedAt:report.serverNow-3600000,questionCount:4,correct:2,wrong:1,blank:1,previousTestCount:3,accuracyChange:10,questions:[]}]};
 const doc=analyticsPdfDocument({report:snapshot,period:'weekly',section:'general',students:[students[0]],studentId:'0',subjectLabel:'Matematik',unitLabel:'Sayılar ve İşlemler',showMetrics:true,history});
 const text=JSON.stringify(doc.content);for(const label of ['Matematik','Türkçe','Sözcükte Anlam','Sayılar ve İşlemler','Eş Anlamlı Sözcükler','Kesirlerde Karşılaştırma','Ders performansı - Genel','Ünite performansı - Genel','Konu performansı - Genel','Ders performansı - Bu hafta','Ünite performansı - Bu hafta','Konu performansı - Bu hafta'])assert(text.includes(label),label);
 assert(text.includes('tüm geçmişi temsil etmez'));assert(text.includes('+10 yüzde puan'));assert(text.includes('3 önceki test'));assert(text.includes('Önceden yüklenmiş test geçmişi'));
 assert.deepEqual(snapshot,original);const buffer=await new Promise(resolve=>pdfMake.createPdf(doc,undefined,undefined,fonts).getBuffer(resolve));await mkdir('output/pdf',{recursive:true});await writeFile('output/pdf/ogrenci-ayrintili.pdf',buffer);
});
test('student PDF reports only supported strengths and explicitly marks missing history and blank counts',()=>{
 const snapshot={...report,students:[{...students[0],overall:{solved:1,correct:1,wrong:0},weekly:{solved:0,correct:0,wrong:0}}],dimensions:[{...report.dimensions[0],overall:{solved:1,correct:1,wrong:0}}]};
 const text=JSON.stringify(analyticsPdfDocument({report:snapshot,period:'overall',section:'general',students:[],studentId:'0',showMetrics:true}).content);
 assert(text.includes('başlangıç tarihi hazır raporda yok'));assert(text.includes('karşılaştırma hesaplanmadı'));assert(text.includes('En az 5 yanıt'));assert(!text.includes('Kesirlerle işlemler ve çözüm stratejileri (%100'));
});
