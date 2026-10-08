# Sınıf Arenası

Öğretmen menüsünden **Sınıf Arenası** açılır (`/ogretmen/sinif-arenasi`). Mevcut JSON importer'ın ürettiği `sparkCatalog`, `quizTemplates` ve öğretmene özel cevap anahtarı okumaları kullanılır. Soru şeması veya importer değiştirilmez.

- Kademe (2–12), ders, ünite/tema, soru bankası ve toplam soru sayısı seçilir.
- Tek öğrenci veya çok oyunculu/takım yarışı kurulabilir. Oyuncu sayısına sabit üst sınır yoktur.
- Her tamamlanan turda katılımcılara birer soru verilir. Havuzda tam tur için yeterli soru yoksa yeni tur başlamaz. Başlangıçta soru sayısı havuza ve tam turlara göre azaltılırsa uyarı gösterilir.
- Oyuncu ekleme, çıkarma ve geri alma sonraki turda etkili olur. Başlayan turun sırası korunur; çıkarılan oyuncunun puanı silinmez. İsimler yarışma sırasında düzenlenebilir.
- Süre 0 olduğunda sınırsızdır. Süre dolumu yanlış cevap puanını kullanır. Doğru ve yanlış puanları öğretmen tarafından ayarlanır.
- Soru kimlikleri tekilleştirilir. Dengeli dağıtım yalnız `easy`, `medium`, `hard` zorluk bilgisi olan sorularda uygulanır; bilinmeyen zorluk tahmin edilmez.
- Yalnız öğretmen erişebilir. Öğrenci kaydı, XP, quiz geçmişi veya yarışma sonucu Firebase'e yazılmaz.
- Aktif yarışma öğretmen UID'siyle ayrılmış `sessionStorage` anahtarında saklanır. Aynı sekmede yenileme sonrasında kurtarılabilir; sekme kapatılırsa geçici kayıt sona erer. Biten yarışmanın kaydı silinir. Sonuç ekranı yeni yarışma başlatılana kadar bellekte kalır.
- Sorular ve cevap anahtarları tamamen yüklendikten sonra açık yarışma ağ bağlantısı olmadan ilerleyebilir. Uygulamanın çevrimdışı yeniden açılabilmesi mevcut PWA önbelleğine bağlıdır.

## Doğrulama

- `npm run build`
- `node --test tests/classroom.test.mjs tests/firebase-environment.test.mjs`
- `npm test` (mevcut Spark regresyonları)
- `npx firebase emulators:exec --config firebase.classroom-test.json --project demo-test-arena-classroom-test --only auth,firestore "node tests/classroom.browser.mjs"`

Tarayıcı testi izole demo projesini sıfırlar, kendi fixture'ını oluşturur ve 5176 portunda test Vite sunucusu çalıştırır. Normal geliştirme projesinin verilerini kullanmaz. Telefon/masaüstü görüntüleri `artifacts/classroom-arena` klasörüne yazılır.

Canlıda öğretmen cevap anahtarı okuma izni için güncellenmiş Firestore kurallarının yayımlanması gerekir. Bu görev canlıya yayın yapmaz.

