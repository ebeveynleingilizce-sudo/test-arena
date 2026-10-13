# Test Arena — 3. aşama, yalnız düşük riskli yerel optimizasyonlar

13 Ekim 2026. Karşılaştırma tabanı, önceki 1. ve 2. aşamaların yerel kaynaklarıdır; canlı sürüm değildir. Canlı Firebase verisi, Rules, indeks, GitHub Pages, PWA kimliği, Authentication veya kısa kodlar değiştirilmedi. Commit/push/yayın yok. Native performans etkinleştirilmedi; Cloudflare ve XP transaction yeniden tasarımı yapılmadı.

## Yapılan değişiklikler

1. **Davranış kayıtları:** Her üç normal cevapta veya bekleyen checkpoint'ten 30 saniye sonra kümülatif snapshot gönderilir. Sonlandırma, görünürlük değişimi, pagehide ve unmount bekleyen veriyi flush eder. Başarıyla kaydedilmiş aynı snapshot tekrar yazılmaz. Başarısız kayıt başarıyla kaydedilmiş sayılmaz ve sonraki flush yeniden dener. Seçim değişikliği bulunan cevapta checkpoint hemen gönderilir; Devam akışında en fazla 750 ms beklenir. Böylece hızlı ekran geçişinde son seçim değişikliğinin kaybolması regresyonu giderildi. Bu bekleme cevap/XP transaction'ını değiştirmez; davranış kaydı başarısızlığı cevap sonucunu geri almaz.
2. **Sıralama paylaşımı:** Tek seferlik ana ekran/profil/düello sıralamaları süreç belleğinde 30 saniye paylaşılır. Anahtar UID, öğretmen, sınıf, credentialVersion, kademe ve haftayı içerir. Ekran açılışında prepareArena kimlik ve saat kontrolleri korunur. Canlı Arena aboneliği devam eder; yalnız sunucu tarafından doğrulanmış, pending-write olmayan satırlar paylaşılır. Cevap, finishTest ve getTestSession işlemlerinin başında/sonunda önbellek geçersizleşir. Geçersizleştirme sırasında uçuşta olan eski istek önbelleği yeniden dolduramaz. Dönen satırlar kopyalanır; bir ekran başka ekranın verisini değiştiremez.
3. **Katalog paylaşımı:** Kimlik ve sınıf belgesi her çağrıda taze okunur. Yalnız katalog içeriği 60 saniye paylaşılır; anahtar UID/öğrenci/kod sürümü/kademe, izin verilen kademeler ve taze sınıf verisini içerir. Sınıf değişince içerik yeniden okunur. Test başlatma, seçim ekranında yeni okunmuş içeriği yeniden kullanır. Açık Yenile işlemi önbelleği atlar. Rules'un test oluşturma/erişim kontrolleri korunur.
4. **Geçmiş:** Sınıf yönetimindeki etkinlik ve audit kayıtları kapalıyken sorgulanmaz. Açılınca ilk 50 kayıt için 51 belgeli canlı sayfa, devamında isteğe bağlı 51 belgeli sorgular kullanılır. Tam snapshot cursor eşit sıralama değerlerinde atlamayı önler. Etkinlikler belge kimliği artan sırada tutulur; eski updatedAt alanı bulunmayan kayıtlar da erişilebilir ve yeni indeks gerekmez. Audit tarih sıralaması korunur. Eski etkinlik sayfasındaki başarılı düzenleme satıra uygulanır; bütün geçmiş yeniden okunmaz. Mevcut öğrenci test geçmişinin yalnız ilgili sekmede yüklenen sayfalı akışı korunur.

## Ölçüm kapsamı

Ham dosya: `artifacts/stage3-economy-measurements.json`. SDK belge okumaları/başarılı belge yazmaları ve listener yaşam döngüleri ölçülür. Son odak ölçümde saat, davranış ve soğuk şablon fallback yardımcıları da instrument edilir. Boş sorgu minimumu ve bulunamayan belge bir okuma olarak sayılır. Rules bağımlılıkları, indeks faturası, gerçek bağlantı yeniden açılışları veya gözlenmeyen SDK/ağ tekrarları kesin faturalanabilir toplam olarak bu sayılara eklenmez.

| Ayrı senaryo | Önce okuma | Sonra okuma | Önce yazma | Sonra yazma |
|---|---:|---:|---:|---:|
| Hızlı 10 soru: 10 checkpoint + bitiş/sonuç/kapanış, değişmeyen son snapshot'lar | 39 | 12 | 13 | 4 |
| 25 kişilik sıralama, üç yükleme; hazırlık/saat dahil | 84 | 34 | 3 | 3 |
| Tek izinli kademe, sıcak katalog çağrısı | 4 | 3 | 0 | 0 |
| Tek izinli kademe, katalog sonrası test başlatma; emulator soğuk şablon fallback dahil | 7 | 6 | 1 | 1 |
| 65 etkinlik + 65 audit: ekran açılışı, geçmişler kapalı | 116 | 0 | 0 | 0 |

