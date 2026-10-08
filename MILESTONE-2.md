# Milestone 2 — Soru çözme ve güvenli XP

Bu sürüm yalnızca localhost ve `demo-test-arena` Firebase Emulator projesinde
çalışır. Canlı proje, production soru bankası veya deploy oluşturulmadı.
Milestone 1 authentication, kısa kod çözümleme, öğretmen izolasyonu ve kalıcı
öğrenci kimliği korunur. Sınıf/grup ve kademe birbirinden bağımsızdır.

## Akış

Kısa kod girişi → Soru Çöz → Kademe → Ders → Konu → Soru sayısı →
sunucunun oluşturduğu test → sunucuda cevap kontrolü → geri bildirim → sonuç.

Kademe 2 yalnızca 2; 3–12 kendi kademesi ve bir önceki kademe. Arayüz katalogdan
seçenekleri alır. Sunucu her test açılışında, devam ettirmede ve cevapta güncel
öğrenci kademesini kontrol eder. Rules da test/soru snapshot ve cevap belgelerinin
doğrudan okunmasını güncel kademe kuralıyla sınırlar. Öğretmen kendi öğrencisinin
geçmişini okuyabilir; öğrenci güncel erişim aralığı dışındaki eski test içeriğini
okuyamaz. İleride öğrenci geçmişi listesi bu filtreyi uygulamalıdır.

## Yeni Firestore modeli

Mevcut Milestone 1 belgelerine eklenen alanlar/alt koleksiyonlar:

```text
questions/{questionId}
  questionId, gradeLevel, subject, subjectName, topic, topicName,
  questionText, choices[{choiceId,text}], status,
  curriculum{source,learningOutcomeId,reviewStatus}, isDemo

privateQuestionAnswers/{questionId}
  correctChoiceId, explanation

privateTestKeys/{testSessionId}
  {questionId: {correctChoiceId, explanation}, ...}

teachers/{teacherUid}/students/{studentId}/
  learning/summary
    totalXP, answeredCount, correctCount, wrongCount
  awardedQuestions/{questionId}
    questionId, firstTestSessionId, awardedAt, xp=1
  performance/{gradeLevel_subject_topic}
    gradeLevel, subject, topic,
    answeredCount, correctCount, wrongCount, earnedXP
  testSessions/{testSessionId}
    testSessionId, studentId, teacherUid, gradeLevel,
    subject, subjectName, topic, topicName, questionCount,
    questionIds, questions[cevapsız snapshot], answeredQuestionIds,
    correctCount, wrongCount, earnedXP, status,
    startedAt, completedAt
    answers/{questionId}
      questionId, studentId, testSessionId, selectedChoiceId,
      isCorrect, earnedXP, correctChoiceId, explanation, answeredAt
```

Firestore zaman alanları Timestamp; callable DTO zamanları epoch milliseconds.
Test snapshot'ı seçenekleri sabit kimlikleriyle saklar. Sunucu şıkları karıştırır;
doğrulama ekrandaki A/B/C/D sırasına değil choiceId değerine dayanır.
Curriculum alanı genişletilebilir; demo verisi MEB onayı/kazanım eşlemesi değildir.

## Question / answer güvenlik modeli

`questions` belgelerinde cevap anahtarı yoktur. Bu milestone'da bankaya doğrudan
istemci erişimi de kapalıdır; sorular yalnızca yetkili callable üzerinden gelir.
`privateQuestionAnswers` ve `privateTestKeys` bütün istemcilere kapalıdır.
Test başlatılırken cevap anahtarları ayrı privateTestKeys belgesinde dondurulur;
sonraki banka değişikliği devam eden testin doğrulamasını değiştirmez.

`quizCatalog`: aktif öğrenci için izin verilen kademelerdeki ders/konu/sayı listesi.
`startTest`: session, kademe, ders/konu, 10/20/30/50 sayısı ve havuz kapasitesi
doğrulanır. Ödüllendirilmemiş sorular önce, ödüllendirilmiş sorular sonra rastgele
seçilir. Aynı testte soru kimlikleri tekrarlanmaz.
`getTestSession`: sahipliği öğrenci session'ından türetir; yenilemeyle devam sağlar.
`submitAnswer`: yalnızca testSessionId, questionId, selectedChoiceId kabul eder;
fazladan sahiplik/XP/doğruluk parametrelerini reddeder.

