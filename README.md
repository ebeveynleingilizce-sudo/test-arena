# Test Arena — Milestone 3

## PWA kurulumu ve güncellemeler

Ana rol seçimi, öğrenci ana ekranı ve öğretmen ana panelindeki “Uygulamayı İndir”
düğmesi, tarayıcı `beforeinstallprompt` sunduğunda gerçek kurulum penceresini açar.
iPhone/iPad için Paylaş → Ana Ekrana Ekle yönergesi gösterilir. Standalone
pencerede ve bu oturumda kurulum doğrulandığında düğme gizlenir. Tarayıcılar,
başka bir pencerede daha önce kurulmuş uygulamayı her zaman tespit ettirmez.

Service worker geliştirme modunda kapalıdır. Build'de içerikten hesaplanan
cache sürümü kullanılır. Yeni sürüme geçiş kullanıcı düğmeye bastığında olur;
Auth/Firestore/Functions verileri önbelleğe alınmaz, kullanıcı depoları silinmez.
Çevrimdışı soru çözme desteklenmez; bağlantı gerektiğini belirten ekran sunulur.

Mevcut dağıtım tanımı `firebase.json` içindeki `dist` hosting ayarıdır;
GitHub Pages workflow'u bulunmuyor. Pages alt dizini için örnek build:
`npx.cmd vite build --base=/test-arena/`. Manifest, ikon ve service worker yolları
bu base'i kullanır; `404.html` de üretilir. **Mevcut Firebase kodu localhost dışında
çalışmayı bilinçli olarak engeller.** Bu görev canlı Firebase yapılandırmasını
değiştirmez; gerçek Pages giriş/kurulum doğrulaması henüz yapılamaz.

Hedefli kontroller: `node --test tests/pwa.test.mjs` ve
`npx.cmd playwright test tests/e2e/pwa.spec.ts --project=phone --project=desktop`.

React + TypeScript + Vite; Firebase Authentication, Firestore ve callable Functions.
Bu sürüm yalnızca `demo-test-arena` Emulator projesine bağlanır. Canlı Firebase
ayarları yoktur. Uygulama kodu yalnızca localhost üzerinde çalışır.

## Yerel çalışma

Node.js 22.18+ veya 24 ve Java 21+ gerekir. Bu bilgisayarda Android Studio'nun
`C:\Program Files\Android\Android Studio\jbr` çalışma zamanı kullanılabilir.

```powershell
npm ci
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
npm run emulators
```

İkinci terminalde önce `npm run seed:demo`, ardından `npm run dev` çalıştır;
sonra http://127.0.0.1:5173 adresini aç.
Öğretmen girişinde hesap oluştur; gerçek hesap kullanma. Google girişi Emulator'un
taklit sağlayıcı ekranını kullanır; gerçek Google OAuth doğrulaması değildir.
Emulator yeniden başladığında veri temizlenir; öğrenci/öğretmen tarayıcı oturumları
da gerektiğinde çıkış yapılarak temizlenmelidir.

## Test

```powershell
npx playwright install chromium
npm run build
npm test
```

`npm test` Auth, Firestore ve Functions Emulator'larını açıp gerçek Security Rules
ve callable uçlarıyla güvenlik testlerini, sonra 360px ve desktop Playwright
akışlarını çalıştırır. Emulator zaten açıksa `npm run test:local` kullan.
Playwright yalnızca localhost'a bağlanır; test hesapları `example.invalid` alanındadır.

## Soru çözme ve XP

Milestone 2'nin veri modeli, güvenlik sınırları, test kanıtları ve dosya listesi:
[MILESTONE-2.md](MILESTONE-2.md).
Demo seed üç konuda 12'şer soru ekler (5/6 Matematik Kesirler, 6 İngilizce Temel
Kelimeler). Aynı kalıcı soru kimliğini çoğaltmaz veya üzerine yazmaz.
İstemci cevap anahtarını alamaz; yalnızca cevap gönderildikten sonra kilitlenen
sonuç ve açıklama döner. İlk benzersiz doğru cevap +1 XP; yanlış ve ödüllendirilmiş
sorunun yeniden çözümü +0 XP. Cevap API'si bağlantı gerektirir; offline XP yoktur.

## Veri modeli

