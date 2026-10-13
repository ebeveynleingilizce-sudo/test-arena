# Test Arena — Test bitişi optimizasyonu, yerel 2. aşama

13 Ekim 2026. Önceki dinleyici optimizasyonları korundu. Yalnız yerel kod/test değişiklikleri yapıldı; commit/push/yayın, canlı Firebase erişimi veya değişikliği, Rules/indeks güncellemesi ve veri taşıma yoktur. Çalışma alanındaki önceki değişikliklere müdahale edilmedi.

## Sonuç

Önceki ölçüm kapsamındaki 10 soruluk test son cevabı **66 → 57 doğrudan okuma** (%13,6 azalma). Sekiz yeni XP, bir yanlış ve bir boş bulunan aynı fixture kullanıldı. Sonuçları gösterme sırasında tamamlanmış testi yeniden bitirme 39 → 11; kısa süre sonra yeniden açma 31 → 11.

Bu aşamada ölçüm, `server-clock.mjs` yardımcısının gerçek setDoc/getDoc çağrılarını da sayacak şekilde genişletildi. Dolayısıyla son cevap **67 → 58 SDK okuması, 38 → 38 başarılı belge yazması** olarak ölçüldü. Bunların her iki tarafta 1 okuma ve 1 yazması mevcut clockSamples işlemidir. Önceki 66/37 sayıları bu yardımcıyı kapsamıyordu. Normal cevaplarda saat yardımcı maliyeti yoktur.

Normal ara cevap, XP kazanma kuralları ve yazma şemaları değiştirilmedi. En büyük kalan son-cevap maliyeti, sekiz yeni XP için ayrı ve taze transaction kontrolleridir. Bunlar kaldırılmadı veya kalıcı değişebilir profil/özet önbelleğine alınmadı.

## Kod davranışı

- `settle()` okuduğu güncel oturumu, doğruladığı sonuç ID'lerini ve mevcut/başarıyla yazılmış XP makbuzlarını aynı işlemde DTO'ya taşır.
- `award()` başarılı transaction'dan doğrulanan makbuz bilgisini döndürür. Tekil ödül kontrolü, öğrenme özeti, haftalık XP, güncel profil ve gerekiyorsa güncel haftanın görüntüleme verisi transaction içinde taze okunmaya devam eder. Yazılan alanlar ve yazma sayıları değişmez.
- `getTestSession()` ve `finishTest()` başında okunan oturum yeniden kullanılır. Tamamlanmış testte `finishTest()` başlangıç DTO'sunu gereksiz yere oluşturmaz. Eksik cevapların boş olarak tamamlanması korunur.
- Normal tamamlanmış testlerde, bütün sonuçların sayaçlarla eşleştiği ve bütün doğru soruların makbuzlarının mevcut olduğu doğrulanınca sadece süreç belleğinde olumlu settlement bilgisi tutulur. Süre 60 saniye, kapasite Firestore instance başına 32 kayıttır. Firebase UID, öğrenci/öğretmen, sınıf, kod sürümü, test kimliği ve değiştirilemez oturum alanlarıyla eşleşir.
- Bu bilgi XP veya yetki vermez; her çağrı kimliği/kod sürümünü ve güncel test belgesini sunucudan doğrular. XP/haftalık/toplam gibi değişebilir sayaçlar bu bellekte saklanmaz. Yeniden açmada DTO'nun güncel makbuz sorgusu korunur.
- Yarım kalmış veya kayıp commit yanıtlı işlem olumlu bilgi oluşturmaz. Süre dolunca veya süreç yeniden açılınca makbuzlar tekrar doğrulanır; eksik XP transaction'larla tamamlanır. Makbuzun zaten var olması ikinci XP'yi engeller.
- Canlı düello için settlement önbelleği yoktur; güncel DTO okumaları korunur. Eksik eski sonuç kapsamı sayaçlarla uyuşmuyorsa DTO mevcut sorgularını kullanır; geçmiş XP makbuzları daraltılmış görünümle eksiltilmez.

## Önce/sonra ölçümler

