# Milestone 5.2 — Gerçek müfredat ve pilot soru bankası

## Entegrasyon

`scripts/curriculum-bank.mjs`, kanonik `data/mufredat/2-sinif.json`, öğrenci ağacı `2-sinif-ui.json`, `SCHEMA.json` ve dört soru JSON'unu birlikte doğrular. Kimlikler, soru/seçenek/açıklama metinleri aynen korunur. React içine ders/ünite/konu ağacı kopyalanmaz.

`npm run seed:curriculum` yalnızca localhost `demo-test-arena` Emulator'a yazar. Bir öğrenci ağacı, 20 soru ve 20 özel cevap belgesi olmak üzere 41 belgeyi mevcut veri modeline aktarır. Tekrar çalıştırmak içerikleri çoğaltmaz veya değiştirmez; mevcut belge kaynakla uyuşmazsa işlem durur. Canlı Firebase import/deploy yapılmadı.

```text
curricula/2                         # JSON'dan türetilen ad/kimlik ağacı
questions/{kaynakQuestionId}         # mevcut ortak soru bankası; isDemo=false
privateQuestionAnswers/{questionId}  # correctOptionId, açıklama, kazanım metadata'sı
privateTestKeys/{testSessionId}       # test açılırken dondurulan özel cevap anahtarları
teachers/{uid}/students/{sid}/testSessions/{testId}/answers/{questionId}
  grade, subjectId, unitId, topicId, questionId, isCorrect, earnedXP
  outcomeMappingStatus, outcomeCode (yalnızca kesin eşleşmede)
```

Mevcut `gradeLevel/subject/topic/choices/correctChoiceId` alanlarına adapter uygulanır; kaynak `grade/subjectId/unitId/topicId` bilgileri de korunur. Normal testte doğru cevabın kaynağı **correctOptionId**'dir; seçenek dizisinin sırası değildir. Soruların şıkları mevcut mekanizmayla karıştırılır. Cevap anahtarları ve kazanım kodları katalog/soru DTO'suna gönderilmez.

## Öğrenci akışı ve içerik durumu

2. sınıf: **Ders → Ünite / Ana Başlık → Konu → Soru Sayısı → Test**. Türkçe, Matematik, Hayat Bilgisi ve İngilizce JSON sırasıyla görünür. İngilizce `Classroom Life` altında kaynak konular açılır. Diğer dersler aynı seçim bileşenini kullanır.

**20/20 pilot erişilebilir:** Her derste 5 soru. Müfredattaki bütün ünite/konu adları gösterilir; bazı konuların soru havuzu sıfırdır. Boş konu açıkça belirtilir ve test başlatılamaz. Soru sayısı seçenekleri gerçek havuza göre oluşur; tek soruluk konuda yalnızca 1 sunulur. Sunucu ayrıca 1–50 sınırını ve havuzun yeterliliğini doğrular. Aynı questionId bir test içinde çoğaltılmaz.

**Karışık Test eklendi.** Ders seviyesinde bir seçim modudur; topicId veya kazanım üretmez. Test başlığındaki topic/unit null kalır. Her sorunun gerçek ünite/konusu donmuş soru metadata'sından analytics'e aktarılır.

3–12. sınıf içeriği eklenmedi. Yeni JSON dosyaları aynı importer/ağaç bileşeni tarafından okunabilecek yapıdadır. Mevcut kademe erişimi korunur: 2 yalnızca 2; diğer kademeler kendisi ve bir önceki. Henüz aktarılmamış kademelerde demo gösterilmez; içerik hazırlık durumu gösterilir.

## Eski sistem ve veri ayrımı

Eski 36 teknik soru silinmedi; `scripts/demo-questions.mjs` ve `seed-demo.mjs` regression fixture'ı olarak korundu. İkinci soru veritabanı, ikinci cevap motoru veya ikinci XP sistemi kurulmadı. Her iki içerik aynı `questions/privateQuestionAnswers`, `startTest`, `submitAnswer` ve `awardedQuestions` yolunu kullanır.

