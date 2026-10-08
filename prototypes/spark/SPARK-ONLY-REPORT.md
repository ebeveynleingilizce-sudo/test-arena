# Spark-only kod yönetimi ve quiz prototipi

8 Ekim 2026. Mevcut uygulamaya geçiş yapılmadı. Bu prototip yalnız
`demo-test-arena-spark-prototype` Auth `127.0.0.1:9199`, Firestore
`127.0.0.1:8180` üzerinde sınandı. Ana uygulama/emulator verisine yazılmadı.
Harici sunucu, Cloudflare, Cloud Functions veya ücretli servis eklenmedi.

## Kod oluşturma ve yenileme

- Öğrenci yalnız mevcut alfabedeki altı karakterli kodu giriyor; ayrı email veya
  parola istemiyor. İçeride kod, Auth email alias ve parolaya dönüştürülüyor.
- Öğretmenin ayrı Auth oturumu korunuyor. Yeni öğrenci Auth hesabı ikinci bir
  Firebase istemci instance'ında `createUserWithEmailAndPassword` ile açılıyor.
  Bu işlemler Admin SDK veya Functions kullanmıyor.
- Varsayılan kod Web Crypto ile üretiliyor. `codeTickets/{code}` kalıcı rezervasyon
  olduğundan email değiştirme/hesap silme sonrasında eski kod yeniden kullanılmıyor.
  Çakışma sessizce geçilmiyor; yeni kodla yeniden deneme gerekiyor.
- Yeni Auth UID, kendisine ait ve ticket email'i ile eşleşen token üzerinden
  değiştirilemez `enrollmentProofs/{uid}` oluşturuyor. Öğretmen başka UID'yi yalnız
  bilerek kendi öğrencisine bağlayamıyor: proof ve owner/student/version eşleşmeli.
- Öğretmen proof'u kullanarak binding, student role ve profil sürümünü atomik
  aktive ediyor. Sadece öğretmenin kendi öğrencisinin sürümü değişebilir.
- Yenileme eski Auth parolasını yönetmez; yeni Auth hesabı/UID oluşturur. Kalıcı
  `studentId`, sınıf, kademe, quiz geçmişi ve XP aynı kalır. Eski binding sürümü
  Firestore Rules'tan geçemez. Eski Auth hesabı otomatik silinmez.
- Global kod listesi öğrenciye açılmaz. Reservation/proof kayıtlarına istemci
  silme veya güncelleme izni verilmez. Öğretmen bile XP'yi sıfırlayamaz.

## Emulator sonuçları

| Denetim | Sonuç |
|---|---|
| Öğretmen client SDK ile sınıf/öğrenci/kod oluşturur | PASS |
| Öğrenci koduyla gerçek Auth oturumu + korunan profil erişimi | PASS |
| Başka öğretmen, sahte binding/role/proof, kademe ve XP saldırıları | Reddedildi |
| Kod yenileme sonrası eski oturumun Firestore erişimi | Reddedildi |
| Öğrenci şifre değiştirince aynı eski kodla giriş | Başarısız: ürün güvenlik açığı |
| Şifre değiştirilmiş öğrenci için öğretmenin yeni kodla kurtarması | PASS; kalıcı öğrenci/XP korundu |
| Öğrenci native Auth email değiştirme ve hesap silme | MÜMKÜN; engellenemiyor |
| Silinmiş Auth hesap sonrası öğretmenin yeni kodla kurtarması | PASS; geçmiş ve XP korundu |
| Eski kodun yeniden kullanılmaya çalışılması | Reddedildi |
| Auth hesabı oluşturma hatası | Aktif profil/sürüm korunuyor; başarısız kod rezervasyonu kalıyor |
| Gerçek kodla giren UID'nin 10 soruluk quiz'i | PASS |
| Yanlış = 0, ilk doğru = 1, aynı sorunun tekrarı = 0 | PASS; kurtarma sonrasında da korunuyor |
| Private cevapları/quiz key'lerini önceden okuma | Reddedildi |
| Haftalık/toplam XP, Arena, erken ödül, eşzamanlı işlemler, bağlantı kesintisi | Önceki tam quiz testleri geçti |

Toplam emulator: **49/49** (önceki 40 + yeni 9). Tam quiz'in 17 testi yeni
kimlik kurallarıyla birleştirilmiş Rules altında yeniden geçti; eski temel deneyin
23 testi ayrı temel Rules kullanır. Yeni kimlik testleri gerçek Auth SDK ve tam
quiz Rules'u birlikte kullanır. Son çalışma koruması eklendikten sonra yeni 9
kimlik testi tekrar geçti. Ek unit/uyumluluk: **9/9** (2 yeni + 7 mevcut).
`npm.cmd run build`: başarılı.