Soğuk/süresi dolmuş/zorla yenilenen tek-kademe katalog çağrısı iki tarafta da 4 okumadır. Statik paketin bulunduğu üretim senaryosunda test başlatma satırındaki ortak şablon fallback okuması yoktur; modül maliyeti 6 → 5 olur. İki izinli kademede katalog isabeti iki katalog belgesini azaltır; bu iki-kademe farkı koddan türetilmiştir, tek-kademe fixture ölçümü değildir.

Sıralama satırında belge sorguları 75 → 25; üç prepareArena çağrısı ayrıca iki tarafta da 9 okuma/3 clockSamples yazmasıdır. Dolayısıyla yalnız belge sorgusu tasarrufu 50, toplam senaryo 84 → 34'tür. XP ve liderlik belgelerine ilave yazma eklenmez.

Geçmişte iki ilk sayfa açılınca 102 belge gelir. İki devam sorgusu toplam 30 belge döndürür; 65 etkinlik ve 65 audit kaydının tamamı tekrarsız görünür. Toplam sorgu belgesi 132'dir; lookahead belgeleri nedeniyle tam geçmişi okumak ücretsiz olmaz. Asıl tasarruf açılmayan geçmiş ve gereksiz canlı geçmiş aboneliğidir. Eski satır düzenlemesinin mevcut etkinlik/audit iş yazmaları ayrı senaryodur, sorgu tablosunun 0 yazmasına dahil değildir.

## Güvenlik ve testler

- Standart Spark emulator ve telefon/masaüstü regresyon paketi: **51/51 geçti**. Log `artifacts/stage3-full-test.log`.
- Son odak ölçüm, saklanan canlı Rules kopyasıyla yalnız `demo-test-arena-spark-prototype` emulator projesinde çalıştırılır; sonuç aşağıdaki son doğrulama bölümünde kaydedilir.
- Doğru/yanlış/boş cevap, tekrarlanan cevap, aynı sorudan tekrar XP engeli, iki sekme, yarım settlement kurtarma ve öğretmen XP/academic XP ayrımı önceki testlerle doğrulandı.
- Kod yenileme sonrası eski oturum ve sıcak katalog erişimi reddedildi. Yeniden girişte katalog yeniden okundu. Sınıf güncellemesi ve TTL/manuel yenileme kontrol edildi.
- Yabancı öğretmenin sıralama/etkinlik erişimi reddedildi; davetli öğretmen etkinlikleri okuyabildi, yetkisi kaldırılınca erişim reddedildi.
- Davranış timer flush, değişmeyen snapshot atlama, hata sonrası retry ve final kümülatif süreler kontrol edildi. Gerçek tarayıcıda seçim değişiklikleri ve görünürlük süreleri korundu.
- 360 ve 1366 pikselde yeni geçmiş akışı geçti; kapsam içinde 2 listener açıldı/2 kapandı, kapanınca aktif listener kalmadı. Console error ve yatay overflow görülmedi. Görseller `test-results/stage3/history-360.png`, `history-1366.png`.
- `submit`, `grade`, `award`, `settle`, `answer` fonksiyonları bu aşama öncesi kaynakla aynı kaldı; değişiklikler katalog ve API çevresindeki sıralama önbelleği temizliğidir.
- İlk test denemelerinde sandbox localhost/realpath engeli, emulator'un descending key scan kısıtı, eski audit testinin otomatik açılma beklentisi ve davranış kaydı regresyonu görüldü. Yerel altyapı/akış/test beklentileri düzeltildi; son 51 testte başarısız kontrol kalmadı.

## Günlük tahmin — gerçek ölçüm değildir

Önceki analizle karşılaştırılabilir varsayımlar: 25 kişilik sınıf, öğrenci başına tek giriş, günde beş farklı 10 soruluk test, her testte sekiz yeni doğru/iki yanlış, iki izinli kademe, statik paketlerin bulunması, seçim ekranından test başlatmaya 60 saniyeden az süre, hızlı testlerde dört davranış yazması, 30 dakika görünür uygulama, yaklaşık 72 normal presence heartbeat yazması. Sonuç ekranı testten hemen sonra açılır. Teacher analizleri, ek profil/düello/Arena ziyaretleri, Rules/index okumaları, reconnect ve retry dahil değildir.

Önceki iki aşamadan sonra temel bütçe kişi başına 1.191 okuma/559 yazma idi. Bu aşama normal hızlı testlerde 5 × 27 = 135 davranış okuması, 5 × 9 = 45 davranış yazması ve 5 × 2 = 10 katalog okuması azaltır. Yeni temel bütçe **1.046 okuma/514 yazma**. Sıralama ve kapalı öğretmen geçmişi tasarrufu bu temel senaryoya ayrıca eklenmemiştir.

| Aktif öğrenci | Önce okuma | Sonra okuma | Önce yazma | Sonra yazma |
|---:|---:|---:|---:|---:|
|100|119.100|104.600|55.900|51.400|
|500|595.500|523.000|279.500|257.000|
|1.000|1.191.000|1.046.000|559.000|514.000|