Öğretmen UID ve studentId hiçbir quiz isteğinde istemciden alınmaz. Custom Auth
session eşlemesinden bulunur. Her kritik transaction canonical student belgesinden
status ve credentialVersion doğrular. Kod yenileme veya öğrenci kaldırma sonrası
eski token hâlâ imzalı olsa bile API kullanılamaz. Kademe değişikliği de yeniden
kontrol edilir. Sınıf taşıma öğrenci kimliğini ve kazanılan XP'yi değiştirmez.

Cevap verilmeden önce test payload ve Firestore test belgesi cevap anahtarı
içermez. İlk cevap kilitlendikten sonra yalnızca o sorunun doğru seçeneği ve kısa
açıklaması geri bildirim için döner; henüz cevaplanmamış soruların anahtarları
açılmaz. Kilitlenen cevap belgeleri sahibi öğrenci/öğretmen tarafından okunabilir.

## XP transaction

Her cevap için tek Firestore transaction:

1. Session, canonical öğrenci ve öğrencinin kendi test belgesi okunur.
2. Güncel kademe, test sahipliği ve soru üyeliği doğrulanır.
3. `answers/{questionId}` varsa ilk sonuç geri döner; sayılar veya XP değişmez.
4. Yoksa seçenek geçerliliği, frozen key, mevcut soru ödülü ve özet okunur.
5. Yanlış → 0; doğru ve ödül yok → 1; doğru ve ödül var → 0.
6. İlk cevap oluşturulur. XP=1 ise tek `awardedQuestions/{questionId}` oluşturulur.
7. learning summary, konu performansı ve test sayıları aynı transaction'da güncellenir.
8. Son soruysa completedAt ve completed status aynı işlemde yazılır.

İdempotency anahtarı `(testSessionId, questionId)`; kalıcı XP benzersizliği
`(studentId, questionId)` belgesidir. İlk yanlış cevabı aynı testte doğruyla
değiştirmek mümkün değildir. Yeni testte öğrenip ilk doğruyu yapmak +1 kazandırır.
Aynı soruyu iki farklı testten eşzamanlı doğru gönderme ödül/özet okuması üzerinde
çatışır; transaction yeniden değerlendirilir ve toplam yalnızca +1 olur.

Yanıt kaybından sonra yeniden gönderme, ilk authoritative cevabı geri getirir.
İstemci sunucu yanıtı gelmeden +1 animasyonu/XP hesabı yapmaz. Sonuç doğru sayısını
ve earnedXP'yi ayrı gösterir; tekrar sorularında 10 doğru / +0 XP geçerlidir.

Rules bütün istemci XP, ödül, performans, test/cevap ve leaderboard yazılarını
reddeder; sahibi öğretmen de doğrudan akademik XP yazamaz. Leaderboard bu milestone'da
oluşturulmadı. Özet kalıcı studentId altında olduğu için session değişiminden etkilenmez.

## Demo seed

`npm run seed:demo` yalnızca 127.0.0.1:8080 ve demo proje üzerinde çalışabilir.
36 soru + 36 private cevap belgesi:

| Kademe | Ders | Konu | Soru |
|---|---|---|---:|
| 5 | Matematik | Kesirler | 12 |
| 6 | Matematik | Kesirler | 12 |
| 6 | İngilizce | Temel Kelimeler | 12 |

Kimlikler `demo_g6_matematik_kesirler_001` gibi kalıcıdır. Seed tekrarında eksik
belge oluşturulur, aynı içerik değiştirilmez; aynı ID ile farklı içerik bulunursa
seed hata verir. Frontend fixture/cevap anahtarlarını import etmez.
10 soru kullanılabilir; 20/30/50 arayüzde pasif ve sunucuda yetersiz havuz nedeniyle
reddedilir. Test açılışında gerçek kapasite tekrar doğrulanır.

## Dosyalar

Yeni:
- functions/src/quiz.ts — quiz callable uçları ve transaction.
- src/domain/quiz.ts — public katalog/test/geri bildirim tipleri.
- src/features/Quiz.tsx — seçim, çözme, feedback, sonuç, devam ve tekrar.
- src/ui/quiz.css — responsive krem/lacivert/altın ekranlar ve durum tasarımı.
- scripts/demo-questions.mjs — yalnızca teknik fixture.
- scripts/seed-demo.mjs — emulator guard ve idempotent seed.
- tests/quiz.test.mjs — gerçek callable/Rules güvenlik ve XP testleri.
- tests/e2e/quiz.spec.ts — telefon/desktop tam çözme akışı.
- tests/e2e/quiz-retry.spec.ts — commit sonrası yanıt kaybı ve güvenli retry.
- MILESTONE-2.md — bu rapor.

