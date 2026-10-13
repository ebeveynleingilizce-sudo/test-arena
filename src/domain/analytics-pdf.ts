import type {Content, TDocumentDefinitions} from 'pdfmake/interfaces';
import {number,percent,type AnalyticsReport,type AnalyticsStudent,type Period,type BehaviorHistory} from './analytics';
import {arenaPeriod} from '../../shared/arena-period.mjs';

export interface AnalyticsPdfInput {
  report:AnalyticsReport; period:Period; section:string; students:AnalyticsStudent[];
  classId?:string; studentId?:string; gradeLevel?:number;
  subjectLabel?:string; unitLabel?:string; showMetrics:boolean;
  history?:{rows:BehaviorHistory[];complete:boolean};
}
// A pure snapshot transformation: this module has no Firebase dependency.
export function analyticsPdfDocument(input:AnalyticsPdfInput):TDocumentDefinitions {
  const {report,period,section,students}=input;
  const cls=report.classes.find(c=>c.classId===input.classId);
  const student=report.students.find(s=>s.studentId===input.studentId);
  const metrics=student||cls||report.totals;
  const detailed=section==='subjects'||section==='topics';
  const complete=!!student;
  const scope=student?`${student.displayName} | ${student.className} | ${student.gradeLevel}. Sınıf`:cls?.className||'Sınıf performansı';
  const table=(head:string[],rows:(string|number)[][],widths:any[]):Content=>({
    margin:[0,8,0,16],fontSize:9,table:{headerRows:1,dontBreakRows:true,widths,body:[head.map(text=>({text,bold:true,color:'#ffffff',fillColor:'#10223a',margin:[0,4,0,4]})),...rows]},
    layout:{hLineWidth:()=>0.5,vLineWidth:()=>0,hLineColor:()=> '#e4d8c5',paddingLeft:()=>7,paddingRight:()=>7,paddingTop:()=>5,paddingBottom:()=>5,fillColor:(row:number)=>row>0&&row%2===0?'#fff8ed':null},
  });
  const content:Content[]=[
    {text:scope,style:'title'},
    {text:`Dönem: ${complete?'Genel ve bu hafta':period==='weekly'?'Bu hafta':'Genel (tüm zamanlar)'} | Hafta: ${report.weekKey}`,margin:[0,4,0,4]},
    {text:`Rapor zamanı: ${new Date(report.serverNow).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})} (İstanbul)`,style:'muted'},
    {text:complete?'Kapsam: Öğrencinin tüm dersleri, üniteleri ve konuları':[input.gradeLevel?`Kademe: ${input.gradeLevel}. Sınıf`:null,detailed?`Ders: ${input.subjectLabel||'Tüm dersler'}`:null,detailed?`Ünite: ${input.unitLabel||'Tüm üniteler'}`:null].filter(Boolean).join(' | '),margin:[0,6,0,8],style:'muted'},
  ];
  if(complete){
    const date=(value:number)=>new Date(value).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'});
    const weeklyStart=date(arenaPeriod(new Date(report.serverNow)).startsAt);
    content.push({text:`Tarih kapsamı: Genel - tüm kayıtlı dönemler (başlangıç tarihi hazır raporda yok). Bu hafta - ${weeklyStart} / ${date(report.serverNow)}.`,style:'muted',margin:[0,4,0,8]});
    const topics=report.dimensions.filter(d=>d.kind==='topic'&&d.overall.solved>0);
    const comparable=topics.filter(d=>d.overall.solved>=5);
    const label=(d:typeof topics[number])=>`${d.subjectName} / ${d.unitName||'Ünite bilgisi yok'} / ${d.topicName||'Konu bilgisi yok'} (${d.gradeLevel}. Sınıf)`;
    const strengths=[...comparable].filter(d=>d.overall.correct/d.overall.solved>=0.8).sort((a,b)=>b.overall.correct/b.overall.solved-a.overall.correct/a.overall.solved||b.overall.solved-a.overall.solved).slice(0,3);
    const review=[...comparable].filter(d=>d.overall.correct/d.overall.solved<0.8).sort((a,b)=>a.overall.correct/a.overall.solved-b.overall.correct/b.overall.solved||b.overall.solved-a.overall.solved).slice(0,3);
    content.push({text:'Öğretmen ve veli için akademik değerlendirme',style:'heading'},
      {text:`Genel dönemde ${number(student.overall.solved)} soru yanıtlandı: ${number(student.overall.correct)} doğru, ${number(student.overall.wrong)} yanlış. Başarı: ${percent(student.overall)}. Bu hafta ${number(student.weekly.solved)} soru yanıtlandı ve ${number(student.weeklyAcademicXP)} Academic XP kazanıldı.`,margin:[0,4,0,8]},
      {text:'Güçlü alanlar',bold:true},
      strengths.length?{ul:strengths.map(d=>`${label(d)}: ${percent(d.overall)}, ${number(d.overall.solved)} yanıt.`),margin:[0,4,0,8]}:{text:'En az 5 yanıt ve %80 başarı ölçütünü karşılayan konu bulunmuyor.',style:'muted',margin:[0,4,0,8]},
      {text:'Tekrar önerilen konular',bold:true},
      review.length?{ul:review.map(d=>`${label(d)}: ${percent(d.overall)}, ${number(d.overall.wrong)} yanlış / ${number(d.overall.solved)} yanıt. Yanlış yapılan soruların açıklamalarıyla tekrar önerilir.`),margin:[0,4,0,8]}:{text:'En az 5 yanıtta %80 altında kalan konu bulunmuyor.',style:'muted',margin:[0,4,0,8]},
      {text:'Bu değerlendirme yalnızca kayıtlı yanıtları gösterir. Az çalışılmış konular için kesin başarı yargısı üretilmez; aynı konu farklı kademelerde ayrı değerlendirilir.',style:'muted'},
      {text:'Gelişim ve çalışma düzeni',style:'heading'},
      {text:'Hazır raporda önceki haftaların ayrı sayaçları ve günlük çalışma serisi bulunmuyor. Bu nedenle zaman içindeki başarı değişimi, düzenlilik veya önceki dönemle karşılaştırma hesaplanmadı. Haftalık değerler genel dönemin içindedir; iki bağımsız dönem değildir.',style:'muted',margin:[0,4,0,8]});
  }
  if(input.showMetrics){const counts=metrics[period];content.push({text:'Performans özeti',style:'heading'},table(['Ölçüt','Değer'],[
    ['Çözülen soru',number(counts.solved)],['Doğru / Yanlış',`${number(counts.correct)} / ${number(counts.wrong)}`],
    ...(counts.blank===undefined?[]:[['Boş',number(counts.blank)]]),['Başarı',percent(counts)],
    ['Academic XP - Genel',number(metrics.academicXP)],['Academic XP - Bu hafta',number(metrics.weeklyAcademicXP)],
  ],['*',150]));}
  if(complete){
    const summaryRows=(['overall','weekly'] as const).map(p=>{const c=student[p];return[p==='overall'?'Genel':'Bu hafta',number(c.solved),number(c.correct),number(c.wrong),c.blank===undefined?'-':number(c.blank),percent(c)];});
    content.push({text:'Genel ve haftalık çalışma',style:'heading'},table(['Dönem','Soru','Doğru','Yanlış','Boş','Başarı'],summaryRows,['*',42,42,42,35,45]));
    for(const p of ['overall','weekly'] as const)for(const kind of ['subject','unit','topic'] as const){
      const rows=report.dimensions.filter(d=>d.kind===kind&&(d[p].solved||(d[p].blank||0)))
        .sort((a,b)=>a.gradeLevel-b.gradeLevel||a.subjectName.localeCompare(b.subjectName,'tr')||(a.unitName||'').localeCompare(b.unitName||'','tr')||(a.topicName||'').localeCompare(b.topicName||'','tr'));
      content.push({text:`${kind==='subject'?'Ders':kind==='unit'?'Ünite':'Konu'} performansı - ${p==='overall'?'Genel':'Bu hafta'}`,style:'heading',headlineLevel:1});
      if(rows.length)content.push(table([kind==='subject'?'Ders':kind==='unit'?'Ünite / Ders':'Konu / Ünite / Ders','Soru','Doğru','Yanlış','Boş','Başarı'],rows.map(d=>[
        [kind==='topic'?(d.topicName||'Konu bilgisi yok'):null,kind!=='subject'?(d.unitName||'Ünite bilgisi yok (eski kayıt)'):null,`${d.subjectName} | ${d.gradeLevel}. Sınıf`].filter(Boolean).join('\n'),number(d[p].solved),number(d[p].correct),number(d[p].wrong),d[p].blank===undefined?'-':number(d[p].blank!),percent(d[p]),
      ]),['*',42,42,42,35,45]));else content.push({text:'Bu dönemde kayıtlı çalışma yok.',style:'muted'});
    }
    content.push({text:'Boş sütunundaki "-", eski kayıtta bu sayının bulunmadığını belirtir. Ekran filtreleri bu tam öğrenci PDF raporunu daraltmaz.',style:'muted'});
    if(input.history?.rows.length){
      const history=[...input.history.rows].sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
      content.push({text:'Önceden yüklenmiş test geçmişi',style:'heading',headlineLevel:1},
        {text:`${history.length} test. ${input.history.complete?'Sayfalı geçmişin tüm sayfaları yüklendi.':'Yalnızca açılmış geçmiş sayfaları; tüm geçmişi temsil etmez.'} Tarihler test başlangıcıdır. Bu tabloda başarı ve mevcut test karşılaştırması boşlar dahil toplam soru sayısını kullanır. Karşılaştırma yalnızca hazır kayıtta varsa gösterilir.`,style:'muted'},
        table(['Tarih / Test','Doğru','Yanlış','Boş','Başarı (tüm sorular)','Önceki testlere göre'],history.map(h=>[
          `${h.startedAt?new Date(h.startedAt).toLocaleDateString('tr-TR',{timeZone:'Europe/Istanbul'}):'Tarih yok'}\n${h.subjectName} / ${h.unitName||'Ünite yok'} / ${h.packName} (${h.gradeLevel}. Sınıf)\n${h.status==='completed'?'Tamamlandı':'Tamamlanmadı'}`,
          number(h.correct),number(h.wrong),number(h.blank),percent({solved:h.questionCount,correct:h.correct,wrong:h.wrong}),
          h.accuracyChange===null||h.accuracyChange===undefined?'-':`${h.accuracyChange>0?'+':''}${h.accuracyChange.toLocaleString('tr-TR',{maximumFractionDigits:1})} yüzde puan\n${h.previousTestCount} önceki test`,
        ]),['*',35,35,30,45,78]));
    }
  }else if(detailed){
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
  content.push({text:'Soru: yanıtlanan soru sayısı. Başarı: doğru / yanıtlanan soru; boşlar bu orana dahil değildir. XP: oyunlaştırılmış ilerleme. Aynı soruyu tekrar çözmek yeniden XP üretmez. Bu dosya belirtilen zamanda hazırlanmış raporun çıktısıdır.',style:'muted',margin:[0,10,0,0]});
  return {pageSize:'A4',pageOrientation:!student&&!detailed?'landscape':'portrait',pageMargins:[36,66,36,44],
    pageBreakBefore:(node,following)=>node.headlineLevel===1&&(following.length===0||node.startPosition.verticalRatio>0.82),
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
