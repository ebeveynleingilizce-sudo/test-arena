# Test Arena — Dinleyici optimizasyonu, yerel 1. aşama

13 Ekim 2026. Yalnız yerel uygulama ve test değişiklikleri yapıldı. Commit/push/yayın, canlı Firebase erişimi, veri taşıma, kayıt silme veya canlı indeks/Rules değişikliği yapılmadı. Çalışma alanında önceden bulunan değişiklikler korunmuştur.

## Uygulanan davranış

- Öğretmen öğrenci listesinde kişi başına `studentCodes` onSnapshot kaldırıldı. Kodlar beş ID içeren sunucu sorgularıyla yüklenir. Küçük sayfalar, mevcut Rules'un öğrenci bazlı yetki bağımlılıklarına uygundur; tüm kod koleksiyonunu listeleme izni açılmadı.
- Öğrenci roster dinleyicisi korunur. Yeni öğrenci veya `credentialVersion` değişince ilgili kod yeniden okunur. Yerel optimistic/pending-write olayları kod sorgusu başlatmaz; yalnız sunucunun onayladığı profil kullanılır. Kapsam değişiminde geç yanıtlar reddedilir, hata halinde kodlar temizlenir. Öğretmen veya ekranlar arasında kalıcı kod önbelleği yoktur.
- Kişisel düello canlı sorgusu yalnız pending/active durumlarını içerir. Son durumlar en fazla 20 kayıt olarak ekran ömründe tutulur. Filter removal eski belgeyi taşıdığında yalnız o maçın son durumu bir kez okunur.
- Önceden kabul edilmiş maç geçmişi kullanıcı isteğiyle 20 kayıtlık cursor sayfalarında okunur. Her sorgu bir sonraki sayfanın varlığını anlamak için en fazla 21 belge çeker. Aynı acceptedAt tarihli kayıtlar tam document snapshot cursor'u ile atlanmaz. Eski reddedilmiş/kabul edilmemiş davetler önceki sonuç geçmişi ekranında da gösterilmiyordu.
- Arena sıralaması arka planda kapatılır; görünür olduğunda yeniden açılır. Geçerli dönem bilgisi korunur; yalnız görünürlük değişimi için yeni clockSamples yazması yoktur. Yeni hafta kontrolü korunur.
- Düello ekranında isim/XP listesi tek seferlik sıralama okumasıyla hazırlanır. Canlı maç puanları/cevap aboneliği korunur. Maç dışındaki presence/busy abonelikleri arka planda kapatılır. Oturum güvenliği ve kişisel davet dinleyicileri korunur. Aktif maçın mevcut ayrılma/görünürlük kuralları değiştirilmedi.
- Yerel ölçümler roster, kişisel düello, presence/busy, cevaplar, sıralama ve kod/geçmiş sorgularının ömürlerini takip eder. Tanılama opt-in'dir; kod ve token değerleri ölçüm olaylarına yazılmaz.

## Önce/sonra ölçümleri

| Öğrenci | Eski öğretmen liste listener'ı | Yeni | İlk açılış kod belgeleri önce/sonra | Yeni kod sorguları |
|---|---:|---:|---:|---:|
|25|28|3|25 / 25|5|
|50|53|3|50 / 50|10|
|100|103|3|100 / 100|20|

Bu tablo kendi sınıfının açıldığı, ek paylaşılan sınıf metadata aboneliği olmayan öğretmen senaryosudur. Yeni sayılar gerçek arayüzde üç sınıf boyutunda doğrulandı. Eski davranış aynı emulator belgelerinde eski SDK abonelik yapısıyla ölçüldü. Kod başına ilk belge okumaları azalmadı; abonelikler, tekrar bağlantı ve Rules maliyeti potansiyeli azaldı. 100 öğrencide listener sayısı %97,1 azaldı; bu günlük okumalarda %97,1 tasarruf demek değildir.

65 eski kabul edilmiş maç + 1 bekleyen davet fixture'ında canlı ilk yükleme 66 belgeden 1 belgeye indi. Geçmiş ilk açılışta okunmaz. Bütün geçmiş dört sayfada 65 benzersiz kayda erişti; sayfa varlığı kontrolü nedeniyle toplam 68 belge döndü. Maç son durumu için 1 ek belge okundu. Çok sayıda eski maçın hepsini açmak toplam maliyeti azaltmayabilir; tasarruf geçmişe ihtiyaç yokken okumamaktan gelir.

Öğretmen arayüzünde 20 liste/yönetim/sınıflar döngüsünden ve ek erişim kontrollerinden sonra ölçülen roster listener açılış/kapanışları 43/43; kalan iki metadata listener'ı normaldir. Sınıf boyutu değişimlerinde kod dinleyicisi açılmadı.

360 ve 1366 piksel Arena/düello görünürlük testlerinin her birinde ölçülen 7 listener açılışı ve 7 kapanışı var. Arka planda maç dışı pahalı abonelikler sıfıra indi. Arena pause/resume öncesi/sonrası clockSamples sayacı 2 / 2; yeniden bağlama ek saat yazması üretmedi. Heartbeat aralığı ve mevcut oyun yazmaları değiştirilmedi. Yeni kod/geçmiş okuma fonksiyonları sıfır yazma yapar; bu aşamada yeni Firestore yazma türü veya özet belgesi eklenmedi.

