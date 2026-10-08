# Test Arena — Spark değerlendirmesi ve tam quiz prototipi

Tarih: 8 Ekim 2026. Bu çalışma yalnız ayrı emulator projesindedir.
Canlı uygulamaya geçiş, Firebase proje oluşturma, billing, Functions deploy,
harici sunucu kurma, Gemini çağrısı veya normal havuza veri yazımı yapılmadı.

## 1. Kısa kod alternatifleri

Karşılaştırma ölçütleri: çocuğun yalnız kod girmesi; öğretmenin kodu değiştirme/
kaldırma yetkisi; özel global indeksin gizli kalması; başka öğrenciye erişememe;
eski oturumun anında veri erişimini kaybetmesi; kaba kuvvet deneme sınırı.

| Alternatif | Spark ile ilişkisi | Güvenlik/ürün değerlendirmesi | Güvenilir işlem ortamı |
|---|---|---|---|
| Kod = native Auth parola, dahili email alias | Auth üzerinde çalışıyor; önceki emulator testi mevcut | Öğrenci doğrudan Auth API ile kendi parolasını değiştirebiliyor. Firestore Rules, Auth parola/email güncellemelerini denetleyemez. Öğretmenin kod kontrolü korunmuyor. Uygulamaya alınmayacak. | Hesap oluşturma/yenileme için yönetim gerekir; bunun eklenmesi öğrenci parola değişikliğini tek başına engellemez. |
| Anonymous Auth + kod ile otomatik Firestore binding | Teknik olarak bir capability-claim tasarımı mümkün | Anonim UID kimlik doğrulaması öğrenci kimliği değildir. Kodun özel bir doküman lookup'u ile doğrulanması ayrı bir tasarım gerektirir. Rules içinde IP tabanlı mevcut HMAC/başarısız giriş sayacı korunamaz; reddedilen yazımla güvenilir deneme sayacı oluşturulamaz. Kısa kod tahmini, yeni UID ve kota tüketimi ayrıca çözülmelidir. Eşdeğer güvenlik kanıtlanmadı; uygulanmadı. | Mevcut güçlü deneme sınırı/gizli kod çözümlemesi için servis gerekir. |
| Anonymous Auth + öğretmenin her cihazı onaylaması | Auth + owner Rules ile kurulabilir | Öğrenci parola değiştirmeden teacher-approved UID binding kullanılabilir, ancak kodun tek başına giriş sağlaması kaybolur. Yeni cihazda öğretmen onayı gerekir. Ürün davranışının eşdeğeri değil; uygulanmadı. | Otomatik kod çözümlemesi kullanılmazsa sürekli servis şart değildir, öğretmen manuel onaylar. |
| Mevcut kısa kod/HMAC/version/tombstone + custom token, ayrı küçük güvenilir servis | Firebase Auth ve Firestore Spark'ta kalabilir; Firebase Functions kullanılmak zorunda değildir | Mevcut güvenlik modelini korumaya en uygun aday. Kod doğrulama, UID/session binding ve token imzalama istemciye taşınmaz. Veri erişiminde status/version + custom provider tekrar doğrulanır. | Kod çözümleme, IP limiti, token imzalama ve öğretmen yetkili kod oluşturma/yenileme/kaldırma servis içinde. |
| Öğretmen bilgisayarında aynı güvenilir servis | Firebase Spark + yerel yönetim ortamı | Bulut aboneliği gerektirmeden geliştirmeye uygundur. Uzaktan öğrenci girişi için PC'nin açık, erişilebilir ve HTTPS ile korunmuş olması gerekir. Genel canlı kullanıma hazır çözüm değildir. | Her giriş sırasında erişilebilir PC/sunucu. |

Öneri: mevcut custom-token modelini değiştirmeden, yalnız zorunlu güvenilir
işlemleri ücretsiz limitli bir harici serviste tutmayı sonraki adımda ayrı
prototiple doğrulamak. Bu görevde böyle bir servis yazılmadı veya dağıtılmadı.

