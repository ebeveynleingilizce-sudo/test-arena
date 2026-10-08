# Milestone 1 — tamamlanma raporu

## Sonuç

Öğretmen girişi → sınıf oluşturma → öğrenci oluşturma → benzersiz kısa kod →
temiz cihazda yalnızca kısa kodla öğrenci girişi Emulator üzerinde çalışıyor.
Kademe/sınıf düzenleme, kod yenileme ve öğrenci kaldırma da uygulanmıştır.
Soru, XP, Arena/liderlik ve rapor özellikleri geliştirilmemiştir.

Üretim Firebase projesi oluşturulmadı, üretime veri yazılmadı, Rules/deploy
yapılmadı. Yıldız Yarışları kaynakları kopyalanmadı. Commit/push yapılmadı.
PRODUCT.md, DESIGN.md, AGENTS.md, mevcut SCREENS.md ve görsel referans korunmuştur.

## Mimari

React + TypeScript + Vite, React Router, standart CSS, yerel Manrope fontları.
Tek uygulama: açılış, öğrenci girişi, öğretmen girişi, ana panel, sınıf listesi,
öğrenci ekleme/listesi ve temel öğrenci karşılama ekranı. Görsel referans uygulama
arka planı yapılmadı; geometrik yıldızlar SVG ve sahne gerçek CSS öğeleridir.

Tarayıcı yalnızca demo-test-arena Auth/Firestore/Functions Emulator'larına bağlanır;
localhost dışındaki çalıştırmalar reddedilir. Üretim konfigürasyonu/fallback yoktur.
Sunucu altı callable Function'dan oluşur; ayrı API sunucusu veya başka backend yoktur.

## Veri modeli

```text
teachers/{uid}/classes/{classId}
  className, defaultGradeLevel, classId, teacherUid, createdAt
  classMembers/{studentId}
teachers/{uid}/students/{studentId}
  firstName, lastName, classId, className, gradeLevel, status,
  credentialVersion, studentId, teacherUid, createdAt
teachers/{uid}/studentCodes/{studentId}
  code, codeHash
studentCodeIndex/{HMAC(code)}
  teacherUid, studentId, credentialVersion veya revoked=true
studentSessions/{sessionUid}
  teacherUid, studentId, credentialVersion, createdAt
loginLimits/{HMAC(ip)}
  windowStart, count
```

StudentId kalıcıdır; sınıf değişikliği ID'yi değiştirmez. ClassName serbest grup
adıdır; defaultGradeLevel ve öğrencinin gradeLevel alanı ayrıdır. 2–12 doğrulaması
sunucudadır. İçerik erişim filtresi sonraki milestone kapsamındadır.

## Güvenlik ve Functions

Öğretmen Google/e-posta sağlayıcısıyla Auth UID üzerinden tanımlanır. Rules ve
Functions UID sahipliğini kontrol eder. İstemciler bütün yazma işlemlerinden
men edilmiştir; mutasyonlar güvenilir Functions üzerinden gerçekleşir.

- createClass: sahibi öğretmenin sınıfını oluşturur.
- createStudent: sınıfı doğrular; öğrenci/üyelik/benzersiz kodu transaction ile yazar.
- updateStudent: sahibi öğretmen sınıf/kademe değiştirebilir; öğrenci ID'si korunur.
- rotateStudentCode: eski kod hash'ini iptal eder, yenisini ayırır; sürümü artırır.
- removeStudent: üyelik/kod kaydını kaldırır; öğrenci durumunu ve sürümünü değiştirir.
- studentLogin: sunucuya özel HMAC indeksini çözer; aktifliği/sürümü doğrular;
  yeni session UID'si için Firebase custom token döndürür.

Öğretmen yalnızca kendi kısa kodlarını okuyabilir; global indeks tüm istemcilere
kapalıdır. Öğrenci yalnızca kendi session eşlemesini ve aktif/sürümü geçerli kendi
öğrenci profilini okuyabilir. Diğer öğrencileri listeleyemez; kademesini yazamaz.
Kod yenileme ve kaldırma eski session'ın özel öğrenci verisine erişimini keser.
Firebase Auth token'ının mevcut olması tek başına profil erişimi sağlamaz.

Altı karakterli kod kriptografik rastgelelikle üretilir; global benzersizlik
transaction'da kontrol edilir. İptal edilen kodlar yeniden atanmaz. Girişte IP
başına dakikada 20 deneme sayılır. Production App Check zorunluluğu sunucu
seçeneklerinde hazırdır; Emulator'da uygulanmaz.