Değiştirilen:
- functions/src/index.ts — yeni uçların export edilmesi; M1 işlemleri korunur.
- firestore.rules — yeni verinin okuma sınırları ve tüm istemci yazılarının reddi.
- firestore.indexes.json — katalog ve test seçimi sorgu indeksleri (deploy edilmedi).
- src/main.tsx — /ogrenci/coz ve /ogrenci/coz/:testId rotaları.
- src/features/Welcome.tsx — server-confirmed gerçek totalXP ve Soru Çöz CTA.
- package.json — seed ve bütün testleri çalıştıran komutlar.
- README.md — demo başlatma ve M2 açıklaması.

## Kontrol kapsamı ve sonraki adım

Son doğrulama: 5 Ekim 2026. `npm run build` başarılı; `npm test` çıkış kodu 0.

| Kontrol | Geçen | Başarısız | Atlanan |
|---|---:|---:|---:|
| M1 güvenlik/entegrasyon | 13 | 0 | 0 |
| M2 güvenlik/entegrasyon | 23 | 0 | 0 |
| Playwright (telefon 4 + desktop 4) | 8 | 0 | 0 |
| Toplam | 44 | 0 | 0 |

Telefon 360×800 ve desktop 1366×900: seçim, soru, doğru/yanlış, tekrar ve sonuç
ekranları kontrol edildi; yatay overflow yok. Ekran görüntüleri `test-results/`,
HTML test raporu `playwright-report/` altında (üretilen, gitignore kapsamındaki
dosyalar). Görsel kontrol sırasında sonuç CTA kontrastı düzeltilerek tekrar
doğrulandı. Normal quiz akışlarında console/page error yok. Kasıtlı kayıp yanıt
testinde yalnızca beklenen ağ kesintisi oluşturulur; uygulama page error yok.

İlk test çalıştırmasında kademe değiştirme testinin isteğinde M1 API'sinin zorunlu
classId alanı eksikti; test düzeltildi. Son iki çalıştırmada güvenlik ve XP testleri
başarılı. Son çalıştırma ek Rules ve kayıp yanıt kontrollerini de içerir.

Güvenlik testleri M1 izolasyon/session senaryolarını da tekrar çalıştırır. M2;
kademe sınırları, hidden keys, doğrudan yazı yasakları, foreign ownership, ilk
cevap kilidi, yanlış/tekrar, eşzamanlı ve retry XP, geçmiş/performance, kod yenileme
ve kaldırmayı kapsar. E2E ekran yenileme, doğru/yanlış sonuç ve tekrar XP içerir.
Yanıt kaybı testinde kasıtlı ağ hatası üretilir; normal akışlarda console error yoktur.

Bilinen sınırlar:
- Canlı Firebase/OAuth/App Check doğrulaması ve production çalışma testi yapılmadı.
- Kurulu PWA/offline test çalıştırılmadı. Mevcut shell SW korunur; cevap ve XP
  işlemleri online callable gerektirir, çevrimdışı ödül kuyruğu yoktur.
- Üretim müfredatı ve 2–12 tam içerik havuzu yoktur; demo teknik test içindir.
- Tam test geçmişi ekranı ve öğretmen raporları henüz geliştirilmedi; verileri saklanır.
- Küçük demo havuzunda seçim havuzu ve ödüller birlikte okunur. Büyük soru
  bankasında sorgu maliyetini ölçüp katalog/soru seçimini bölmek gerekir.
- CLI host Node 24 ile yapılandırılmış Functions Node 22 uyumsuzluğu ve mevcut
  firebase-functions sürümü için güncelleme uyarısı verir. Emulator testleri host
  runtime'da çalışır; deploy öncesi hedef runtime altında ayrıca doğrulanmalıdır.

Milestone 3 öncesi öneri: mevcut ödül kayıtlarından türetilen, sadece sunucunun
yazabildiği ve classId ile izole edilen Arena read modelini planla. Akademik XP'yi
görev/ödev ödülleriyle karıştırma. Haftalık zaman aralığı, eşitlik sıralaması ve
sınıf taşıma davranışını önce kesinleştir. İçerik yayınlama sürecinde questionId
yeniden kullanımını engelle; canlıya geçmeden App Check, kota, saklama süresi,
maliyet ve hedef Node runtime testlerini tamamla.