Normal katalog ve test havuzu yalnızca **isDemo=false** içerik alır. Eski demo kategorileri normal öğrenci arayüzüne girmez. Testlerin eski 5/6. sınıf akışını koruyan `FixtureSelection` ve katalog/request adapter'ı yalnızca Emulator'da, test hazırlığının Admin yoluyla yazdığı özel `testFixtureBank` öğretmen işaretiyle açılır. İstemci bu işareti veya soru bankasını yazamaz. Production ortamında fixture kapısı kapalıdır.

Testler `contentBank` ile ayrılır; farklı bankaya ait testin devamı/cevaplanması reddedilir. Eski demo geçmişi silinmedi veya XP düşürülmedi. Böyle bir öğrenci kaydında gerçek test başlatılması açık bir hata ile engellenir; gerçek içerik için yeni öğrenci kaydı kullanılır. Böylece eski demo XP'si gerçek soru XP'sine karıştırılmaz. Otomatik/destrüktif geçmiş geçişi yapılmadı.

## XP, analytics ve güvenlik

XP formülü değişmedi: **aynı studentId/questionId için ilk doğru +1; yanlış 0; sonraki doğrular 0 yeni XP**. Test/soru cevabının ilk kabul edilen sonucu değiştirilemez. Cevap, ödül, toplam/haftalık XP, Arena ve analytics mevcut sunucu transaction'ında güncellenir.

Genel/haftalık solved, correct, wrong, başarı oranı ve Academic XP tanımları korunur. Cevap kaydında gerçek grade/subjectId/unitId/topicId/questionId tutulur. Mevcut ders/konu boyutlarına ünite metadata'sı ve ünite sayacı eklenir; öğretmen ekranı değiştirilmez. Karışık test geçmişi yeniden hesaplanırken de her cevabın gerçek soru bağlamı kullanılır.

15 sorunun kesin outcomeCode'u korunur. İngilizcedeki 5 soru `theme-level-only` olarak kaydedilir; candidateOutcomeCodes özel cevap anahtarında korunur, içinden kesin kod seçilmez. Yeni kazanım eşlemesi üretilmedi.

Teacher UID izolasyonu, öğrenci kısa kodu, authentication, sınıf üyeliği, kod yenileme/kaldırma, Arena sıralaması ve Security Rules değiştirilmedi. Banka/ağaç/özel anahtarlar istemciye doğrudan açık değildir. Mevcut korumalar gerçek pilot testlerde de doğrulanır.

## Test sonuçları

Build: başarılı. Backend: **107 başarılı, 0 başarısız**.

| Dosya / kapsam | Başarılı | Başarısız |
|---|---:|---:|
| security | 13 | 0 |
| quiz | 23 | 0 |
| arena | 25 | 0 |
| analytics | 35 | 0 |
| bulk-students | 2 | 0 |
| curriculum | 9 | 0 |

E2E son sonucu: **45 başarılı, 0 başarısız**. Yeni gerçek müfredat akışı 360×800, 768×1024, 1366×900 ve 1920×1080 projelerinde test edilir. Mevcut 390×844 sınıf yönetimi kontrolü de geçti. Dört kritik boyutta yatay overflow, console error veya page error yok; uzun ünite/konu adları, şıklar ve loading/error görüntüleri ayrıca incelendi.

Yeni testler: 20 pilotun erişimi; dört ders ve kaynak ağaç; Classroom Life; matematik ana başlık/konu; konu filtresi; küçük/boş havuz; correctOptionId; yanlış/ilk doğru/tekrar XP; eşzamanlı retry; gerçek soru bazında mixed analytics ve geçmiş rebuild; kesin olmayan outcome; private veri/XP yazım reddi; öğretmen/öğrenci izolasyonu; kod yenileme/kaldırma; loading/error/retry; uzun adlar ve overflow.

