# Parametrik Matematik Soru Sunumu — Teknik Rapor

Bu çalışma 2. sınıf soru sunum altyapısı içindir. Aktif bankaya soru eklenmedi; 50 soruluk taslak, dört pilot soru JSON'u, kanonik müfredat ve V2 navigasyonu değiştirilmedi. Ekli talimatta bir referans PDF bulunmadı; repository'de de PDF bulunmadı. Sunum kategorileri kullanıcının örneklerinden ve projedeki müfredattan çıkarıldı; bir kitaptan soru/görsel kopyalanmadı.

## 1. Sunum kategorileri ve mimari

Kategoriler: somut çokluk/model okuma; sayı ve işlem şemaları; sayı/şekil örüntüleri; günlük yaşam verisi ve konuşmalı problemler; eş gruplar; geometri ve konum; ölçme; kesir; kategorik veri.

Mevcut `visual: {kind:'geometry',shape,alt}` aynen geçerlidir. Yeni model 20 kontrollü matematik bileşeni + `scene` kompozisyonundan oluşur. JSON'dan component/CSS/asset URL seçilmez. Bir ortak saf sözleşme import ve Functions DTO'sunda kullanılır. Renderer yalnız doğrulanmış model çizer. Soru metni ve seçenek kimlikleri mevcut sözleşmelerini korur. Kaynak bankalarda 3 veya 4 seçenek desteklenir; eski 4 seçenekli kayıtlar değişmez.

`scene` yalnız `compare`, `equation`, `stack` preset'lerini kabul eder; en fazla 6 doğrudan çocuk, en fazla bir sahne katmanı vardır. `equation` operatör sayısı öğe sayısından bir eksik olmalıdır. `visualPlacement: 'above'|'below'` soru görselinin yerini belirler. Matematik kartları/konuşma balonları soru kartının içindeki bilgileri düzenler; genel amaçlı sayfa editörü yoktur.

## 2. Güvenli JSON parametreleri

Bütün görsellerde `kind` ve 1–300 karakterlik `alt` zorunludur. Yalnız A/B/C harfi olan alt reddedilir. Bilinmeyen alanlar, türler, raw SVG/HTML, URL, CSS, component ve doğruluk anahtarı alanları reddedilir. Metinler React tarafından normal metin olarak escape edilir; HTML olarak çalıştırılmaz. Tek görselin çizim maliyeti en fazla 180, soru ve seçeneklerinin toplamı en fazla 600'dür.

| kind | Kabul edilen alanlar / sınırlar |
|---|---|
| geometry | shape: önceki 9 geometrik şekil/cisim |
| objects | objectType: pencil, eraser, apple, hazelnut, ball, flower, star, candy, strawberry, book, marble, cube, battery, box, pot; count 1–100; layout grid/rows; opsiyonel groupSize 1–20 |
| base-ten | tens 0–9; ones 0–9; onluk çubuklarının her biri tam 10 hücre içerir |
| math-cards | mode tokens/equations; 1–9 item; value sayı 0–999, en fazla 32 karakterlik düz ifade veya null; shape chip/circle/box/triangle/star |
| vertical | operator +/−; top ve bottom 0–999; result 0–999 veya null; üç basamak sağa hizalı, işlem çizgisi korunur |
| sequence | mode numbers/shapes; 2–12 öğe; sayı 0–999, desteklenen geometrik şekil veya null; null soru işaretidir |
| paths | 1–3 etiketli yol; her yolda 2–8 sayı veya null; label en fazla 12 karakter |
| character | avatar ada/deniz/efe; name en fazla 40 karakter; birlikte verilen value 0–999 ve whitelist unit veya speech en fazla 700 karakter |
| groups | objectType; totalObjects 1–100; yalnız birisi: groupCount 1–12 / objectsPerGroup 1–20; arrangement plates/array/pots; tam ve eşit bölünme zorunlu, en fazla 12 grup ve grup başına 20 nesne |
| geometry-layout | en fazla 12 öğe; shape; column/row 0–3; size large/small; rotation 0/90/180/270; opsiyonel face/edge/vertex işareti; işaretler cismin gerçek SVG koordinatlarına bağlanır; silindire köşe, küreye ayrıt/köşe verilemez |
| symmetry | axis vertical/horizontal; left/right `{x,y}` hücreleri 0–8; showAxis boolean; solda 1–20, sağda 0–20 hücre |
| rotation | 4 veya 8 etiketli çark; startIndex; birlikte opsiyonel direction clockwise/counterclockwise + quarterTurns 1/2; sonuç ibresi otomatik çizilmez |
| fraction | model circle/rectangle/bar; 2–8 pozitif parça ağırlığı 1–8; benzersiz shaded indeksleri; eşit parçalar eşit ağırlıklarla, eş olmayan parçalar farklı ağırlıklarla çizilir |
| clock | hour 0–23; minute 0–59; yelkovan minute×6°, akrep (hour%12)×30°+minute/2° |
| money | 1–12 değer grubu; kurus whitelist 1/5/10/25/50/100/500/1000/2000/5000/10000/20000; count 1–10; toplam en fazla 24 para; toplam değer renderer tarafından yazılmaz |
| ruler | maxCm 1–12; startCm<endCm≤maxCm; objectType pencil/book/eraser; showLength boolean; cetvel sıfırı başlangıç olarak varsayılmaz |
| balance | left/right objectType+value 0–100+unit kg/g; tilt level/left/right; birim dönüşümü sonrası verilen kütlelerle eğim tutarlı olmalı |
| container | vessel glass/bottle/jug/bucket/spoon/ladle/cup/pot; capacityClass small/medium/large; fill 0–1; birlikte opsiyonel capacityMl 1–10000 + amountMl 0–capacityMl; fill oranı miktar/kapasite ile tutarlı olmalı |
| data | mode bar/pictograph/tally/table; unitValue 1–5; en fazla 5 label/value satırı; label≤35 karakter, value 0–20; nesne grafiğinde değerler birim değerine tam bölünmeli |
| number-line | min/max 0–100; step 1–10; en fazla 8 aralık; points 0–100, çizilen tiklere eşleşen değerler |
| scene | preset compare/equation/stack; 1–6 doğrulanmış doğrudan görsel; equation için +/−/×/÷/=/→ operatörleri; opsiyonel stimulusId en fazla 64 karakter |

