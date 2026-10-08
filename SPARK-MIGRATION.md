# Spark geçişi — yerel doğrulama

Normal uygulama Firebase Authentication + Firestore kullanır. `firebase/functions`,
callable endpoint veya Functions emulatorü normal build/start-dev akışında yoktur.
Eski Functions/prototype kodları arşiv ve önceki testler için korunmuştur.

## Güvenlik ve davranış

- Öğrenci altı karakterli mevcut kısa kodla native Auth oturumu açar.
- Öğretmen öğrenci oluştururken ayrı Auth oturumu kullanır; kendi oturumu korunur.
- Kod yenileme yeni UID/credentialVersion bağlar; eski UID'nin Firestore erişimi kesilir.
- Öğretmen yalnız kendi sınıf/öğrenci alanını yönetir. Öğrenci kademe veya XP yazamaz.
- Hazır JSON importer public/private ayrımını korur. Trusted importer ayrıca
  `sparkCatalog`, `quizTemplates`, `privateQuizKeys` ve dönem kayıtlarını hazırlar.
- Öğrenci cevap anahtarını ancak değiştirilemeyen yanıtını kaydettikten sonra geri
  bildirim için okuyabilir. İlk doğruya +1 XP ödülü test tamamlandığında kaydedilir.
  Yanlış/boş cevap 0 XP; awardedQuestions aynı soruya yeniden ödülü engeller.
- Anahtar karşılaştırması, sonuç sayaçları ve XP/hafta/Arena güncellemesi Rules ile
  doğrulanır. İstemcinin doğruluk/XP iddiasına tek başına güvenilmez.
- Önceki testSessions/analytics geçmişi korunur. Eski oturumlar salt okunurdur;
  yarım kalan eski testi sürdürmek yerine yeni test seçmek gerekir.

## Kabul edilen sınırlamalar

Native Auth API öğrencinin kendi şifresini/e-postasını değiştirmesini veya Auth
hesabını silmesini engellemez. Teacher code renewal yeni hesabı bağlayarak erişimi
kurtarır. Bu sınırlama giderilmiş değildir ve kullanıcı tarafından kabul edilmiştir.
Altı karakterli kod bir erişim sırrıdır; Auth kotası/koruması eski sunucudaki özel
rate-limit mekanizmasının birebir karşılığı değildir.

Canlı ortamda tarayıcı dosya klasörünü tarayamaz. Admin bank update yalnız local
Vite üzerinde, doğrulanmış yerel admin ile çalışır; canlı soru yüklemesi güvenilir
import aracı gerektirir. Eski AI/refill sistemi yeniden etkinleştirilmemiştir.

## Geçiş ve doğrulama

`scripts/migrate-spark-local.mjs` yalnız demo-test-arena, 8080/9099 üzerinde çalışır.
Eski aktif hesapları dönüştürmeden önce Auth + Firestore export'u zorunludur.
Tekrar çalıştırılması aynı hesabı tekrar oluşturmaz. start-dev otomatik çağırır.

Yedek: `.firebase/emulator-data/before-spark-migration`.
Kalıcı veri: `.firebase/emulator-data/saved`.

Öncesi/sonrası: questions 1086, privateQuestionAnswers 1086, teachers 6,
students 32, classes 9, awardedQuestions 181, toplam XP 181. Silme olmadı;
31 aktif öğrencinin kodu korunarak native Auth hesabı eklendi. Eski Auth kullanıcıları
silinmedi.

Testler: 13/13 Spark entegrasyon/güvenlik testi; 22/22 ilgili import/görsel/config
testi; build başarılı. Browser testi gerçek kısa kod girişi, öğrenci ana ekranından
ders/ünite/konu/test seçimi, cevap ve Arena akışını 360×800 / 1366×900 üzerinde
çalıştırır; console error, yatay taşma ve Functions isteği yok.

`npm.cmd run test:spark` izole demo-test-arena-spark-prototype emulatorünü kullanır.
Önceki test:local/test:quiz/test:security komutları legacy Functions testleridir;
Spark doğrulaması için kullanılmaz. Bu geçişte canlı deployment yapılmadı.
