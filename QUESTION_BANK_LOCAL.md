# Yerel soru bankası yönetimi

## Paket içindeki görseller

Bir bankayı `data/questions/paket/questions.json`, görsellerini aynı pakette `images/q001.webp` olarak saklayabilirsiniz. Görsel alanı `{"type":"image","src":"images/q001.webp","alt":"Okunabilir görsel açıklaması"}` biçimindedir. PNG, JPG, JPEG ve WebP desteklenir; alt zorunludur. URL, absolute path, `..`, sembolik bağlantı ve 10 MB üzerindeki dosyalar reddedilir. Importer dosyanın varlığını ve raster imzasını doğrular. Yalnız görsel baytlarını içerik özetiyle `public/assets/question-images/` içine kopyalar; banka JSON'u ve cevap verileri public alana taşınmaz. Görseller geçmiş testleri bozmamak için otomatik silinmez. Aynı ID ile görsel değişimi de mevcut içerik değişikliği güvenliğine tabidir; yeni ID kullanın.

`data/questions/` local hazır soru bankalarının tek kaynağıdır. JSON dosyalarını bu klasöre veya alt klasörlerine koyun; kaldırmak istediğiniz bankayı klasörden kaldırın.

PC açıldıktan sonra `start-dev.bat` bir kez çalıştırılır. Gün içinde `demo.ogretmen@testarena.local` hesabıyla öğretmen ana panelinden **Admin Araçları → Soru Bankasını Güncelle** kullanılır. Ekleme/silme için servisleri yeniden başlatmak gerekmez. Sonuç ekranındaki **Tamam** paneli yeniler; öğrenci seçim ekranı yeniden açıldığında veya sekmeye dönüldüğünde katalog yeniden alınır.

- Startup ve admin endpoint aynı `scripts/import-question-folder.mjs` motorunu çağırır.
- Geçersiz/okunamayan dosya, tarama sırasında değişen kaynak veya aynı ID ile değişmiş içerik varsa silme aşaması durur.
- `MANIFEST.json` ve `SCHEMA.json` banka olarak değerlendirilmez.
- Aynı ID ile içerik değiştirilemez. Değişen soru için yeni ID gerekir; bu kural silinip tekrar eklenen ID için de korunur.
- `.firebase/question-bank-sync/managed.json` yönetilen ID'lerin içerik özetlerini saklar. Bu dosyayı silmeyin: yalnız kanıtlanmış yönetilen kayıtlar temizlenebilir. Silinmiş ID özetleri geçmiş bütünlüğünü korumak için kalır.
- Registry öncesindeki mevcut kayıtlar, yalnız geçerli bir banka ile soru ve private answer içeriği birebir eşleşiyorsa yönetim kapsamına alınır. Sahipliği kanıtlanamayan kayıtlar kör biçimde silinmez.
- Public question ve private answer ayrımı korunur; cevap içeren JSON dosyaları Vite üzerinden servis edilmez.
- Backend yalnız `demo-test-arena`, `127.0.0.1:8080`, Functions Emulator ve server-side doğrulanmış admin hesabı ile çalışır. İstemciden klasör/path kabul etmez.
- Sync mevcut curricula, kullanıcılar, sınıflar, XP veya test geçmişini değiştirmez. Yeni bir kademenin kanonik ve UI dosyaları tanımlanmışsa eksik `curricula/{grade}` kaydını bir kez oluşturur. `stop-dev.bat` mevcut Auth/Firestore export'unu kaydeder.
- Gemini/API key gerekli değildir. Production yönetimi bu özelliğin kapsamında değildir.

## Standart hazır banka ve müfredat bağlantısı

`data/soru-bankasi/SCHEMA.json` importer sözleşmesidir. Yeni bankada `grade`, `subjectId`, `unitId` ve `questions` bulunur. Soruda `id`, `type`, `difficulty`, `question`, `options`, `correctOptionId` zorunludur. `explanation` eksik veya boş olabilir; private answer'a boş metin olarak aktarılır.

`unitId`, `topicId`, `skillId`, `outcomeCode`, `outcomeId` banka seviyesinden miras alınabilir. Banka ve soru aynı alanı farklı verirse reddedilir. Eski bankalar üniteyi yalnız soru seviyesinde veya `bank.unit.id` içinde vermeye devam edebilir.

Temel bağlantı kanonik **grade → subject → unit/theme** üçlüsüdür. Konu/beceri/kazanım zorunlu değildir. Verilirse kanonik üyeliği doğrulanır; yanlış veya boş explicit eşleme reddedilir. Ünite ID'sini `topicId` olarak tekrar yazmayın. Question ID hiçbir zaman kazanım/beceri ID'sine dönüştürülmez. DTO'daki eski `topic` alanının ünite ID'siyle gruplanması kanonik beceri iddiası değildir.

Yeni bir sınıf/ders/ünite için aynı sözleşmede `data/mufredat/{grade}-sinif.json` ve `{grade}-sinif-ui-v2.json` tanımlanır. `scripts/canonical-scope.mjs` kanonik `units/themes`, `topics/subthemes/skill_domains` ve explicit kazanımları çözer. Ders adına göre importer kodu eklenmez. Öğrencinin ünite/konu akışını UI dosyasındaki mevcut navigationModel belirler; importer eksik konu veya kazanım ilişkisi üretmez.