Cloudflare Workers Free araştırılan bir adaydır: güncel resmi dokümanında
günde 100.000 istek ve çağrı başına 10 ms CPU sınırı var. Secret binding desteği
bulunuyor. Bu, Firebase Admin SDK'nın bütün API'lerinin doğrudan uyumlu olduğunu,
imzalama/IP limiti işlemlerinin bu CPU sınırına sığdığını veya kesintisiz ücretsiz
hizmet garantisini kanıtlamaz. Runtime uyumluluğu, token imzalama, Firestore REST/
Admin erişimi, secret/IAM kapsamı, App Check ve kötüye kullanım testleri gerekir.
Hiçbir Cloudflare hesabı/servisi/ücretli kaynak etkinleştirilmedi.

Custom-token servisinde korunması gerekenler:
- Kod indeksini istemciye açmamak; HMAC anahtarını servis dışında paylaşmamak.
- Rate limiter anahtarını istemcinin gönderdiği IP/deviceId'ye güvenerek üretmemek.
- Yanlış kodları da güvenilir sayaca dahil etmek; kota sınırında erişimi reddetmek.
- Öğretmen tokenını doğrulayıp sadece kendi öğrencisini yönetmesine izin vermek.
- Kalıcı studentId, ayrı credentialVersion, eski kod tombstone'u ve sürüm kontrollü
  session binding ile yenileme/kaldırmada eski oturumu kapatmak.
- Öğrenci parola/email sağlayıcısı bağlasa bile yalnız mevcut custom-token giriş
  context'i ve geçerli binding sürümü ile korunan öğrenci verisine izin vermek.
- Servis hesabı ve token-imzalama sırlarını tarayıcıya, JSON'a veya public'e koymamak.

## 2. Tam quiz deneyinin kapsamı

`quiz.rules` önceki `firestore.rules` deneyinden AYRI bir kurallar dosyasıdır.
İki dosyanın allow kuralları birleştirilmemelidir: önceki temel deneydeki
oturumsuz ödül yolu, yeni tamamlanma koşulunu bypass eder. Test ortamı her suite
için yalnız kendi dosyasını yükler. Hiçbiri ana uygulamaya bağlı/deploy edilmiş değil.

Tam quiz deneyinde güvenilir oturum kimlikleri Rules test ortamında modellenir.
Bu, yeni kısa kod girişinin çözüldüğünü veya custom-token servisinin çalıştırıldığını
iddia etmez. Öğretmen rolleri, öğrenci UID binding'i, başlangıç XP/Arena satırları,
quiz paketleri/özel anahtar snapshotları ve hafta takvimi trusted setup tarafından
yalnız `demo-test-arena-spark-prototype` projesine yazılır.

Gerçek `data/questions` Matematik bankasından mevcut importer normalization ile
40 soru okunur, ayrı emulator içinde dört 10-soruluk paket oluşturulur. JSON soru
formatı, içerikler, source ID'leri, cevaplar ve importer değiştirilmez. Yeni soru
üretilmez. Bu paket hazırlama kodu canlı importer'a eklenmedi.

Akış:
1. Öğrenci izin verilen, değiştirilemez 10-soruluk template'ten quiz başlatır.
2. Seçenek veya boş bırakma kararı ayrı immutable submission olarak commit edilir.
3. Rules özel, okunamayan template answer snapshotına karşı doğrular. Result ile
   quiz resolved/correct/wrong/blank sayacı aynı transaction'da ilerler.
4. 10 farklı sonuç doğrulanınca status completed ve server completedAt oluşur.
   Sayaç, template, sonuç veya tamamlanma zamanını öğrenci tek başına yazamaz.
5. Yalnız completed quizin doğru sonucu kalıcı questionId başına bir ödül alabilir.
6. Ödül + toplam XP + haftalık bucket + Arena projection dört belge olarak atomik
   yazılır. Eksik/şişirilmiş belge veya yanlış eşleşme bütün işlemi reddettirir.
7. Ödülün haftası, istemci saatine/talep tarihine değil server completedAt'e bağlıdır.
   Bağlantı sonrası geç talep eski haftaya yazılır; güncel Arena weekly değeri
   güncel bucket'tan doğrulanır. Eski ödül güncel haftalık XP'yi silemez/şişiremez.

