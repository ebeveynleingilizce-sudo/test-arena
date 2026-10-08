# Öğrenci navigasyonu V2 geçişi — 6 Ekim 2026

## Değiştirilen dosyalar

- scripts/curriculum-bank.mjs: V2 aktif navigasyon ağacı, kanonik doğrulama ve kesin soru üyelikleri. Eski UI ağacı öğrenciye dönmez; mevcut soru belgelerinin teknik alanlarını değiştirmemek için eski teknik import adaptörü korunur.
- scripts/seed-curriculum.mjs: yalnızca localhost demo Emulator'da navigasyon belgesinin kontrollü değişimi. Soru/özel cevap belgeleri değişirse hâlâ hata verir; öğrenci geçmişine dokunmaz.
- functions/src/quiz.ts: güvenilir paket çözümleme, V2 katalog DTO'su ve tema/konu filtreleri. Eski Türkçe testlerinin görünür teknik başlıkları sadeleştirilir; geçmiş testleri ve XP korunur.
- functions/src/test-packs.ts (yeni): tek tema/konu kapsamında en fazla 10 soruluk paketler.
- src/features/Quiz.tsx: ders → ünite/tema → konu (Türkçe hariç) → test paketleri → sorular.
- src/domain/quiz.ts: navigasyon ve paket DTO alanları.
- src/ui/quiz.css: uzun başlıkların sarılması ve paket listesi boşluğu.
- tests/curriculum.test.mjs: eşleştirme, paket sınırları, sahte/karışık isteklerin reddi, XP, analytics, izolasyon.
- tests/e2e/curriculum.spec.ts: dört dersin V2 akışı ve responsive kontroller.
- NAVIGATION-V2.md (yeni): bu rapor.

Derleme çıktıları ve test artefaktları ayrıca üretildi. Kanonik 2-sinif.json, eski 2-sinif-ui.json, yeni 2-sinif-ui-v2.json ve dört pilot soru JSON'u değiştirilmedi. Auth, kısa kod, öğretmen/sınıf yönetimi, Security Rules, Arena ve öğretmen rapor kodu değiştirilmedi. XP işlemindeki formül ve kalıcı awardedQuestions/idempotency koruması korunur.

## Aktif kaynak ve veri geçişi

Aktif öğrenci başlıkları, sırası, navigationModel, sectionLabel, displayName ve konu adları doğrudan data/mufredat/2-sinif-ui-v2.json'dan gelir. Dosyanın adı v2 olsa da içerikte schemaVersion=3 ve datasetId son eki v3'tür; bu kaynak değerleri değiştirilmedi.

Yerelde curricula/2 belgesi yenilendi. 20 soru ve 20 özel cevap belgesi aynı kaldı. Geçmiş cevaplar, XP, kodlar ve test oturumları silinmedi. Eski navigasyon dosyası silinmedi; yeni öğrenci ağacında kullanılmıyor. Teknik soru alanları ve analytics geçmişi için uyumluluk adaptörü korunuyor.

## Kesin eşleşen 15 soru

Grade ve subjectId mevcut banka başlığında bulunur; her soruda tekrar edilmez. Unit/topic ID eşitliği ve varsa kesin outcomeCode'un V2 konu çıktıları içinde bulunması doğrulanır. İngilizcede kaynak yalnızca tema düzeyinde kazanım adayları verdiği için kesin outcomeCode üretilmedi.

| Soru | Ders | Ünite/Theme | Konu |
|---|---|---|---|
| g2-mat-0001 | Matematik | 2. ÜNİTE — Sayılar ve Nicelikler | Sayılar |
| g2-mat-0002 | Matematik | 2. ÜNİTE — Sayılar ve Nicelikler | Sayıları Çözümleme |
| g2-mat-0003 | Matematik | 2. ÜNİTE — Sayılar ve Nicelikler | Sayıları Sıralama |
| g2-mat-0004 | Matematik | 2. ÜNİTE — Sayılar ve Nicelikler | Ritmik Sayma |
| g2-mat-0005 | Matematik | 4. ÜNİTE — Sayılar ve Nicelikler | Kesirler |
| g2-hb-0001 | Hayat Bilgisi | 1. ÜNİTE — Ben ve Okulum | Zaman Yönetimi |
| g2-hb-0002 | Hayat Bilgisi | 1. ÜNİTE — Ben ve Okulum | İletişim Kuralları |
| g2-hb-0003 | Hayat Bilgisi | 2. ÜNİTE — Sağlığım ve Güvenliğim | Trafik İşaret Levhaları |
| g2-hb-0004 | Hayat Bilgisi | 3. ÜNİTE — Ailem ve Toplum | Görev ve Sorumluluklar |
| g2-hb-0005 | Hayat Bilgisi | 5. ÜNİTE — Doğa ve Çevre | Doğal Kaynakları Tasarruflu Kullanma |
| g2-en-0001 | İngilizce | THEME 1 — School Life | Greetings and introductions at school |
| g2-en-0002 | İngilizce | THEME 1 — School Life | Days of the week |
| g2-en-0003 | İngilizce | THEME 2 — Classroom Life | Classroom furniture, devices and objects |
| g2-en-0004 | İngilizce | THEME 2 — Classroom Life | Colours |
| g2-en-0005 | İngilizce | THEME 3 — Personal Life | Parts of the body and physical features |