## 3. Örnek JSON'lar

```json
{"kind":"objects","objectType":"pencil","count":36,"layout":"grid","alt":"Tek tek sayılabilen kalem grubu"}
```

```json
{"kind":"scene","preset":"equation","alt":"İki blok modelinin toplama ifadesi","operators":["+"],"items":[{"kind":"base-ten","tens":2,"ones":3,"alt":"On eş hücreli çubuklar ve ayrı hücreler"},{"kind":"base-ten","tens":1,"ones":4,"alt":"On eş hücreli çubuk ve ayrı hücreler"}]}
```

```json
{"kind":"container","vessel":"jug","capacityClass":"large","fill":0.5,"capacityMl":1000,"amountMl":500,"alt":"Kapasitesi ve mevcut sıvı miktarı ayrı verilen sürahi"}
```

Tam soru/şık örnekleri: `tests/fixtures/math-engine-questions.json`. Dosya yalnız fixture olarak yüklenir; aktif import bunu keşfetmez. Verilen değerleri çizer; doğru şık ve çözüm bilgileri mevcut özel cevap koleksiyonunda tutulur.

## 4. Ortak stimulus

Kaynak bankaya opsiyonel `stimuli: {id: visual}` ve soruya `stimulusId` verilebilir. Import referansı doğrular ve görseli sorunun bağımsız snapshot'ına açar. İstemcide global stimulus/cevap listesi açılmaz. İki soru aynı görseli kullanırken ayrı questionId, cevap ve awardedQuestions kayıtlarına sahiptir. Test sorularının karıştırılması veya sırası değiştirilmez; her soru ortak şeklin tam bir kopyasını gösterir. Fixture 19 ve 30 bunu doğrular.

## 5. Müfredat taraması — 6 ünite / 25 konu

Aşağıdaki eşleştirme motorun kullanım önerisidir; fixture sorularına kesin kazanım kodu atanmış değildir.

| Ünite | Taranan konular ve kullanılabilecek modeller |
|---|---|
| 1 — Nesnelerin Geometrisi | Geometrik Cisimler → geometry/objects; Geometrik Cisim Modelleri → geometry-layout; Geometrik Şekil Modelleri → geometry-layout; Biçimsel Özellikler → rotation/geometry-layout/compare; Sıvı Miktarını Tahmin Etme → container/compare |
| 2 — Sayılar ve Nicelikler | Sayılar → objects/math-cards; Sayıları Çözümleme → base-ten; Sayıları Sıralama → math-cards/number-line; Ritmik Sayma → paths/number-line; Sayı ve Şekil Örüntüleri → sequence; Nesne Sayısını Tahmin Etme → objects/groupSize |
| 3 — İşlemlerden Cebirsel Düşünmeye | Toplama/Çıkarma Problemleri → character/scene/vertical/base-ten; Sonuç Tahmini ve Zihinden İşlem → math-cards/number-line; Toplama/Çıkarma İlişkisi → scene/vertical; Çarpma/Bölme → groups/array; Çarpma/Bölme Tahmini → groups/math-cards; Dört İşlemde Eşitlik → math-cards/equation |
| 4 — Sayılar ve Nicelikler | Kesirler → fraction; Paralarımız → money/character; Zaman Ölçme → clock/compare; Uzunluk ve Kütle Araç/Birimleri → ruler/balance; Ölçmede Tahmin → character/objects/ruler/balance |
| 5 — Nesnelerin Geometrisi | Yer ve Yön Bulma → rotation/paths/geometry-layout kısmi temel; Simetri → symmetry |
| 6 — Veriye Dayalı Araştırma | Veriyle Çalışma ve Karar Verme → data (kaynak öğrenme çıktısı en çok iki veri grubuyla çalışmayı belirtir; soru yazarının buna uyması gerekir) |

