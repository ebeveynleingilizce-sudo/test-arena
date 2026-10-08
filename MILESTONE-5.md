# Milestone 5 — Teacher Dashboard & Student Performance Analytics

Tamamlandı. Yerel Firebase Emulator üzerinde doğrulandı. Production deploy, commit, push veya branch oluşturma yapılmadı.

## Analytics veri modeli ve canonical kaynak

Canonical kaynak değişmedi:

```text
teachers/{teacherUid}/students/{studentId}
  testSessions/{testSessionId}
    answers/{questionId}     # ilk kabul edilen, değiştirilemeyen cevap
  learning/summary           # mevcut çalışma/Academic XP özeti
  academicWeeks/{weekKey}    # mevcut haftalık Academic XP
  awardedQuestions/{qid}    # mevcut kalıcı XP idempotency kaydı
```

Yeni, yalnız sunucu tarafından yazılabilen türetilmiş belgeler:

```text
teachers/{teacherUid}/students/{studentId}
  analytics/summary
    version: 2
    overall: { solved, correct, wrong }
    weekly:  { solved, correct, wrong }
    weekKey
    lastAnswerAt

  analyticsDimensions/subject:{contentGrade}:{subjectId}
  analyticsDimensions/topic:{contentGrade}:{subjectId}:{topicId}
    version: 2
    kind, gradeLevel, subject, subjectName
    topic, topicName          # yalnız konu belgesinde
    overall, weekly, weekKey, lastAnswerAt
```

Boyut anahtarlarının sınırları `:` ile ayrılıyor. Soru sistemi kimliklerinde bu karakter kabul edilmediğinden `a_b / c` ile `a / b_c` çakışmıyor. Bu durum için test eklendi.

Kalıcı class summary belgesi eklenmedi. `teacherAnalytics` callable işlemi, mevcut aktif öğrencilerin küçük özetlerini tutarlı bir Firestore transaction içinde birleştirerek sınıf ve öğretmen toplamlarını üretir. Böylece her cevapta ortak bir sınıf belgesini kilitlemek ve sınıf değişikliğinde çok sayıda toplamı taşımak gerekmiyor.

## Canonical veri / summary ilişkisi

Yeni öğrencinin boş analytics özeti öğrenci oluşturma transaction'ında oluşturulur. Her yeni kabul edilmiş cevapta öğrenci, ders ve konu özetleri aynı cevap/XP transaction'ında güncellenir. İşlem başarısızsa cevap, analytics ve XP birlikte geri döner; kısmi güncelleme yoktur.

Özet eksikse veya eski anahtar sürümündeyse sunucu canonical test/cevap belgelerinden bir kez yeniden kurar. Eski türetilmiş boyut belgeleri temizlenir; canonical cevaplar ve XP kayıtları değiştirilmez. Bu kurulum, eşzamanlı yeni cevapla transaction çatışması üzerinden tutarlı kalır. Normal dashboard yüklemesi cevap geçmişini taramaz ve geçmişi tarayıcıya indirmez.

Eski `performance` projection'ı korunmuştur; yeni öğretmen raporları onu kaynak olarak kullanmaz. Öğrenci UI, authentication, kısa kod, soru seçimi ve Arena domain dosyaları değiştirilmedi. `arenaPeriod` ve mevcut XP okuma yardımcıları yeniden kullanıldı.

## Çözülen soru, tekrar çözme ve başarı

**Çözülen soru = `(testSessionId, questionId)` için sunucunun kabul ettiği ilk cevap.** Yanlış cevap da çalışma miktarını +1 artırır. Testin bitmesi gerekmez; üç cevap verilmiş yarım test üç çözülmüş soru olarak görünür.

- Aynı request retry: +0 yeni çözülmüş soru.
- Aynı test sorusuna başka seçenek gönderme: ilk cevap korunur; +0 yeni çözülmüş soru.
- Aynı soruyu yeni testte çözme: +1 çalışma/attempt; doğruysa correct, yanlışsa wrong +1.
- Daha önce XP kazanılmış sorunun yeni doğru attempt'i: çalışma ve correct +1, yeni XP +0.

Başarı `correct / solved × 100` olarak hesaplanır. Sınıf/öğretmen oranı toplam doğruların toplam cevaplara bölümüdür; öğrenci yüzdelerinin ortalaması alınmaz. UI tam yüzdeye yuvarlar ve soru hacmini oranla birlikte gösterir. Cevapsız öğrenci `%0` yerine **Henüz veri yok** görür. Gerçek yanlış cevapları bulunan öğrenci için `%0` geçerli bir orandır.

Academic XP, mevcut `learning/summary` ve `academicWeeks` kaynaklarından okunur; analytics başarı oranından XP üretmez.

## Genel / Bu hafta