Normal cevap gönderme maliyeti bu aşamada değiştirilmedi: önceki ölçümdeki 12 doğrudan okuma / 5 yazma korunuyor. Son cevap fixture'ındaki 66 okuma da bu aşamanın hedefi değildir.

Kaynaklar: artifacts/listener-stage1-code-measurements.json, listener-stage1-teacher-ui.json, listener-stage1-duel-measurements.json, listener-stage1-visibility.json, phase12-answer-measurements.json. Dönen belgeler/doğrudan SDK okumaları kesin faturalanan okumalar değildir; Rules bağımlılıkları, indeks okumaları ve SDK tekrarları ayrıca değerlendirilir.

## Testler

- Geniş standart Spark emulator paketi: 47/47 geçti. Öğrenci cevaplama, doğru/yanlış/boş/tekrar, eşzamanlı cevap, XP tekilliği, commit sonrası kurtarma, çok öğretmenli sınıf, kod yenileme, kaldırma, canlı düello ve telefon/masaüstü akışları dahil.
- Son profil-commit kontrolünü içeren dinleyici odaklı testler: 12 Ekim'de saklanan canlı Rules'un yalnız yerel kopyasıyla 3/3 geçti. Öğrenci ve anonim kod erişimi, yabancı öğretmen ve davetli öğretmen erişimi iptali reddedildi. Davetli öğretmen yeni öğrenci oluşturdu/kod yeniledi/kaldırdı; açık owner ekranı güncellendi. Owner arayüzündeki kod yenileme de doğrulandı.
- 25/50/100 öğrenci, 20 ekran döngüsü, tam geçmiş ve aynı timestamp cursor kapsamı, Arena/düello açma/kapatma ve arka plan/geri dönüş ölçüldü. Konsol/pageerror yok; 360/1366 piksel yatay overflow yok.
- TypeScript ve GitHub Pages `/test-arena/` tabanıyla Vite üretim derlemesi başarılı; 144 public soru paketi üretildi. Büyük PDF font/chunk uyarısı var; bu aşamaya ait bir derleme hatası değildir.

İlk geniş denemede canlı Rules kopyasıyla native performans verilerine erişim bekleyen mevcut analiz testleri başarısız oldu; emulator'da native dal otomatik açılırken canlı Rules bu alanı kapalı tutuyor. Rules değiştirilmedi. Geniş paket kendi standart emulator kurallarıyla, dinleyiciye özel testler canlı kopyayla ayrı doğrulandı. İlk eski düello UI testi otomatik geçmiş bekliyordu; istek üzerine geçmiş düğmesine uyarlanıp geçti. İlk listener ölçümündeki empty-query metadata olayı ve arayüz testindeki Ana bağlantı seçicisi düzeltildi.

## Dosyalar — yalnız bu aşama

- src/app/useTeacherClasses.ts
- src/data/student-code-pages.mjs ve student-code-pages.d.mts
- src/app/useArena.ts, usePageVisible.ts ve DuelLobby.tsx
- src/data/duel.mjs ve duel.d.mts
- src/data/read-measurement.d.mts
- src/features/Duel.tsx
- firestore.indexes.json: mevcut yerel tanımlara iki duels indeksi eklendi (participants array + status; participants array + acceptedAt descending).
- tests/listener-stage1-cases.mjs, listener-vite.config.mjs, run-listener-stage1.mjs ve tests/spark.test.mjs

Firebase Authentication/UID, hesaplar, giriş kodlarını üreten/değiştiren veri işlemleri, sınıf yetkileri, XP/test/cevap hesaplaması, URL, manifest, service worker ve canlı Rules bu görevde değiştirilmedi. Test verileri yalnız izole demo emulator'da oluşturuldu.

## Kalan riskler / yayın sınırı

İki yeni composite index yalnız yerel dosyada tanımlı; emulator indeks zorunluluğunu doğrulamaz. Canlı indeksler kontrol edilmeden bu sürüm yayınlanmamalı. Canlı indeks kurulumu ayrıca onay gerektirir.

Aboneliği kapatıp açmak sonuçların tekrar okunmasına yol açabilir. Çok kısa arka plan geçişlerinde günlük net okuma tasarrufu garanti edilmez. Canlı toplam 44.000 için yeni günlük yüzde veya 131 peak'in yeni değeri yerel fixture'dan çıkarılamaz.

Düello rakip isim/XP listesinin anlık güncellenmesi yerine ekran yüklemesi/görünürlük dönüşündeki snapshot kullanılır; Arena'nın görünür sıralaması canlı kalır. Devam eden maç skor/cevapları ayrı canlı aboneliklerle korunur. Çok hızlı kapsam değişimlerinde başlanmış getDocs isteği fiziksel olarak iptal edilemez; geç sonuç arayüze uygulanmaz ama okuma yapılmış olabilir.

Sonraki aşama önerisi: Bu ölçümleri değerlendirdikten sonra test tamamlanma akışındaki tekrar settlement/DTO okumalarını ayrı görevde incelemek. Bu aşamaya veya yayına kullanıcı onayı olmadan geçilmedi.