Aşağıdaki okumalar SDK'de gözlenen belge okumalarıdır; boş sorgu minimumu ve bulunamayan belge bir okuma olarak sayılır. Saat yardımcısı dahildir. Güvenlik kurallarının bağımlılık okumaları, indeks faturası ve görünmeyen ağ tekrarları dahil değildir; kesin faturalanmış okuma sayısı değildir.

| Senaryo | Okuma önce/sonra | Başarılı yazma önce/sonra | Transaction çağrısı önce/sonra |
|---|---:|---:|---:|
|Normal doğru|12 / 12|5 / 5|1 / 1|
|Yanlış|12 / 12|5 / 5|1 / 1|
|Boş|12 / 12|5 / 5|1 / 1|
|Aynı cevabı tekrar gönderme|11 / 11|0 / 0|1 / 1|
|Son cevap, 8 yeni XP|67 / 58|38 / 38|9 / 9|
|Sonuçları kısa sürede yeniden açma|31 / 11|0 / 0|0 / 0|
|Tamamlanmış testte finishTest tekrarı|39 / 11|0 / 0|0 / 0|
|60 saniyelik bilgi süresi dolduktan sonra açma|31 / 21|0 / 0|0 / 0|
|Settlement/sonuç belleği boşken açma|41 / 21|0 / 0|0 / 0|
|Commit yanıtının kaybolduğu son cevap|28 / 28|10 / 10|2 / 2|
|Yarım XP settlement kurtarma|73 / 51|37 / 37|9 / 9|
|İki sekme, aynı soru — daha önce XP kazanılmış retake|30 / 30|4 / 4|2 / 2|
|İki sekme, farklı sorular — retake|31 / 31|8 / 8|3 / 3|
|İki sekme, bitmiş retake'i yeniden bitirme|64 / 27|0 / 0|0 / 0|
|İki sekme, yeni XP'li aynı son cevap|137 / 105|46 / 46|12 / 12|
|On gönderilmemiş cevabı boş bitirme|116 / 104|50 / 50|10 / 10|
|Eksik eski sonuç kapsamı, mevcut XP korunması|38 / 36|0 / 0|0 / 0|

Son odak koşusunda transaction callback denemeleri çağrı sayılarına eşitti; SDK transaction retry sayısı bütün satırlarda 0'dı. İki farklı soru için iki istekte üç transaction çağrısı görülmesi uygulama tekrarını gösterir. Başarısız istemci işlemleri gerektiğinde tekrar gönderildi ve son sayaç/makbuz tutarlılığı kontrol edildi. Eşzamanlı çağrıların sayıları zamanlamaya göre değişebilir; bu sayılar sabit kota garantisi değildir.

Soğuk satırda settlement/sonuç modülü yeniden oluşturuldu; ortak değiştirilemez şablon yardımcısının önbelleği hazırlanmıştı. Tam tarayıcı/PWA soğuk açılışında şablon erişimi ve diğer ekran okumaları ayrıca oluşabilir. Saat yardımcısının kapsamı son cevap, kesinti/kurtarma ve yeni XP yarışı satırlarında 1 okuma/1 yazmadır; ölçüm dosyasında ayrı alanlarla kayıtlıdır.

Mevcut `Quiz.tsx` akışındaki son cevap + Sonuçları gör/finishTest için bu fixture'da toplam 106 → 69 SDK okuması (%34,9) oluşur. Bu yalnız bu iki işlemin karşılaştırmasıdır; ilk dokuz cevap, test başlangıcı, davranış kaydı, listener/Rules maliyetleri ve günlük uygulama toplamı değildir. Günlük 44.000 tüketimin kaç okumaya ineceği bu yerel fixture'dan çıkarılamaz.

## Güvenlik ve doğrulama