Bu sonlandırma-sonrası XP kuralı kullanıcının yeni prototip talebine aittir.
Mevcut çalışan uygulamanın anlık doğru-cevap XP davranışı değiştirilmedi.

## 3. Doğrulanan senaryolar ve sonuçlar

- 10-soruluk quiz: 6 doğru + 3 yanlış + 1 boş → completed; +6 XP.
- Dokuz çözülmüş soru varken doğru sonuç bile ödül veremiyor.
- Aynı 10 soru tekrar doğru çözülünce önceki 6 için 0, yeni 4 için +4 XP.
- Aynı tamamlanmış testin ödül talebi tekrarlandığında 0 XP.
- Yanlış/boş için ödül, sahte doğru/skip flag, sayaç/complete/özel anahtar/
  template değişikliği ve soru-paket uyuşmazlığı reddediliyor.
- Cevap commit edilmeden result probe ve aynı-batch submission+result reddediliyor.
- Eşzamanlı sonuçlar, aynı soruya iki ödül ve farklı soruların eşzamanlı ödülleri
  sayaçları veya toplam/haftalık/Arena değerlerini bozmuyor.
- SDK network disabled iken son soru commit olmuyor, XP veril(e)miyor; enableNetwork
  sonrası quiz ve ödül işlemi tekrar edilebilir şekilde tamamlanıyor.
- Başarılı commit sonrası acknowledgement kaybı test enjeksiyonu tekrar XP üretmiyor.
- Tamamlanmış quizin bir kısmı ödüllendirilip istemci durursa retry kalanını güvenle
  tamamlıyor. Bu bütün quizin tek atomik ödülü değildir; her doğru ödülü atomiktir.
- Hafta değişimi trusted fixture takvim pencereleriyle simüle edildi; gerçek
  sunucu saati değiştirilmedi. Geçen haftanın quizini yeni haftaya taşıma reddedildi.
- Gecikmiş eski ödülün güncel weekly projection'ı bozmaması doğrulandı.
- Genel sıralama, haftalık sıralama, eşit puanda ortak sıra ve yalnız kendi sınıfına
  erişim doğrulandı. Başka öğretmen/öğrenciye yazım/okuma engellendi.
- Son immutable award ledger toplamları s1=33, s2=19, s3=10. Toplam, akademik,
  tarihsel haftalık bucket ve Arena değerleri bu ledger ile birebir eşleşti.

Testler: tam quiz suite **17/17**, önceki security/Auth suite **23/23**;
toplam emulator **40 geçti, 0 başarısız**. Native parola değiştirme testi geçiyor
çünkü bir açığı beklenen biçimde tespit ediyor; bir güvenlik onayı değildir.
Kaldırılmış demo fixture kullanan `question-content` testi artık gerçek İngilizce/
Matematik bankalarını salt okunur seçiyor; legacy-content varyantı yalnız memory'de.
Content + environment testleri **7 geçti, 0 başarısız**.
`npm.cmd run build` **başarılı** (frontend TypeScript/Vite ve mevcut Functions
TypeScript derlemesi). Derlemek, Functions çağırmak veya deploy etmek değildir.

Çalıştırma (repo kökü, Java 21+ PATH üzerinde):
```powershell
.\node_modules\.bin\firebase.cmd emulators:exec --config prototypes/spark/firebase.json --project demo-test-arena-spark-prototype --only auth,firestore "node --test --test-concurrency=1 prototypes/spark/quiz.test.mjs prototypes/spark/security.test.mjs"
node --test tests/question-content.test.mjs tests/firebase-environment.test.mjs
```

## 4. Kalan gerçek sınırlar

- Güvenli kısa kod/token/rol/binding servisi hâlâ gereklidir; native password alias
  mevcut davranışın güvenli eşdeğeri değildir. Ücretsiz barındırma adayı uygulanmadı.
- Sonuçlar emulator güvenlik testleridir; tüm saldırıların engellendiğini veya
  production sertifikasyonunu göstermez. Kimlik üretimi trusted kabul edilmiştir.
