# Özel GitHub soru deposu — yerel uygulama raporu

## Durum

14 Ekim 2026: Kullanıcının açık isteğiyle `ebeveynleingilizce-sudo/test-arena-question-bank` **private** olarak oluşturuldu. `main` dalına yükleme yönergesi, mevcut `SCHEMA.json` ve `questions/.gitkeep` eklendi. Öğrenci verisi veya erişim anahtarı yüklenmedi.

Bağlantı: https://github.com/ebeveynleingilizce-sudo/test-arena-question-bank

Uygulama değişiklikleri yereldir. Ana uygulama commit/push işlemi, Firebase Functions/Rules/index yayını ve canlı soru aktarımı yapılmadı. Depoya dosya eklemek şu anda canlı bankayı değiştirmez.

## Uygulanan akış

- Soru Bankasını Güncelle yalnız `tunc@test.com` öğretmen hesabında ve mevcut admin yetkisi doğrulanırsa görünür. Diğer hesaplarda bu bileşen yetki sorgusu da açmaz.
- Tek düğme backend callable işlemini başlatır; istemci depo adresi, yol veya anahtar gönderemez.
- Sunucu güncel Firebase kullanıcı durumunu, iptal edilmiş oturumu, öğretmen/admin rolünü ve öğrenci bağlaması bulunmadığını kontrol eder. Katalog değişiminden hemen önce yeniden yetkilendirir.
- Yapılandırılan private depo tek commit'e sabitlenir. Blob SHA doğrulanır; sadece yeni/değişmiş `questions/**/*.json` dosyaları indirilir.
- Şema ve kanonik müfredat doğrulanır. Mevcut soru ID'sinin içeriğini değiştirmek reddedilir. Soru/özel cevap çiftleri birlikte hazırlanır.
- Etkilenen kademenin kataloğu yeniden hazırlanır; yeni test şablonları ve özel cevap anahtarları atomik oluşturulur. Son katalog geçişi kilit kontrollü transaction ile yapılır.
- Eski test şablonları ve cevap anahtarları silinmez veya pasifleştirilmez. Depodan dosya silmek Firebase sorularını silmez. Yarım kalan işlem yeniden çalıştırılabilir.
- Bir tıklamada en çok 20 değişmiş dosya işlenir; kalan dosyalar arayüzde bildirilir.

## Dosyalar

- UI/istemci: `src/features/AdminQuestionBank.tsx`, `src/data/spark.mjs`, `SCREENS.md`.
- Sunucu: `functions/src/question-bank-admin.ts`, `functions/github-bank-source.mjs`, `functions/github-bank-sync.mjs` ve iki `.d.mts` tip dosyası.
- Paketleme: `scripts/build-github-bank-runtime.mjs`, `functions/package.json`, `.gitignore`, yalnız ilgili function için `firebase.github-bank-sync.json`.
- Yerel eski akış: `scripts/local-question-bank.mjs` admin kontrolü.
- Test: `tests/github-bank-sync.test.mjs`, `tests/admin-bank-sync-ui.test.mjs`; `tests/question-bank-cases.mjs` yalnız tunc düğmesi beklentisi.

Önceden bulunan diğer çalışma alanı değişiklikleri bu işlemin parçası değildir. Özellikle Rules/index ve native performance değişiklikleri yayımlanmamalıdır.

## Maliyet ve sınırlar

- Değişmeyen commit: iki yetki belgesi ve bir depo durum belgesi okuması; senkronizasyon yazması yok. Bunlar kod düzeyindeki doğrudan işlemlerdir, üretim faturası ölçümü değildir.
- Değişen commit: kaynak dosya başına durum belgesi okunur; değişen dosyalardaki soruların mevcut soru/özel cevap belgeleri kontrol edilir. Yeni soru başına iki belge oluşturulur. Test özel anahtarları, şablonları ve katalog yayın kayıtları ayrıca yazılır.
- Etkilenen kademenin mevcut yayımlanmış soru havuzu ve cevap anahtarları katalog üretimi için okunur. Bu nedenle işlem toplu admin yayınıdır; her ekran açılışında otomatik çalışmaz. Büyük bankalar için gerçek maliyet boyuta bağlıdır.
- Aynı içeriği tekrar çalıştırmak yeni soru/XP üretmez. Öğrenci XP, hesap, kod veya sonuç belgelerine yazılmaz.
- Yeni testler statik Pages paketinde henüz yoksa mevcut Firestore şablon yedeğinden açılır; statik paket yenilenene kadar ek şablon okuması olabilir.
- Ayrı PNG/JPG/WebP dosyalarının güvenli yayımlanması bu aşamada desteklenmez; bu paketler açıklayıcı hatayla reddedilir. Kontrollü JSON görselleri desteklenir.
- Şema doğrulaması akademik cevap doğruluğunu kanıtlamaz. Mevcut runtime müfredatı 2, 3, 4, 5 ve 9. kademeleri kapsar; olmayan kademe/kazanım oluşturulmaz.

## Güvenli etkinleştirme için kalan işler

1. Sadece bu depoya `Contents: Read` erişimli, süreli fine-grained GitHub token oluşturulmalı. Mevcut geniş Git oturumu sunucuya kopyalanmamalı; token sohbete/depo dosyasına yazılmamalı.
2. Token Firebase Secret Manager'da `QUESTION_BANK_GITHUB_TOKEN` olarak saklanmalı. Depo parametresinin varsayılanı yeni private depodur.
3. Ayrı yayın onayından sonra yalnız `functions:syncQuestionBank` hedefi `firebase.github-bank-sync.json` ile yayımlanmalı. Tüm functions/Rules/index yayımlanmamalı. İstemci Pages yayını da ayrıca gerekir.
4. Kontrollü küçük bir gerçek soru dosyasıyla admin yayını ve öğrenci test açma doğrulanmalı. Bu test canlı soru ekleyeceğinden mevcut yerel onayın kapsamına alınmadı.

## Doğrulama

- Functions build ve Cloud Build `gcp-build` geçti; kök TypeScript ve üretim build geçti.
- Yeni backend emülatör testleri: 5/5 geçti. Güncel/iptal/devre dışı yetki, private/pinned kaynak, blob bütünlüğü, tekrar/silme, ID çakışması, bozuk dosya, yayın öncesi kesilme kurtarma, yanıt kaybı, eşzamanlılık ve kilit devri kontrol edildi.
- UI testi: 1/1 geçti; 360 ve 1366 px, diğer öğretmende sıfır UI/sorgu, admin kontrolü, çift tıklama, sonuç ve oturum temizliği. Her iki ekran görüntüsü görsel incelendi; yatay taşma ve page error görülmedi.
- Geniş mevcut regresyon: ilk koşuda 51/52 geçti. Öğrenci tarayıcı testi Vite'ın `firebase/functions` bağımlılığını optimize edip sayfayı yeniden yüklediği koşuda `page.goto` 30 saniye zaman aşımı verdi. Hedefli tekrarda başlangıç/giriş ve katalog testleri geçti; öğrenci tarayıcı testi bu kez testin `duel.mjs` route callback'inde `Request context disposed` hatası verdi. Bu kontrol başarısızdır; tarayıcı test altyapısı ve istek takılması ayrıca incelenmelidir. Öğrenci akışının tamamı geçtiği iddia edilmez.
- Canlı GitHub → Firebase uçtan uca bağlantısı henüz doğrulanmadı: depoya özel secret ve yayın henüz yapılmadı.

Kanıtlar: `artifacts/github-bank-sync/`, `artifacts/listener-stage1-full-test.log`.