Europe/Istanbul hafta hesabı doğrudan Milestone 3'teki `arenaPeriod` fonksiyonudur. Hafta pazartesi yerel gece yarısında başlar; başlangıç dahil, sonraki hafta başlangıcı hariçtir.

Cevabın canonical `answeredAt` zamanı, analytics ve XP için kullanılan aynı transaction zamanıyla kaydedilir. Böylece gece yarısı sınırında kabul tarihi ile hafta kovası ayrışmaz.

Genel sayaçlar kalıcıdır. Analytics belgesindeki haftalık sayaç son yazılan hafta kovasını tutar; eski hafta okunurken yeni hafta için sıfır gösterilir. Yeni haftanın ilk cevabı yalnız weekly alanını yeniden başlatır. Genel ve ders/konu genel sayaçları korunur. Önceki haftaları seçme UI'si yoktur; canonical zaman damgaları gelecekteki tarih aralığı raporlarının kaynağı olarak durur.

## Sınıf değiştirme ve kaldırma politikası

Raporlar **mevcut üyelerin performansını** gösterir. Öğrenci başka sınıfa taşındığında yaşam boyu ve bu haftaki çalışma verisi mevcut öğrencisi olarak yeni sınıfın toplamına katılır, eski sınıfın toplamından çıkar. Geçmişin “cevap verildiği tarihteki sınıfa” göre raporlanması bu sürümde yapılmaz. Sınıf adı ve öğrencinin kademesi ayrı alanlardır; içerik kademesi ayrıca boyut anahtarında saklanır.

Kaldırılan öğrenci aktif toplam, lider, tablo ve sınıf raporundan çıkar. Canonical ve türetilmiş geçmiş öğretmenin özel namespace'inde korunur; mevcut soft-delete politikası sürer. Aktif öğrenci detay callable'ı kaldırılan öğrenci için erişilebilir detay döndürmez. Arşivlenmiş geçmiş için UI eklenmedi. Bu iki politika otomatik test edildi.

## Öğretmen dashboard yapısı

`/ogretmen`:

- Sınıf, öğrenci, çözülmüş soru ve ağırlıklı başarı KPI şeridi.
- Sınıf başına öğrenci, soru, başarı ve haftalık Academic XP; sınıf detayına erişim.
- Bu haftanın en aktif üç öğrencisi, kabul edilen cevap sayısıyla.
- Her sınıfın kendi Arena liderleri; seçilen dönem XP'si ve mevcut Arena eşit sıra modeli. Sınıflar arası yarış sıralaması oluşturulmaz.
- Nötr destek sinyalleri ve açıklamaları.
- Tüm öğrencilerin karşılaştırması, sınıf filtresi ve altı sıralama seçeneği.

Filtre/sıralama yalnız küçük, yetkilendirilmiş sunucu DTO'sunu kullanır. Başarıya göre sıralamada cevapsız öğrenciler oranı olan öğrencilerden sonra gelir. Soru hacmi daima görünür; az sayıda cevapla yüksek oran “en başarılı öğrenci” yorumu olarak sunulmaz.

Raporlar canlı analytics subscription değildir. Giriş, kapsam/üyelik değişimi veya **Verileri yenile** ile güncel snapshot alınır; son yenileme saati gösterilir. Dönem değişimi ve sıralama için geçmiş cevaplar tekrar indirilmez.

## Sınıf ve öğrenci detayları

`/ogretmen/siniflar/{classId}`: öğrenci sayısı, solved/correct/wrong, başarı, genel ve haftalık XP; Genel / Öğrenciler / Dersler / Konular bölümleri. Mevcut öğrenci ekleme, kod kopyalama/yenileme, düzenleme ve kaldırma akışları korunmuştur. Öğrenci bağlantısı yerine kısa kod gösterilir.

`/ogretmen/ogrenciler`: tüm öğrenciler, sınıf filtresi ve sıralama.

`/ogretmen/ogrenciler/{studentId}`: isim, mevcut sınıf ve kademe, çalışma/başarı/XP, dönem Arena sırası, ders ve konu performansı. Öğretmen içi detay rotası öğrenci giriş bağlantısı değildir.

Desktop'ta gerçek tablo; telefon ve tablette etiketli öğrenci blokları kullanılır. Sınıfın varsayılan kademesi öğrencinin kendi kademesi yerine kullanılmaz.

## Subject / topic aggregation

Boyutlar canonical testin **içerik kademesi + ders + konu** bilgileriyle tutulur. Ders toplamı o içerik kademesindeki konuları birleştirir; farklı içerik kademeleri ayrı, açık etiketli satırlardır. Öğrenci kademe değiştirince geçmiş konu verisi yeni kademe olarak yeniden etiketlenmez.

Öğrenci detayında kendi özetleri, sınıf detayında mevcut üyelerin aynı boyut özetleri sunucuda birleştirilir. İsimler testte dondurulmuş ders/konu metadata'sından gelir; sonradan banka adı değişse bile eski kabul edilmiş çalışma kaybolmaz.