İstemcide V2 navigasyon ağacı veya mevcut konu başlıkları değiştirilmedi. Görsel metadata analytics boyutu haline getirilmedi; gerçek sorunun grade/subject/unit/topic/outcome verileri aynı akıştan geçer.

## 6. Fixture senaryoları

1 nesne sayma; 2 bir deste görsel seçenek; 3 blok okuma; 4 üç blok seçenek; 5 bloklarla toplama; 6 iki karakter/kütle verisi; 7 konuşma balonu; 8 dikey toplama; 9 dikey çıkarma; 10 eksik sayı örüntüsü; 11 şekil örüntüsü; 12 ritmik yollar; 13 sayı/işlem şekilleri; 14 paylaştırma; 15 array; 16 şekil seçeneği; 17 pil/cisim eşleşmesi; 18 simetri; 19 çeyrek dönüş; 20 kesir; 21 üç analog saat seçeneği; 22 para; 23 sıfırdan başlamayan cetvel; 24 terazi/kütle; 25 kapasite–mevcut miktar ayrımı; 26 grafik; 27 bloklarla çıkarma; 28 işaretli geometrik yapı; 29 sayı doğrusu; 30 ortak stimulus/yarım dönüş.

## 7. Erişilebilirlik ve matematiksel doğruluk sınırı

Her görselin tarafsız alt metni bulunur; şekil tanıma sorusuna doğrudan şeklin adı yazılmaz. Nesneler ve bloklar sayılabilir liste öğeleri; işlemler/sayılar/değerler gerçek metin; grafik tablosu semantik tablodur. Saat fixture etiketleri saat cevabını yazmak yerine ibrelerin işaret ettiği konumları tarif eder.

Alt metnin pedagojik uygunluğu algoritmik olarak garanti edilemez: `alt='Doğru cevap A'` gibi insan tarafından kötü yazılmış bir düz metni genel amaçlı şema doğru teşhis edemez. Görseldeki bilgilerin eşdeğer erişilebilir açıklaması bazı model-okuma sorularında cevabı çok kolaylaştırabilir. Güvenlik doğru şık anahtarını gizler; verilen matematiksel bilgileri gizlemez. Soru yazarı, görselden alınan bilgiyle ek çıkarım gerektiren eşdeğer soru hazırlamalı veya o soruyu erişilebilirlik incelemesinden geçirmeden yayınlamamalıdır. Gizli sonucu otomatik aria-label'a yazan bir sistem yoktur; kapasite/ölçü gibi alanlar yalnız soru yazarının verdiği bilgidir.

## 8. Hâlâ desteklenmeyen biçimler / taramada kalan ihtiyaçlar

- Serbest çizim, sürükleyerek gruplama, öğrenci tarafından cetvel/saat hareket ettirme ve açık uçlu cevaplar kapsam dışı; mevcut çoktan seçmeli akış korunur.
- Simetri modeli sınırlı hücre ızgarasıdır; keyfî eğri kontur aynalama yoktur.
- Geometrik modeller sınırlı 4×4 yerleşim ve 90° dönüşlerle çizilir; perspektif fizik motoru/örtülen cisim sayısını otomatik doğrulama yoktur. İç içe küçük/büyük şekil yerleşimi mümkündür; soru matematiğinin editoryal doğrulanması gerekir.
- MAT.2.3.6'nın mesafe/yön/hedef stratejileri için engelli harita/koordinat rotası henüz yoktur. Sayı yolu, çark ve konum bileşenleri bu çıktının tamamını karşılamaz.
- MAT.2.1.9 için haftalık/aylık takvim ve geçen süre şeritleri eklenmedi; analog saat vardır.
- MAT.2.1.10–11 için mezura/metre, hassas ölçüm animasyonu ve ağırlığı bilinmeyen kefeli denklem henüz yoktur; verilen kütleli basit terazi ve 12 cm'ye kadar cetvel vardır.
- Para modelleri eğitimsel simgelerdir; gerçek banknot fotoğrafı/gerçek para görüntüsünün birebir taklidi değildir.
- Sıvı modellerinin capacityClass alanı nitel çizim büyüklüğüdür; farklı kap biçimlerinin gerçek hacimlerini piksel alanından hesaplamaz. Sayısal kapasite ve mevcut miktar ayrı açık veriyle verilmelidir.
- Veri renderer'ı tek serili kategorik veri içindir; ileri grafik, çok serili araştırma ekranı, anket editörü veya otomatik rapor yoktur.
- Verilen JSON'un kazanım eşleşmesi ve sorunun matematiksel doğruluğu otomatik garanti edilmez; sahte outcomeCode üretilmedi.