- Tam quiz, source bank importer, öğrenci UI, mevcut quiz sessions, analytics ve
  öğrenme/raporlama verilerine entegre edilmedi. Normal veri migrate edilmedi.
- Doğru şık/explanation feedback'i öğrenciye açılmadı; bu deney boolean grading ve
  ödül güvenliğini kapsıyor. Snapshot/version/feedback live geçişi ayrıca test edilmeli.
- İstemci tekrar açılmazsa doğrulanmış quizin bekleyen sonuç/ödülü kendiliğinden
  bitmez. Güvenilir background completion gerekiyorsa worker/sunucu gerekir.
- Bir çocuğun cevabı gerçekten zihninden bulduğunu Rules kanıtlayamaz. Yetkili
  kullanıcı aynı soruyu tekrar deneyebilir; bir questionId yalnız +1 toplam XP verir.
  Çok sayıda geçerli quiz açarak kota tüketme/otomasyon saldırıları için limitler
  bu deneyde kanıtlanmadı. Geçerli başka bir kısa kod ele geçirilirse kod tek başına
  onu yazan kişinin fiziksel kimliğini kanıtlamaz; bu bearer-credential sınırıdır.
- Takvim, immutable quiz template/answer snapshots ve sıfır XP projection'ları
  mevcut importer formatını değiştirmeden trusted hazırlama işleminde kurulmalı.
  Eksik takvim/key/projection fail-closed sonuç verir; yanlış admin verisi ayrı risk.
- Testteki network kesintisi SDK network disabling, acknowledgement kaybı fault
  injection, hafta değişimi fixture simulation'dır. Fiziksel cihaz/ISP/gerçek hafta
  geçişi veya sürekli concurrent yük testi yapılmadı.
- Rules belge erişim sınırı tek işlem için 10, atomik işlem için toplam 20'dir.
  Mevcut dört-belgeli ödül testte geçti; yeni analytics veya projection eklemek tekrar
  sınır/güvenlik testi gerektirir. Bir quizde bütün sonuçları bir get döngüsüne yığmadık.
- Spark ücretsiz Firestore: günde 50.000 okuma, 20.000 yazma, 1 GiB depolama.
  Bu prototipte 10 doğru quiz için 1 başlangıç + 30 submission/result/session +
  40 award/projection = 71 başarılı belge yazımı gerekir. Rules okumaları, tekrarlar,
  importer, Auth ve normal ekran kullanımı ayrıca kota tüketir. Billing/load testi
  yapılmadı; sınırsız kullanım veya belirli öğrenci kapasitesi garantisi verilmez.
- App Check bu deneyde yapılandırılmadı veya enforcement açılmadı. Doğru Rules ve
  kimlik doğrulamanın yerine geçmez; production brute-force/kota koruması ayrıca test.

## Kaynaklar

- [Auth kullanıcı/parola yönetimi](https://firebase.google.com/docs/auth/web/manage-users)
- [Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth)
- [Custom token / güvenilir imzalama](https://firebase.google.com/docs/auth/admin/create-custom-tokens)
- [Auth deneme/hesap oluşturma limitleri](https://firebase.google.com/docs/auth/limits)
- [Firestore atomic işlemler ve Rules limitleri](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Firestore kotaları](https://firebase.google.com/docs/firestore/quotas)
- [App Check](https://firebase.google.com/docs/app-check)
- [Cloudflare Workers fiyat/ücretsiz limitleri](https://developers.cloudflare.com/workers/platform/pricing/)
- [Cloudflare secret binding](https://developers.cloudflare.com/workers/configuration/secrets/)

## Bu görevde değişen dosyalar

- `prototypes/spark/quiz.rules`
- `prototypes/spark/quiz-client.mjs`
- `prototypes/spark/quiz.test.mjs`
- `prototypes/spark/REPORT.md`
- `prototypes/spark/README.md` (yeni rapor bağlantısı)
- `tests/prepared-bank-fixture.mjs`
- `tests/question-content.test.mjs`

Ana uygulama, JSON bankaları/importer, production Rules/Firebase ayarları ve
normal emulator Auth/Firestore verileri bu görevde değiştirilmedi.