## Desteğe ihtiyaç sinyallerinin kuralları

1. En az **20** kabul edilmiş cevap ve genel başarı **%60 altında**: düşük oran sinyali.
2. Sınıfta en az **3 öğrenci**, haftalık soru sayısının medyanı en az **10**, haftanın başlangıcından en az **72 saat**, öğrencinin kayıt tarihinden en az **72 saat** geçmişse; öğrencinin haftalık sayısı medyanın **dörtte birinden az**: düşük göreli çalışma sinyali.
3. En az **20** kabul edilmiş cevap ve son kabul edilmiş cevap en az **7 gün önce**: son dönem aktivite sinyali.

Bunlar tanı veya başarı sıralaması değildir. İki cevapta %50 alan öğrenci düşük başarı sinyaline alınmaz. Yeni kaydedilen öğrenci göreli haftalık aktivite sinyaliyle hemen etiketlenmez. Sinyal bulunmaması herkesin yeterli çalıştığı anlamına gelmez; UI bunu belirtir. XP bu kurallarda kullanılmaz.

## Security modeli

- Callable öğretmen UID'sini doğrulanmış Firebase auth'tan alır; istemciden teacher UID kabul etmez.
- Yalnız password / Google öğretmen provider'ları kabul edilir; custom öğrenci oturumu ve anonim çağrı reddedilir.
- Sınıf/öğrenci kapsamı aynı UID namespace'inde doğrulanır.
- Yeni Firestore analytics ve analyticsDimensions kuralları yalnız ilgili öğretmene okuma verir. Öğrenci, başka öğretmen ve tüm istemci yazmaları reddedilir.
- Sunucu dışı XP/cevap/summary yazma engelleri sürer. Public Arena projection'ına özel akademik analytics alanı eklenmedi.
- Production App Check koşulu mevcut callable yaklaşımını izler; emülatörde kapalıdır. Production'a Rules veya Functions deploy edilmedi.

## Test sonuçları

| Kontrol | Sonuç |
|---|---|
| `npm run build` | Başarılı |
| Son backend paketi | **96 / 96**: 61 mevcut + 35 analytics testi |
| Tüm dört viewport E2E paketi | **36 / 36** |
| Son model / dönem lideri düzeltmesinden sonra öğretmen E2E | **8 / 8** |

Backend paketinde tüm talep edilen authorization, solved/correct/wrong, XP bağımsızlığı, tekrar/retry, concurrency, subject/topic, class tutarlılığı, İstanbul hafta sınırı, no-data, taşıma/kaldırma ve filtre/sıralama durumları doğrulandı. Ek testler anahtar çakışması, eski projection sürümünün yeniden kurulması, aynı Arena sıraları ve küçük örneklem/süre eşiklerini kapsıyor.

Gerçek tarayıcı akışında öğretmen sınıf ve üç öğrenci oluşturur; öğrenciler UI üzerinden 10, 3 ve 5 cevap verir. **18 soru = 12 doğru + 6 yanlış = UI'da %67** dashboard, sınıf ve konu ekranlarında doğrulanır. Öğretmen öğrenci detayına girer; ikinci sınıf/no-data öğrencisiyle filtreyi kullanır. Ayrı test loading, unavailable/error, yeniden deneme ve uzun gerçek isimleri doğrular.

İlk hata ekranı testi, uygulamanın güvenli genel mesajı yerine mock'un ham mesajını beklediği için başarısız oldu. Beklenti düzeltildi; son 36 E2E ve son 8 öğretmen kontrolü geçti. Kritik analytics/authorization testi başarısız kalmadı.

## Dört viewport ve görsel kanıt

**360×800, 768×1024, 1366×900, 1920×1080** Chromium ile doğrulandı. 15 öğretmen görünümü/durumu × 4 boyut = **60 ekran görüntüsü** incelendi. Telefon/tablette yatay taşma yok; desktop tablo ve kompakt KPI düzeni, mobil etiketli öğrenci blokları çalışıyor. Gerçek akışlarda yakalanan console error ve page error listeleri boş. Öğrenci tarafındaki mevcut responsive/regresyon kontrolleri de geçti.

Kanıt: `artifacts/milestone-5/{phone,tablet,desktop,wide}`; toplu panolar `artifacts/milestone-5/review`. Tam screenshot'lar tüm sayfayı, review panoları viewport üst bölümünü gösterir. Fiziksel cihaz, Safari veya işletim sistemi ekran klavyesi testi yapılmadı.

Loglar: `milestone5-build.log`, `milestone5-backend-final.log`, `milestone5-e2e-final.log`, `milestone5-teacher-final.log`. Auth/session/Arena dosyalarının koruma hash kontrolü `artifacts/milestone-5/protected-check.json` içinde.