Bu modelde okuma yaklaşık %12,2, yazma %8,1 azalır. Gerçek günlük 44.000 sayısının aynı oranda azalacağı söylenemez. Testler uzarsa, seçimler değiştirilirse veya visibility/pagehide olayları artarsa daha çok davranış checkpoint'i oluşur. Katalog TTL'si test başlatmadan önce dolarsa katalog tasarrufu da düşer.

Günde yalnız bir 10 soruluk hızlı test için aynı giriş/ana ekran varsayımıyla kişi başına yaklaşık 267 → 238 doğrudan okuma; 100 öğrencide yaklaşık 23.800 okuma olur. Ek Rules ve öğretmen maliyetleri hariçtir. Bu bir kapasite garantisi değildir.

Bu dört düşük riskli değişiklik, 100–1.000 öğrencinin her gün 50 soru çözdüğü modeli Spark'ın 50.000 okuma/20.000 yazma sınırına sığdırmaz. Tablolar kota engeli olmasaydı oluşabilecek işlem talebidir; Spark'ta bu hacmin tamamının başarıyla servis edileceği veya ücret oluşacağı iddiası değildir.

## Sınırlar

- Canlı faturalanabilir tasarruf ölçülmedi; yayın yapılmadı.
- Sıralama tek-seferlik ekran geçişinde 30 saniyeye kadar eski olabilir; açık Arena canlı kalır. Kendi cevap/settlement işlemleri önbelleği temizler.
- Katalog değişiklikleri en çok 60 saniyelik içerik paylaşımıyla görülebilir; manuel Yenile bypass eder. Kimlik/sınıf yetkisi önbelleğe alınmaz.
- Davranış kaydı hâlâ best-effort'tür. Cihazın zorla kapanması veya ağ kesintisinde son bekleyen davranış süresi kaybolabilir; cevaplar, test sonuçları ve XP bu kuyruğa bağlı değildir. Değiştirilmiş seçimli cevapta ek bekleme 750 ms ile sınırlıdır.
- Tarihsel etkinlik sayfaları canlı değildir. Kendi başarılı düzenlemesi yerel satırı günceller; başka öğretmenin eski sayfadaki düzenlemesini görmek için kapat/aç veya yeniden yükleme gerekir. İlk sayfa canlıdır.
- Bugünkü canlı Rules veya veri çeşitleri yeniden taranmadı; odak test 12 Ekim'de saklanan Rules kopyasını kullanır.

## Bu aşamada değişen dosyalar

Uygulama: `src/data/behavior-checkpoints.mjs`, `.d.mts`; `src/data/arena-row-cache.mjs`, `.d.mts`; `src/data/spark.mjs`; `src/data/read-measurement.d.mts`; `src/app/useArena.ts`; `src/app/usePagedCollection.ts`; `src/features/useQuizBehavior.ts`; `src/features/Quiz.tsx`; `src/features/ClassSharing.tsx`; `src/features/Teacher.tsx` (yalnız sınıf kapsamı için key).

Testler: `tests/stage3-economy-cases.mjs`; `tests/phase12-measured-module.mjs`; `tests/spark.test.mjs`; `tests/run-listener-stage1.mjs`; `tests/read-economy-cases.mjs` (tarayıcı yükleme beklemesi); `tests/teacher-query-economy-cases.mjs` (isteğe bağlı audit açılışı). Rapor: bu dosya. Çalışma alanındaki diğer önceden mevcut değişiklikler bu aşamanın değişiklikleri değildir.

Önceki kaynaklar `artifacts/stage3-*-before.*` altında saklandı. Rules SHA256 `68DA20335AB1E82212B8409671FB5F974F8851C18D04B56743A053A2F6932703`; indeks SHA256 `FF965B8CC46F33776F4A771FC51F17E14E2E6B6E2E6476F2C3C1D5266AF802F4` bu aşama boyunca değişmedi. Manifest ve GitHub Pages workflow değişmedi.

## Son doğrulama

- Saklanan canlı Rules kopyasıyla son odak koşusu: **3/3 geçti**. Log `artifacts/stage3-economy-test.log`. Şablon fallback ölçümü dahil son ham sonuçlar tablodaki 7 → 6 test başlatma maliyetini doğruladı.
- Son TypeScript kontrolü ve `/test-arena/` tabanlı Vite üretim derlemesi geçti. Yerel `index-BmGw25Xd.js` oluşturuldu; 144 statik soru paketi üretildi. Bu bir canlı yayın değildir.
- Mevcut PDF/font chunk boyutu uyarısı devam ediyor; derleme hatası değildir. Canlı okuma faturası ve gerçek cihazın zorla kapanma garantisi doğrulanmadı.
- Rules/indeks hash'leri, manifest ve Pages workflow kontrolü geçti. Başarısız kalan yerel test yok. Sonraki aşama veya yayın için ayrıca kullanıcı onayı gerekir.
