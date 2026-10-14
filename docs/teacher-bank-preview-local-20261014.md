# Öğretmen soru bankası — sade öğrenci görünümü

Yerel değişiklik; commit, push veya canlı yayın yapılmadı.

- Tüm öğretmenler ve yöneticiler soru bankasını varsayılan sade görünümde açar. Öğrenciyle aynı soru metni, görsel, seçenek ve seçim stilleri kullanılır; sayaç/ilerleme eklenir.
- Cevap vermeden önceki/sonraki geçişi serbesttir. Doğru cevabı göster/gizle seçim gerektirmez. Seçenek işaretleme isteğe bağlıdır; soru başına durum yerel tutulur ve başka filtreye geçince sıfırlanır.
- Yönetim araçları mevcut yetkiyle ayrı bağlantı arkasında korunur. Hata bildiriminden açılan tekil soru da sade görünümde gösterilir.
- Öğrenci cevaplama kodu, Firebase Auth, veri modeli, Rules, XP işlemleri ve canlı veriler değiştirilmedi.

Değişen dosyalar: `src/features/TeacherQuestionBank.tsx`, `src/ui/question-bank.css`, `SCREENS.md`, `tests/question-bank-cases.mjs`; yeni `tests/teacher-bank-preview-ui.test.mjs`. Test dosyasındaki önceden bulunan değişiklikler korundu.

## Doğrulama

- TypeScript ve Vite üretim derlemesi geçti. Mevcut PDF paket boyutu uyarısı devam ediyor.
- Yerel Auth/Firestore emülatörü: ilgili 7/7 test geçti. Öğretmen girişi, public/özel cevap erişimi, yetki yükseltme engeli, hata bildirimi/XP korunması, değişmez cevap anahtarları, açık testler, ekleme/arşivleme ve telefon/masaüstü öğretmen arayüzü kontrol edildi.
- Bileşen tarayıcı testi 1/1 geçti: normal öğretmen ve yönetici × 360/1366 px. Boş geçme, cevap göstermeyi seçimsiz kullanma, gizleme, seçim koruma, sayfalama, yönetici araçlarına geçiş ve konsol/page hataları kontrol edildi.
- Bileşen fixture'ında ilk yükleme 1 veri çağrısı, sonraki sayfa sonrası toplam 2 çağrı; gezinme/gösterme/gizleme sırasında ek çağrı veya yazma yok. Bu doğrudan fixture gözlemidir; faturalandırılan belge okuması ölçümü değildir. Gerçek emülatör testi ayrıca öğrenci summary'sinin değişmediğini doğruladı.
- Gerçek uygulamanın telefon ve masaüstü ekran görüntüleri görsel incelendi; yatay taşma/konsol hatası yok. Tam ekran mevcut testte doğrulandı.

Kanıtlar: `artifacts/teacher-bank-preview/emulator.log`, `tests.json`, ekran görüntüleri; gerçek uygulama görüntüleri `test-results/question-bank/review-360.png` ve `review-1366.png`.
