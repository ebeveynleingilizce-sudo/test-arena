# Açılış ekranı viewport düzeltmesi

## Neden ve kapsam

`index.html` gerçek kök olarak `#root` kullanıyor; `#app` yok. `html`, `body` ve `#root` üzerinde sabit yükseklik veya `height:100%` zinciri bulunmuyor. Ana sayfa `.landing` ve başlangıç ekranı `.loading` yalnızca `min-height:100svh` kullanıyordu. Bu birim desteklenmediğinde bildirim geçersiz oluyor ve koyu yüzey içerik yüksekliğiyle sınırlı kalıyor. Belgenin açık arka planı aşağıda görünür hale geliyor.

Modern viewport birimleri Chromium 108 ile desteklenmeye başladı: https://developer.chrome.com/blog/new-in-chrome-108 . Aynı model tahtalarda farklı Chromium/Pardus sürümü bu davranışı açıklayabilir. Tahtalara erişilmediğinden gerçek cihaz nedeni kesin olarak doğrulanmadı. Yakınlaştırma ve işletim sistemi ölçeklendirmesi CSS viewport boyutunu değiştirerek içerik yüksekliği ile pencere yüksekliği arasındaki farkı artırabilir; birim desteği kaybını çözmez.

Yalnızca `.landing` ve `.loading` için yükseklik sırası değiştirildi:

```css
min-height: 100vh;
min-height: 100dvh;
```

Eski tarayıcı ilk değeri kullanır. Modern tarayıcı görünür viewport değişikliklerini ikinci değerle izler. Minimum yükseklik, uzun içerikte doğal kaydırmayı korur. Renk, buton, içerik, breakpoint ve arka plan kuralları değiştirilmedi. Yeni sabit piksel yüksekliği veya overflow gizleme kuralı eklenmedi. Diğer ekranların yükseklik kuralları bu görevde değiştirilmedi.

## Yerel doğrulama

`node tests/landing-viewport.browser.mjs` çalışan yerel uygulamayı Chromium 153 üzerinde test eder. Eski tarayıcı senaryosu, modern viewport yükseklik bildirimlerini CSS yanıtından kaldırarak simüle edilir; gerçek eski Chromium/Pardus çalıştırılmaz.

- 360×800, 390×844, 768×1024, 1024×768, 1366×768, 1920×1080, 3840×2160, 2560×1440, 1280×720, 1920×1800 ve 1920×600.
- Cihaz piksel oranı: 1, 1.5, 2 ve 3. Bunlar ölçek simülasyonudur; gerçek işletim sistemi ölçeklendirmesi veya tarayıcının yakınlaştırma menüsü kullanılmadı. 1280×720, 1920×1080 ekranın %150 yakınlaştırmadaki yaklaşık CSS alanını da temsil eder.
- Her boyutta modern destek ve destek yokluğu: 22 senaryo.
- Aynı açık sayfada viewport yüksekliği ayrıca 300 piksel artırılır.
- Açılış ve yükleme yüzeyi, yatay taşma, öğrenci/öğretmen girişine geçiş, console error ve pageerror kontrol edilir.
- Telefon ve masaüstü ekran görüntüleri görsel olarak incelendi.

Düzeltme öncesi destek yokluğu simülasyonunda 6 boyutta açık alt alan üretildi. 1920×1080 için koyu alan 769.66 pikselde, 3840×2160 için yine 769.66 pikselde bitti. Düzeltme sonrası tüm 22 senaryo geçti; açık alt alan, yatay taşma ve konsol hatası yok.

`npm run build` başarılı. Mevcut `tests/pwa.test.mjs` ve `tests/firebase-environment.test.mjs` testlerinin tamamı geçti (10/10). Firebase emülatörü gerektiren tüm ürün test paketi çalıştırılmadı.

Ölçümler ve ekran görüntüleri yerelde `artifacts/landing-viewport/` altında bulunur. Canlı dağıtım, commit, push veya branch oluşturma yapılmadı.