Arena'nın ek veri modeli, haftalık bucket, rank, güvenlik, gerçek zamanlı okuma
yaklaşımı ve dosya listesi [MILESTONE-3.md](MILESTONE-3.md) içindedir.
Öğrenci Ana / Arena / Profil ekranları mevcut sınıfın public özetlerini kullanır.
Bu Hafta varsayılandır; Genel academicXP toplamını sıralar. totalXP korunur.
Eski M2 sınıfları ilk Arena açılışında bir kez sunucuda hazırlanır.

```text
teachers/{teacherUid}/classes/{classId}
  classId, teacherUid, className, defaultGradeLevel, createdAt
  classMembers/{studentId}: studentId
teachers/{teacherUid}/students/{studentId}
  studentId, teacherUid, classId, className, firstName, lastName,
  gradeLevel, status, credentialVersion, createdAt
teachers/{teacherUid}/studentCodes/{studentId}
  code, codeHash (yalnızca sahibi öğretmen okuyabilir)
studentCodeIndex/{HMAC(code)}
  teacherUid, studentId, credentialVersion veya revoked=true
studentSessions/{sessionUid}
  teacherUid, studentId, credentialVersion, createdAt
loginLimits/{HMAC(ip)}
  windowStart, count
```

Öğrenci ID'si Firestore tarafından rastgele ve sınıftan bağımsız oluşturulur.
Taşıma öğrenci belgesini taşımadan classId/className ve üyelikleri günceller.
Kademe 2–12 arasındadır; sınıf adı kademeden türetilmez. `className` öğrenciye
güvenli gösterim için kopyalanır; bu milestone'da sınıf adı değiştirme yoktur.

## Functions ve Rules

- `createClass`: öğretmen UID'si altında sınıf oluşturur.
- `createStudent`: sınıf sahipliğini doğrular; öğrenci, üyelik ve benzersiz kodu
  tek transaction'da oluşturur. Kod çakışırsa yeni kod dener.
- `updateStudent`: yalnızca sahibi öğretmen kademe/sınıf değiştirebilir; ID korunur.
- `rotateStudentCode`: kod indeksini ve sürümü tek transaction'da değiştirir.
- `removeStudent`: öğrenci pasiflenir, üyelik/kod görünümü kaldırılır; geçmişe uygun
  kalıcı kimlik korunur.
- `studentLogin`: altı karakterli kodu normalize eder, özel HMAC indeksinden bulur,
  aktif öğrenci/sürümü doğrular; yeni session UID'si için custom Auth token döner.

Global kod indeksi, limiter ve session yazıları istemciye kapalıdır. Öğretmenler
yalnızca kendi UID kapsamını okuyabilir; tüm mutasyonlar sahiplik kontrollü
Functions üzerinden geçer. Öğrenci yalnızca kendi kaydını okuyabilir; listeleme,
kod kayıtları ve bütün istemci yazıları reddedilir. Her öğrenci okumasında durum ve
sürüm kontrol edilir. Kod iptali eski token'ın öğrenci verisine erişimini keser.
Session kimlik eşlemesi sahibine okunabilir kalır; kendisi özel öğrenci profili
değildir. Önceki kod hash'leri tombstone olarak tutulur ve yeniden atanmaz.

Login limiter IP başına dakikada 20 denemeyi sayar; cihaz ID'sine güvenmez.
Ortak okul ağlarında bu sınır pilot ölçümüne göre ayarlanmalıdır. App Check canlı
ortam için zorunlu seçenek olarak hazırdır; Emulator'da kapalıdır.

## Production öncesi gerekenler

Bu aşamada deploy yapılmaz. Canlıya geçiş için ayrı Test Arena Firebase projesi,
Blaze, Auth sağlayıcıları/yetkili alan adları, App Check sağlayıcısı, güçlü
`STUDENT_CODE_HMAC` Secret Manager sırrı ve gerçek OAuth/App Check kabul testi
gereklidir. HMAC sırrı rastgele döndürülürse indeks çözülemez; kontrollü anahtar
geçişi gerekir. Yerel sabit sır production'da kullanılmaz.
Eski Yıldız Yarışları projesine veya verisine bağımlılık yoktur.

Tek manifest ve statik kabuk service worker'ı hazırlanmıştır. Vite development ve
Playwright'ta service worker kapalıdır. İlk giriş ve veri işlemleri çevrimiçidir.
Soru bankası, XP, leaderboard ve raporlar bu milestone kapsamında değildir.

Oturum/kod tombstone kayıtlarının saklama süresi ve limiter temizliği pilot
öncesinde belirlenmeli; büyük ölçekte sınırsız kayıt birikimine izin verilmemeli.