## Eşleştirilemeyen 5 soru

- g2-tr-0001, g2-tr-0002: g2-turkce-okuma / g2-tr-t-o-2-2 / T.O.2.2.
- g2-tr-0003: g2-turkce-okuma / g2-tr-t-o-2-3 / T.O.2.3.
- g2-tr-0004, g2-tr-0005: g2-turkce-yazma / g2-tr-t-y-2-3 / T.Y.2.3.

Bunlar teknik beceri/kazanım kimlikleridir; sekiz yeni Türkçe temasından hangisine ait olduklarını belirtmez. Metin anlamından tema tahmini yapılmadı. Sorular silinmedi, değiştirilmedi; V2 test paketlerine alınmadı. Türkçe tema ekranı ve tema → test adımı çalışır; mevcut veriyle Türkçe soru çözümü başlatılamaz. Tema ekranında açıkça “Bu temada henüz eşleştirilmiş soru bulunmuyor.” görünür. Kaynakta doğrulanmış tema bilgisi sağlanmadan Türkçeye pilot soru atanmamalıdır.

## Son öğrenci akışları

- Türkçe → 8 Tema → Test paketleri → Sorular. Konu seçimi yok; Dinleme/İzleme, Konuşma, Okuma, Yazma gibi teknik kategoriler yok.
- Matematik → 6 Ünite → V2 Konu → Test paketleri → Sorular.
- Hayat Bilgisi → 6 Ünite → V2 Konu → Test paketleri → Sorular. Etiket ÜNİTE.
- İngilizce → 6 Theme → V2 Subtheme/Konu → Test paketleri → Sorular.

İlk başlıklar birebir V2 displayName ile gösterilir: 1. TEMA — Değerlerimizle Varız; 1. ÜNİTE — Nesnelerin Geometrisi; 1. ÜNİTE — Ben ve Okulum; THEME 1 — School Life. Sorusuz ünite/temalar müfredatın yapısını göstermek için erişilebilir, sorusuz seçimlerde test paketi üretilmez.

## Paket güvenliği ve analytics

Soru kimlikleri tek tema/konu içinde sıralanır ve en fazla 10 soruluk Test 1, Test 2… paketlerine ayrılır. 23 kimlikli izole unit senaryosunda 10+10+3 bölünmesi, tekrar olmaması ve kararlı paket üyeliği doğrulanır. Yeni soru üretilmez.

Paket kimliği yalnızca packId, görünen adı packName olarak test oturumunda saklanır. Paket adı topicId/outcomeCode yapılmaz. İstemci soru kimlikleri gönderemez; server aktif müfredat üyeliği ve yayınlanmış soru havuzundan paketi çözer. Karışık test ve eski teknik Türkçe seçimleri reddedilir. Mevcut 15 eşleşen soru 15 ayrı konuya bağlı olduğundan şu anda her dolu konuda bir soruluk Test 1 vardır.

Cevap ve analytics işlemi her sorunun dondurulmuş gerçek grade/subjectId/unitId/topicId ve doğrulanmış outcomeCode bilgisini kullanır. Öğretmen raporu için teknik alan adları korunur. Yanlış=0 XP; ilk doğru=1 XP; aynı questionId sonraki doğru=0 XP. İstek tekrarları çözülen/doğru/yanlış sayılarını çoğaltmaz.

## Doğrulama

Build: başarılı. 360×800, 768×1024, 1366×900, 1920×1080 V2 E2E ve başlık görsel kontrolleri geçti. Yatay overflow, console error veya page error yok. Türkçe boş paket davranışı, diğer üç derste gerçek soru açılması, İngilizce doğru cevap ve Matematik yanlış→ilk doğru→tekrar çözme kontrolleri geçti.

npm run build: başarılı. npm run test:local: exit 0. Backend toplam 109 geçti, 0 başarısız (Security 13; Quiz 23; Arena 25; Analytics 35; Bulk Students 2; Curriculum/V2 11). E2E toplam 45 geçti, 0 başarısız; bunların dört tanesi V2 akışını dört viewportta doğrular. Ayrı V2 E2E çalışması da 4/4 geçti. Geçişten önce yapılan ilk sandbox build denemesi EPERM ile engellendi; gerekli yerel dosya erişimiyle son build başarılı oldu. Test loglarındaki PERMISSION_DENIED satırları güvenlik testlerinin beklenen reddedilmeleridir.

Artefaktlar: artifacts/navigation-v2/. Yerel uygulama ve Auth/Firestore/Functions Emulator açık bırakılır. Commit, push veya production deploy yapılmadı.