- Son uygulama kaynağıyla geniş standart Spark emulator paketi: **48/48 geçti**. Önceki 1. aşama dinleyici/sayfalama, telefon/masaüstü, canlı düello, auth/kod yenileme, sınıf taşıma, öğretmen üyeliği, XP ve rapor regresyonları dahil.
- Saklanan canlı Rules'un yalnız demo emulator'da yüklenen kopyasıyla son kapsamlı settlement ölçüm testi: **1/1 geçti**. Tek test içinde tablodaki senaryolar ayrı ayrı ölçüldü.
- Commit sonrasında bağlantı yanıtının kaybolması simüle edildi. On doğru sorudan bir XP makbuzu yazılmışken kurtarma kalan dokuzunu tamamladı; sonunda tam 10 makbuz/10 akademik XP oluştu.
- İki bağımsız Firestore client'ı aynı Firebase UID ile eşzamanlı çalıştırıldı. Yeni XP yarışında 10 makbuz ve 10 akademik XP korundu; öğretmenin verdiği 3 XP ayrı tutuldu, totalXP 13 oldu.
- Aynı cevabın değiştirilmesi/yeniden XP üretmesi, yabancı erişim, kod yenileme sonrası eski oturum, sınıf taşıma ve mevcut haftalık sıralama kontrolleri geçti. Transaction read/write kontrolleri kaldırılmadı.
- Eksik eski veri fixture'ı yalnız izole emulator'da oluşturuldu: bir sonuç kaydı eksiltilmesine rağmen mevcut sekiz XP makbuzu ve toplam XP korundu, yeni yazma oluşmadı. Canlı kayıt silinmedi/taranmadı.
- TypeScript, diff whitespace kontrolü ve GitHub Pages `/test-arena/` tabanlı yerel üretim derlemesi başarılı; 144 public paket üretildi. Mevcut büyük PDF/font chunk uyarısı derlemeyi engellemiyor.

## Değişen dosyalar — bu aşama

- src/data/spark.mjs: işlem içi veri paylaşımı, olumlu settlement bilgisi ve güvenli fallback.
- tests/settlement-stage2-cases.mjs: yeni önce/sonra, kesinti, iki sekme, süre dolması, XP ayrımı ve eski kapsam testleri.
- tests/phase12-measured-module.mjs: saat yardımcı ölçümü; transaction çağrı/deneme/SDK retry alanları. Yalnız test enstrümantasyonu.
- tests/spark.test.mjs: yeni test kaydı.
- tests/run-listener-stage1.mjs: settlement odak koşusu ve log seçeneği.
- docs/firestore-settlement-stage2-local-20261013.md: bu rapor.

Önceki kaynak kopyası artifacts/settlement-stage2-before.mjs. Ham sonuçlar artifacts/settlement-stage2-measurements.json; geniş log settlement-stage2-full-test.log, odak log settlement-stage2-test.log. Yardımcı ölçüm modülleri yalnız artifacts altında oluşturulur ve uygulama derlemesine dahil değildir.

## Sınırlar ve kalan riskler

Canlı Firebase/Rules/indeks/GitHub Pages üzerinde işlem yok. UID/Auth, kısa kodlar, sınıf yetkileri, XP kuralı, hafta hesabı, PWA kimliği ve URL değiştirilmedi. Yerel Rules ve indeks dosyaları 1. aşama sonundaki halleriyle korundu; 2. aşama için yeni indeks gerekmiyor. VITE_NATIVE_PERFORMANCE etkinleştirilmedi. Commit/push yapılmadı.

48 test standard emulator kurallarıyla; odak test saklanan canlı kopyayla çalıştı. Canlı kuralların bugünkü durumu veya canlı eski kayıtların bütün şema çeşitleri bu görevde yeniden taranmadı. Faturalandırılmış günlük tasarruf ve gerçek ağ kopması süreleri ölçülmedi; kesintiler kontrollü SDK hata enjeksiyonuyla test edildi.

60 saniyelik olumlu bilgi mevcut Rules'un sonuç/XP makbuzlarını değiştirilemez tutmasına dayanır. Admin SDK ile bu belgeleri değiştirecek ayrı bir bakım/migrasyon planlanırsa önbelleğin geçersizleştirilmesi ayrıca değerlendirilmelidir. Bellek kapanırsa, kimlik/kod/sınıf veya oturum alanları değişirse bu bilginin XP verme yetkisi yoktur; gerekli işlem yeniden doğrulanır. Canlı düello bu önbelleği kullanmaz.

3. aşamaya geçilmedi. Sonraki çalışma ve yayın için kullanıcı onayı bekleniyor.