Kod yenileme sonrası tarayıcının eski Firestore önbelleğini yeni session'a
uyguladığı hata E2E'de yakalanıp düzeltildi. Oturum yalnızca sunucudan doğrulanmış
snapshot ile açılır; önbellek yetkilendirme kaynağı değildir.

## Dosya dökümü

Yeni kaynak/konfigürasyon dosyaları:

- package.json, package-lock.json, tsconfig.json, vite.config.ts, index.html, .gitignore
- firebase.json, firestore.rules, firestore.indexes.json
- functions/package.json, functions/tsconfig.json, functions/src/index.ts
- src/main.tsx, src/vite-env.d.ts
- src/app/Session.tsx, src/data/firebase.ts, src/domain/models.ts
- src/features/Login.tsx, Teacher.tsx, Welcome.tsx
- src/ui/components.tsx, styles.css
- public/arena.svg, manifest.webmanifest, service-worker.js
- playwright.config.ts, tests/helpers.mjs, tests/security.test.mjs,
  tests/e2e/milestone.spec.ts
- README.md, MILESTONE-1.md

Üretilen ve Git dışında tutulan çıktılar: node_modules, functions/lib, dist,
.firebase yerel cache, tsbuildinfo, Emulator logları, test-results ve
playwright-report. Önceden var olan ürün/tasarım belgeleri bu görevde değiştirilmedi.

## Doğrulama

- Son TypeScript, Vite ve Functions derlemesi: başarılı.
- Auth + Firestore + Functions Emulator güvenlik/entegrasyon: 13 geçti, 0 başarısız.
- Chromium 360×800 telefon ve 1366×900 desktop: 4 geçti, 0 başarısız.
- Toplam son doğrulama: **17 geçti, 0 başarısız, 0 atlandı.**
- Sayfa hataları ve öğretmen akışındaki console.error kontrolü: temiz.
- Öğrenci canlı iptali ve yenilenmiş kodla tekrar girişi: başarılı.
- Oturum sonrası sayfa yenileme: başarılı.
- Telefon/desktop yatay overflow: yok.
- Öğretmen öğrenci satırlarında bağlantı: yok.
- Telefon/desktop giriş, liste ve karşılama ekran görüntüleri görsel olarak incelendi.

Negatif güvenlik testlerinde beklenen PERMISSION_DENIED logları bulunur;
bunlar erişimin reddedildiğini doğrular, başarısız test değildir.
İlk E2E denemelerindeki etiket/önbellek hataları düzeltilmiş; son çalıştırmada
başarısız test kalmamıştır.

Test çalışma zamanı: Node 24.21, Android Studio OpenJDK 25, Firebase CLI 15.32.1,
Firestore Emulator 1.22.0. Functions hedef runtime'ı Node 22'dir; Emulator host Node
24 kullanıldığına dair uyarı verir. Gerçek Node 22 runtime doğrulaması production
öncesi yapılmalıdır. Google OAuth gerçek sağlayıcı ve App Check gerçek attestation
bu yerel testlerle doğrulanmamıştır. E2E tarayıcısı Chromium'dur; Safari/WebKit ve
gerçek cihaz PWA kurulumu henüz doğrulanmamıştır.

## Production ve Milestone 2 öncesi

Milestone 2'nin yerel geliştirmesine engel kritik güvenlik testi kalmamıştır.
Soru/XP katmanı yazılmadan kalıcı questionId ve atomik ödül transaction sözleşmesi
korunmalıdır. Production'a geçiş ise ayrı bir onay ve şu işleri gerektirir:

- Ayrı Test Arena Firebase projesi, Blaze ve sağlayıcı/yetkili alan yapılandırması.
- Gerçek App Check entegrasyonu ve Secret Manager HMAC anahtarı; yerel sır kullanılmaz.
- Üretim hedefinin istemciye güvenli, açık konfigürasyonu; mevcut yerel guard'ın
  production için bilinçli uyarlanması.
- Gerçek Google OAuth, production runtime ve cihaz PWA/Safari kabul testleri.
- Okul ağlarına göre login rate limit ayarı ve session/limiter saklama-temizleme politikası.
- Üretim loglarında kod/token içeriğinin kaydedilmediğinin kontrolü ve bütçe uyarıları.

Başlangıç komutları ve veri/güvenlik ayrıntıları README.md içindedir.
