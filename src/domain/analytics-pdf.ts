import type {Content, TDocumentDefinitions} from 'pdfmake/interfaces';
import {number,percent,type AnalyticsReport,type AnalyticsStudent,type Period} from './analytics';

export interface AnalyticsPdfInput {
  report:AnalyticsReport; period:Period; section:string; students:AnalyticsStudent[];
  classId?:string; studentId?:string; gradeLevel?:number;
  subjectLabel?:string; unitLabel?:string; showMetrics:boolean;
}
// A pure snapshot transformation: this module has no Firebase dependency.
export function analyticsPdfDocument(input:AnalyticsPdfInput):TDocumentDefinitions {
  const {report,period,section,students}=input;
  const cls=report.classes.find(c=>c.classId===input.classId);
  const student=report.students.find(s=>s.studentId===input.studentId);
  const metrics=student||cls||report.totals;
  const detailed=section==='subjects'||section==='topics';
  const scope=student?`${student.displayName} | ${student.className} | ${student.gradeLevel}. Sınıf`:cls?.className||'Sınıf performansı';
  const table=(head:string[],rows:(string|number)[][],widths:any[]):Content=>({
    margin:[0,8,0,16],fontSize:9,table:{headerRows:1,dontBreakRows:true,widths,body:[head.map(text=>({text,bold:true,color:'#ffffff',fillColor:'#10223a',margin:[0,4,0,4]})),...rows]},
    layout:{hLineWidth:()=>0.5,vLineWidth:()=>0,hLineColor:()=> '#e4d8c5',paddingLeft:()=>7,paddingRight:()=>7,paddingTop:()=>5,paddingBottom:()=>5,fillColor:(row:number)=>row>0&&row%2===0?'#fff8ed':null},
  });
  const content:Content[]=[
    {text:scope,style:'title'},
    {text:`Dönem: ${period==='weekly'?'Bu hafta':'Genel (tüm zamanlar)'} | Hafta: ${report.weekKey}`,margin:[0,4,0,4]},
    {text:`Rapor zamanı: ${new Date(report.serverNow).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})} (İstanbul)`,style:'muted'},
    {text:[input.gradeLevel?`Kademe: ${input.gradeLevel}. Sınıf`:null,detailed?`Ders: ${input.subjectLabel||'Tüm dersler'}`:null,detailed?`Ünite: ${input.unitLabel||'Tüm üniteler'}`:null].filter(Boolean).join(' | '),margin:[0,6,0,8],style:'muted'},
  ];
  if(input.showMetrics){const counts=metrics[period];content.push({text:'Performans özeti',style:'heading'},table(['Ölçüt','Değer'],[
    ['Çözülen soru',number(counts.solved)],['Doğru / Yanlış',`${number(counts.correct)} / ${number(counts.wrong)}`],
    ...(counts.blank===undefined?[]:[['Boş',number(counts.blank)]]),['Başarı',percent(counts)],
    ['Academic XP - Genel',number(metrics.academicXP)],['Academic XP - Bu hafta',number(metrics.weeklyAcademicXP)],
  ],['*',150]));}
  if(detailed){
    const rows=report.dimensions.filter(d=>d.kind===(section==='topics'?'topic':'subject')&&d[period].solved)
      .sort((a,b)=>a.gradeLevel-b.gradeLevel||a.subjectName.localeCompare(b.subjectName,'tr')||(a.topicName||'').localeCompare(b.topicName||'','tr'));
    content.push({text:section==='topics'?'Konu performansı':'Ders performansı',style:'heading'});
    if(rows.length)content.push(table([section==='topics'?'Konu / Ders':'Ders','Soru','Doğru','Yanlış','Boş','Başarı'],rows.map(d=>[
      `${section==='topics'?`${d.topicName}\n`:''}${d.subjectName} | ${d.gradeLevel}. Sınıf`,number(d[period].solved),number(d[period].correct),number(d[period].wrong),d[period].blank===undefined?'-':number(d[period].blank!),percent(d[period]),
    ]),['*',42,42,42,35,45]));else content.push({text:'Bu dönemde kabul edilmiş cevap yok.',style:'muted'});
    if(student&&input.showMetrics)content.push({text:'Özet, öğrencinin genel toplamlarını gösterir; ders/ünite filtresi ayrıntı tablosuna uygulanır.',style:'muted'});
  }else if(!student){
    content.push({text:'Öğrenci karşılaştırması',style:'heading'});
    if(students.length)content.push(table(['Öğrenci','Kademe','Soru','Doğru','Yanlış','Başarı','Genel XP','Haftalık XP','Sıra'],students.map(s=>[
      s.displayName,s.gradeLevel,number(s[period].solved),number(s[period].correct),number(s[period].wrong),percent(s[period]),number(s.academicXP),number(s.weeklyAcademicXP),`#${period==='weekly'?s.weeklyRank:s.overallRank}`,
    ]),['*',40,48,48,48,52,55,60,36]));else content.push({text:'Bu görünümde öğrenci yok.',style:'muted'});
  }
  content.push({text:'Soru: çalışma miktarı. Başarı: doğru / tüm cevaplar. XP: oyunlaştırılmış ilerleme. Aynı soruyu tekrar çözmek yeniden XP üretmez. Bu dosya belirtilen zamanda hazırlanmış raporun çıktısıdır.',style:'muted',margin:[0,10,0,0]});
  return {pageSize:'A4',pageOrientation:!student&&!detailed?'landscape':'portrait',pageMargins:[36,66,36,44],
    defaultStyle:{font:'Roboto',fontSize:10,color:'#10223a'},info:{title:`Test Arena - ${scope}`,author:'Test Arena'},
    header:{text:'TEST ARENA  |  Performans raporu',margin:[36,24,36,0],fontSize:12,bold:true,color:'#a85b00'},
    footer:(page,pages)=>({text:`TEST ARENA | ${page} / ${pages}`,alignment:'right',margin:[36,12,36,0],fontSize:8,color:'#736955'}),
    styles:{title:{fontSize:19,bold:true},heading:{fontSize:13,bold:true,margin:[0,12,0,4]},muted:{fontSize:9,color:'#736955'}},content};
}

export async function downloadAnalyticsPdf(input:AnalyticsPdfInput){
  const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake'),import('pdfmake/build/vfs_fonts')]);
  const vfs=fonts as unknown as Record<string,string>;
  const blob=await new Promise<Blob>((resolve,reject)=>{try{pdfMake.createPdf(analyticsPdfDocument(input),undefined,undefined,vfs).getBlob(resolve);}catch(error){reject(error);}});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`test-arena-${input.studentId?'ogrenci':'sinif'}-${input.period}-${input.report.weekKey}.pdf`;
  document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