Sahte analytics üretilmedi: test sayımları gerçek `submitAnswer` çağrılarından gelir. Yeni fixture öğretmenleri, sınıfları, öğrencileri, özel test anahtarları ve bilinen kod indeksleri test sonunda temizlenir. Kaynak JSON'lar ve korunan 5.1/Auth/Arena/Rules dosyaları SHA-256 ile karşılaştırılır: **16/16 değişmeden korundu**.

Kanıtlar: `artifacts/milestone-5.2/build-final.log`, `tests-final.log`, `protected-check.json`, dört viewport ekran görüntüsü.

## Kaynakta gözlenen durumlar

- Talimatta belirtilen `data/soru-bankasi/REVIEW.md` depoda bulunmuyor. Dört bankanın pilotStatus'u reviewed-v2; bağımsız bir review dosyası okunamadı.
- Banka dosyaları schemaVersion=1, SCHEMA ve öğrenci ağacı schemaVersion=2. Dosyalar değiştirilmedi; importer gerçek alan/ID/kazanım sözleşmesini doğrular.
- Bazı ana başlık adlarında kaynakta birleşik nokta karakterleri ve Türkçe büyük/küçük harf sorunları var. Ad/ID'ler keyfî düzeltilmedi.
- Müfredat ağacı pilot havuzdan daha geniş; sıfır sorulu konular bir veri hatası olarak doldurulmadı.

## Değişen dosyalar

- `scripts/curriculum-bank.mjs` — kaynak doğrulama ve tek bankaya adapter (yeni).
- `scripts/seed-curriculum.mjs` — güvenli, idempotent yerel import (yeni).
- `functions/src/quiz.ts` — normal/fixture ayrımı, katalog, küçük havuz, gerçek filtre, mixed ve cevap metadata'sı.
- `functions/src/analytics-store.ts` — gerçek soru bağlamı ve ünite boyutu; mevcut sayaç tanımları korunur.
- `src/features/Quiz.tsx` — veri tabanlı seçim, boş/küçük havuz, tekrar test parametreleri, retry.
- `src/domain/quiz.ts`, `src/domain/analytics.ts` — ilgili DTO metadata tipleri.
- `src/ui/quiz.css` — uzun isimlerin sarılması; redesign yok.
- `firestore.indexes.json` — yeni filtreler için index tanımları; deploy yapılmadı.
- `package.json` — seed komutu ve test zinciri.
- `tests/helpers.mjs` — yalnızca yerel fixture erişimi hazırlığı.
- `tests/classroom-fixture.mjs` — özel test anahtarlarını da temizleme.
- `tests/e2e/teacher-analytics.spec.ts` — eski teknik fixture erişiminin açık test hazırlığı.
- `tests/curriculum.test.mjs`, `tests/e2e/curriculum.spec.ts` — yeni doğrulamalar.
- `MILESTONE-5.2.md` — bu rapor.

Kaynak JSON'lar, PRODUCT/DESIGN/SCREENS, öğretmen UI, authentication, kısa kod, Security Rules ve Arena dosyaları değiştirilmedi. Commit, push, branch veya production deploy yapılmadı.

## Yerel deneme

Adres: http://127.0.0.1:5173/ . Emulator: Auth 9099, Firestore 8080, Functions 5001.

Öğretmen: `demo.ogretmen@testarena.local` / `TestArena123!`.

Mevcut DOSTLAR ve öğrencileri değiştirilmedi. Ayrı **2. Sınıf Pilot** grubunda **Elif Pilot** hazırdır. Güncel kısa kod: **272C67** (`artifacts/milestone-5.2/local-demo.json`). Öğretmenden çıkış yaptıktan sonra kısa kodla öğrenci girişi yapılabilir. Pilot öğrenciye yapay XP/analytics yazılmadı.

Vite ve Emulator süreçleri görev sonunda açık bırakılır. Durdurmak için ilgili terminal oturumlarında Ctrl+C kullanılır.