## 9. Kaynak/test dosyaları

Değişen: data/soru-bankasi/SCHEMA.json; functions/visuals/contract.mjs; functions/visuals/contract.d.mts; functions/src/quiz.ts; scripts/curriculum-bank.mjs; src/domain/quiz.ts; src/features/Quiz.tsx; src/ui/MathVisual.tsx; tests/visual-fixture.mjs; tests/e2e/teacher-classroom.spec.ts; package.json. Sınıf testindeki tek değişiklik: açık sayfayı fixture temizliğinden önce kapatmak; analytics uygulama koduna dokunulmadı.

Eklenen: src/ui/GeometryGraphic.tsx; src/ui/math/ObjectIcon.tsx; src/ui/math/MathematicalVisual.tsx; src/ui/math/math.css; tests/fixtures/math-engine-questions.json; tests/math-engine.test.mjs; tests/e2e/math-engine.spec.ts; bu rapor. Build logları ve ekran görüntüleri artifacts/visual-engine altında ayrıca oluşur.

## 10. Doğrulama sonuçları

`npm run build` başarılı. `npm run test:local` içindeki unit/security: 125 geçti, 0 başarısız; bunların 9'u yeni matematik motoru testidir. Şema/whitelist, DTO anahtar gizliliği, stimulus çözümleme, yanlış cevap, ilk doğru +1 XP, tekrar/concurrency idempotency, analytics boyutları ve izolasyon kontrolleri geçti.

İlk tam E2E turu: 52 geçti, 1 zaman aşımı. 390×844 mevcut sınıf testinde tüm UI/analytics assertion'ları geçmişti; açık sayfanın fixture silinirken yeni analytics istekleri göndermesi sırasında Firestore transaction lock timeout oluştu. Testin finally bloğunda sayfayı temizlemeden önce kapatma düzeltmesiyle aynı senaryo ayrı koşuda geçti (17,7 saniye). Sonrasında beş viewporttaki sınıf testleri yeniden çalıştırıldı: 5 geçti, 0 başarısız (1,2 dakika). Böylece 53 farklı E2E senaryosunun tamamı başarılı koşuyla doğrulandı. İlk tam komutun exit code'u 1'dir; bunu sıfır hata sonucu olarak raporlamıyoruz.

Yeni görsel E2E: 4/4 geçti; 30 fixture × 4 viewport = 120 soru renderı. 360×800, 768×1024, 1366×900, 1920×1080'de 36 nesne, onluk/birlik, uzun konuşma, üç görsel seçenek, dikey işlem, sayı yolu, grafik, saat, cetvel, çoklu karakter ve sıvı kapları kontrol edildi. Yatay overflow ve browser console/page error yok. SVG saat büyüklüğü, nesne sayıları, onluk hücreleri, dikey basamak hizası ve sıvı doluluk koordinatları ayrıca assertion ile doğrulandı. Ekran görüntüleri artifacts/visual-engine/{phone,tablet,desktop,wide} altında.

Yerel aktif banka: 20 pilot soru, 5 Matematik; aktif görselli soru 0. Görsel fixture kalıntısı 0. Korunan 17 kaynak dosyasının hash'i değişmedi. 50 soruluk taslak değiştirilmedi/aktive edilmedi; production'a veri yazılmadı. Vite HTTP 200; Auth 9099, Firestore 8080, Functions 5001 ve Vite 5173 açık bırakıldı. Fixture yazımları yalnız demo-test-arena/localhost için izinlidir ve test sonunda silinir.

Loglar: artifacts/visual-engine/build.log, test-local.log, retry-classroom.log, classroom-final.log; hash kontrolü protected-check.json. Commit/push/deploy yapılmadı.