Testler Auth/Firestore SDK uçtan uca entegrasyonudur. Mevcut uygulamanın UI'ı
prototipe geçirilmedi; canlı tarayıcı/cihaz geçişi test edilmiş sayılmaz. Haftalık
sınır, ağ kesintisi ve kayıp acknowledgment kontrollü test simülasyonlarıdır.

## Güvenli olduğu iddia edilemeyenler

**Tam kısa kod güvenliği karşılanmadı.** Native password Auth hesabına giriş
yapabilen öğrenci, arayüzde buton olmasa da Auth API üzerinden parola değiştirebilir.
Firestore Rules, Auth API işlemlerini kontrol etmez. Email değiştirme ve hesap
silme de emulator'da gerçekleşti. Öğretmenin yeni kod üretip Firestore erişimini
geri alabilmesi bu işlemleri önlediği anlamına gelmez. Öğrenci email'ini kendi
gerçek adresine taşırsa native hesap kurtarma kanalı da öğretmen dışına çıkabilir.

Eski UID'nin binding sürümü yenileme ile geçersizleşir; bu, eski Auth hesabının
servis seviyesinde disable/delete edilmesi veya bütün Auth token'larının revoke
edilmesi değildir. Öğretmen hesabı client SDK ile başka kullanıcıya Admin işlemi
yapamaz. Silinen hesabın önceden alınmış token'ları için de yalnız Auth silmeye
güvenilmemeli; erişim kesme profil/binding sürüm yenilemesine dayanır.

Auth signup ve Firestore aktivasyonu tek transaction değildir. Bağlantı/kota/hata
durumunda pending profil, kalıcı kod rezervasyonu veya bindingsiz Auth hesabı
kalabilir. Böyle bir hesap öğrenci verisine erişemez; otomatik Auth temizliği
uygulanmadı. Çok sayıda yenileme Spark Auth kullanım/kota sınırına takılabilir.

Önceki güvenilir servisdeki HMAC saklama, IP bazlı kısa kod deneme sınırı ve
custom-token-only öğrenci oturumu bu deneyde eşdeğer biçimde korunmadı.
Altı karakterli kodun online tahmin ve kota tüketimine karşı yeterliliği kanıtlanmadı.
App Check, Auth parola değiştirme yetkisini kaldırmaz ve tek başına bu açığı çözmez.

Öğretmenlerin trusted `teacher` rolü ile ilk kayıt işlemi, quiz template/private
key/calendar gibi güvenilir içerik kurulumu test fixture'ında yerel Admin SDK ile
yapıldı. Bu **sunucusuz client onboarding implementasyonu** değildir. Mevcut JSON
importer değiştirilmedi; bilgisayardaki güvenilir import ortamı kullanılmaya devam
edebilir. Import yetkisi öğrenciye verilmez; Admin credential frontend'e taşınmaz.

Spark-only yaklaşım veri izolasyonu, özel cevap erişim yasağı, Rules kontrollü quiz
ve XP'yi karşılayabiliyor. Öğrencinin Auth hesap kontrolünü değiştirmesini önleme,
merkezi Auth yönetimi ve mevcut güçlü kod giriş korumalarının tamamını koruma
gereksinimleri bu prototiple karşılanmıyor. Dolayısıyla mevcut uygulamaya güvenli
ve eşdeğer canlı geçiş onayı olarak değerlendirilmemeli.

Resmi kaynaklar: [Auth kullanıcı yönetimi](https://firebase.google.com/docs/auth/web/manage-users),
[Admin kullanıcı yönetimi](https://firebase.google.com/docs/auth/admin/manage-users),
[Rules koşulları](https://firebase.google.com/docs/firestore/security/rules-conditions),
[Auth sınırları](https://firebase.google.com/docs/auth/limits).

## Değişiklikler

Yalnız prototype dosyaları: `teacher-codes.mjs`, `identity.rules.fragment`,
`load-identity-rules.mjs`, `teacher-codes.test.mjs`, `teacher-codes-unit.test.mjs`,
`quiz.test.mjs`, bu rapor ve README bağlantısı. Ana UI, importer, bankalar,
Auth/Firebase ayarları, production Rules ve kullanıcı verileri değiştirilmedi.

İzole test komutu (mevcut uyumlu Java 21 PATH'te olmalı):

```powershell
.\node_modules\.bin\firebase.cmd emulators:exec --config prototypes/spark/firebase.json --project demo-test-arena-spark-prototype --only auth,firestore "node --test --test-concurrency=1 prototypes/spark/quiz.test.mjs prototypes/spark/security.test.mjs prototypes/spark/teacher-codes.test.mjs"
```

Test bitince yalnız disposable prototip emulatorleri kapandı. Mevcut uygulama
ortamının servisleri bu test tarafından kapatılmadı. Canlı deploy/commit/push yok.
