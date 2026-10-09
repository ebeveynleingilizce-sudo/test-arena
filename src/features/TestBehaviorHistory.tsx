import type {BehaviorHistory} from '../domain/analytics';
import '../ui/quiz-behavior.css';
const time=(ms:number|null)=>ms===null?'Henüz veri yok':`${Math.floor(ms/60000)} dk ${Math.floor(ms/1000)%60} sn`;
export function TestBehaviorHistory({history}:{history:BehaviorHistory[]}) {
  return <section className="behavior-history" aria-label="Test geçmişi ve davranış gözlemleri"><h2>Test geçmişi ve davranış gözlemleri</h2>
    <p className="field-hint">Sunucu süresi, testin oluşturulması ile tamamlanması arasındadır; mola ve bağlantı beklemesini de içerir. Ekran ayrılma ve soru süreleri tarayıcı bildirimidir; eksik veya değiştirilmiş olabilir. Bu veriler hile kanıtı değildir. Başka cihaz kullanımı tespit edilemez.</p>
    <p className="field-hint">Son 30 test gösterilir. Risk puanı: henüz hesaplanmıyor. Önce gerçek veriyle değerlendirme yapılacak.</p>
    {!history.length&&<p className="analytics-empty">Bu öğrenci için yeni test geçmişi henüz yok.</p>}
    {history.map(t=><article key={t.testSessionId}><h3>{t.subjectName} · {t.unitName} · {t.packName}</h3><p>{t.gradeLevel}. Sınıf · {t.startedAt?new Date(t.startedAt).toLocaleString('tr-TR'):'Tarih yok'} · {t.status==='completed'?'Tamamlandı':'Devam ediyor'}</p>
      <dl><div><dt>Doğru / Yanlış / Boş</dt><dd>{t.correct} / {t.wrong} / {t.blank}</dd></div><div><dt>Test süresi · Sunucu</dt><dd>{time(t.serverDurationMs)}</dd></div><div><dt>Görünür süre · Bildirilen</dt><dd>{t.reported?time(t.visibleMs):'Henüz veri yok'}</dd></div><div><dt>Arka plan · Bildirilen</dt><dd>{t.reported?time(t.hiddenMs):'Henüz veri yok'}</dd></div><div><dt>Ekrandan ayrılma</dt><dd>{t.reported?t.exitCount:'Henüz veri yok'}</dd></div><div><dt>Seçim değişikliği</dt><dd>{t.reported?t.changeCount:'Henüz veri yok'}</dd></div></dl>
      {t.reported&&t.exitCount>0&&<p className="behavior-observation">İnceleme notu: ekran görünürlüğü değişmiş. Nedeni bu veriden belirlenemez.</p>}
      {t.reported&&t.streamCount>1&&<p className="behavior-observation">{t.streamCount} ayrı tarayıcı kaydı var; sayfa yenileme veya tekrar açma da buna yol açabilir. Aynı anda kullanım kanıtı değildir; bildirilen süreler çakışabilir.</p>}
      <p className="field-hint">{t.accuracyChange===null?'Başarı değişimi için aynı kademe/ders/ünitede 3 önceki tamamlanmış test gerekir.':`Önceki 3 testin toplam başarısına göre ${t.accuracyChange>0?'+':''}${t.accuracyChange} yüzde puan. Test güçlüğü ve tekrar çözme etkisi ayrıca incelenmeli.`}</p>
      <details><summary>Soru bazında süreler</summary><ol>{t.questions.map(q=><li key={q.questionId}><strong>Soru {q.number}</strong><span>Görünür süre: {time(q.visibleMs)} · Seçim değişikliği: {q.changes??'Veri yok'}<br/>Test başlangıcından kayıtlı cevaba: {time(q.submittedAfterStartMs)}</span></li>)}</ol></details>
    </article>)}
  </section>;
}
