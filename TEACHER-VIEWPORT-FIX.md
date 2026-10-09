# Öğretmen girişinden sonra viewport incelemesi

## Kodda doğrulanan neden

`index.html` aynı viewport metası ve `#root` ile tüm rolleri açıyor. `html`, `body`, `#root` için sabit yükseklik / yüzde yükseklik zinciri yok. `body` sıfır margin kullanıyor. Girişten sonra JavaScript ile ölçülüp saklanan pencere yüksekliği veya resize hesabı yok; React route değişimi öğretmen kapsayıcısını bağlıyor.

Açılış `.landing` ve `.loading` için `100vh` → `100dvh` desteği mevcutken `.dashboard` yalnız `min-height:100svh`, masaüstü `.sidebar` yalnız `height:100svh` kullanıyordu. Öğretmen girişinin `.auth-layout` ve `.auth-story` kapsayıcılarında da aynı destek boşluğu vardı. Modern birim geçersiz sayıldığında grid ve sidebar içerik boyuna düşüyor; ekranın kalan kısmı belgenin krem yüzeyi oluyor. Modern viewport birimleri Chromium 108 ile geldi: https://developer.chrome.com/blog/chrome-108-beta . Bu nedenle aynı modeldeki farklı tarayıcı sürümleri farklı sonuç verebilir. Gerçek Pardus cihazına erişilmedi; cihazdaki neden henüz kesinleştirilmiş değildir.

`tests/teacher-viewport.test.mjs`, gerçek AuthLayout ve Teacher bileşenlerini sunucu tarafında render eder; Firebase ve ilgisiz alt bileşenler fixture ile değiştirilir. Modern birimleri CSS'ten çıkararak eski tarayıcıdaki reddedilme davranışı simüle edilir. Düzeltme öncesi 18 durumun 8'inde panel viewport yüksekliğini karşılamadı; düzeltmeden sonra 18/18 geçti. Bu test gerçek eski Chromium çalıştırmaz.

## Düzeltme ve kapsam

`src/ui/teacher-viewport.css` yalnız öğretmen paneline ve TeacherLogin'in yeni `teacher-auth` sınıfına uygulanır. Minimum yükseklik için `100vh` uyumluluk değeri, ardından modern tarayıcıda canlı viewport'u izleyen `100dvh` kullanılır. Masaüstü sidebar aynı sırayı kullanır ve kısa pencerelerde kendi içinde kaydırılır. Uzun ana içerik doğal belge kaydırmasını korur. Sabit JS piksel yüksekliği veya belge overflow gizleme eklenmedi. Grid sütunları, maksimum içerik genişliği ve breakpoint'ler korundu. Öğrenci ekranı, Firebase, authentication, veri modeli ve rules bu düzeltmede değiştirilmedi.

## PWA, ölçek ve önbellek

Manifest standalone kullanıyor; bu moda özel öğretmen yükseklik hesabı yok. Tarayıcı yakınlaştırması ve işletim sistemi ölçeklendirmesi CSS viewport boyutlarını değiştirir; piksel ekran çözünürlüğünden yükseklik hesaplanmıyor. Testlerde 360–3840 piksel genişlik, 420–2160 piksel yükseklik, DPR 1/1.5/2/3, aynı belge içinde büyütme/küçültme ve uzun içerik kontrol edildi. DPR ve farklı CSS boyutları gerçek OS ölçek/zoom menüsünün birebir testi değildir. Gerçek standalone Pardus pencere testi yapılmadı.

Worker HTML navigasyonunu network-first, hash içeren CSS/JS adreslerini cache-first kullanıyor. Vite yeni CSS içeriğine yeni dosya adı üretir; worker sürümü build index içeriğinden de türetilir. Aktivasyon eski Arena cache'lerini siler; kayıt `updateViaCache:none` kullanır ve uygulama yeniden görünür olduğunda update kontrolü yapar. Bekleyen güncelleme kullanıcıya “Yeni sürüme geç” ile sunulur. Eski açık uygulama güncelleme/yenilemeye kadar önceki sürümü çalıştırabilir; mevcut mekanizmada yeni CSS adresini eski dosyayla eşleyen bir hata görülmedi. Worker değiştirilmedi, oturum veya önbellek silinmedi.

## Test komutları

```powershell
node --test tests/teacher-viewport.test.mjs tests/pwa.test.mjs tests/firebase-environment.test.mjs
npm test
npm run build
npx firebase emulators:exec --config prototypes/spark/firebase.json --project demo-test-arena-spark-prototype --only auth,firestore "npx playwright test --config tests/teacher-viewport.playwright.config.ts"
```

Fixture testleri konsol/pageerror, yatay taşma, resize, sidebar yüksekliği ve uzun içerik kaydırmasını kontrol eder. Telefon ve masaüstü görüntüleri `artifacts/teacher-viewport/` altında görsel olarak incelendi. E2E testi emülatörde hazırlanmış öğretmen hesabıyla gerçek giriş, oturumdan sonra panel, resize ve reload akışını modern/legacy CSS ile kontrol eder. Test hesabı emülatörün mevcut öğretmen rolü şartına uygun hazırlanır. Mevcut Spark paketi 22/22, fixture/PWA/environment testleri 11/11 geçti. Production build başarılı. Commit, push veya canlı dağıtım yapılmadı.

Gerçek giriş E2E sonuçları: telefon ve 1920×1080 tahta boyutunda modern/legacy CSS için 4/4 geçti; console/pageerror ve yatay taşma görülmedi.

Cihazda devam eden sorun için iki tahtada Chromium sürümü, `CSS.supports('height','100svh')`, `innerWidth/innerHeight`, `document.documentElement.clientHeight`, `visualViewport.height/scale`, standalone eşleşmesi ve yüklü CSS hash'i karşılaştırılmalı. Böylece sürüm/destek ile gerçek pencere ölçümü veya eski açık sürüm ayrılabilir.