## Değiştirilen / oluşturulan dosyalar

Yeni kaynak/test dosyaları:

- `functions/src/analytics-store.ts`
- `functions/src/analytics.ts`
- `src/domain/analytics.ts`
- `src/features/TeacherAnalytics.tsx`
- `src/ui/teacher-analytics.css`
- `tests/analytics.test.mjs`
- `tests/e2e/teacher-analytics.spec.ts`

Değişen mevcut kaynaklar:

- `functions/src/index.ts`: yeni öğrenci özeti ve analytics export'u.
- `functions/src/quiz.ts`: aynı transaction'da analytics; kabul zamanının ortak timestamp ile kaydı. XP idempotency/cevap doğrulama mantığı korunur.
- `firestore.rules`: iki özel analytics koleksiyonunun öğretmen okuma kuralları.
- `src/features/Teacher.tsx`: analytics entegrasyonu ve detay navigasyonu; yönetim korunur.
- `src/main.tsx`: öğretmen detay rotaları ve scoped CSS importu.
- `package.json`: analytics testinin mevcut pakete eklenmesi.

`MILESTONE-5.md`, QA logları/görüntüleri ve normal derleme çıktıları ayrıca oluşturuldu. Auth, session, Arena server/domain ve öğrenci feature/UI kaynakları yeniden yazılmadı.

## Performans / maliyet yaklaşımı ve sınırlar

Normal kabul edilmiş cevap yaklaşık **3 ek analytics belge okuması ve 3 ek yazma** kullanır: öğrenci, ders, konu. Retry erken döndüğü için yeni analytics yazması üretmez. Ayrı trigger zinciri veya ilave backend servisi yoktur.

Normal dashboard okuması yaklaşık **4 × aktif öğrenci + sınıf belgeleri** ölçeğindedir; cevap sayısıyla büyümez. Class/student detayında yalnız seçili üyelerin boyut belgeleri eklenir. Class toplamı her cevapta ortak belgeye yazılmadığından sınıf düzeyinde yazma hotspot'u oluşturulmaz. Filtre/dönem/sıralama yalnız DTO üzerinde çalışır; canlı tüm-geçmiş subscription maliyeti yoktur. Callable mevcut bölge/minInstances=0/maxInstances=3 yaklaşımını kullanır.

Eksik/eski analytics için ilk rebuild canonical geçmişi bir kez tarar ve ek maliyet oluşturur. Çok büyük eski geçmişte transaction süre/boyut sınırı için parçalı sunucu migration'ı gerekir; bu sürüm küçük başlangıç verisiyle test edildi. Pre-M3 haftalık XP uyumluluğunda mevcut `readProgress` helper'ı eksik legacy kovasını award kayıtlarından okuyabilir; XP sistemi bu milestone için yeniden yazılmadı.

Aktif roster için **2000 öğrenci** koruma sınırı var; aşılırsa eksik/yanıltıcı toplam gösterilmez, işlem reddedilir. Bu sınır bir 2000-öğrenci yük testi veya gecikme garantisi değildir. Büyük hesaplar için sayfalı raporlama ve kalıcı sınıf/öğretmen özetleri sonraki ölçek adımıdır. Gün bazlı grafik, geçmiş hafta seçimi, mastery analizi, AI yorumu, manuel XP, ödev/görev/ödül, PDF, global leaderboard veya sınıflar arası yarış eklenmedi.

## Yerel inceleme

Uygulama `http://127.0.0.1:5173/` adresinde ve Auth/Firestore/Functions emülatörleriyle çalışır bırakıldı. Mevcut demo öğretmen hesabı yeni callable ile gerçek veriden kontrol edildi; snapshot `artifacts/milestone-5/demo-report.json` içinde. Bu kontrolde 2 sınıf, 3 aktif öğrenci, 11 cevap / 9 doğru / 2 yanlış ve 9 Academic XP vardı; bunlar test örneği için sahte KPI olarak kullanılmadı.

## Öğretmen olarak bu dashboard'da hâlâ eksik bulduğum şeyler

- Genel / bu hafta karşılaştırması var; öğrencinin gün gün çalışma eğilimi ve önceki haftalar henüz görünmüyor.
- Tekrar çözme hacme ve başarı oranına katılıyor. Bu oran tek başına yeni sorulardaki bağımsız öğrenme düzeyini göstermez.
- Ders/kademe ve soru hacmi görünür, fakat içerik zorluğu veya kazanım kapsamı için ek akademik bağlam yok.
- Arşivlenen öğrencinin geçmişi korunuyor ancak panelden arşiv inceleme yolu yok.
- Özellikle telefonda karşılaştırma ve kısa kod yönetiminin birlikte bulunması uzun sayfa oluşturuyor; sonraki UX adımında yönetim/rapor erişimi daha kompakt düzenlenebilir.
