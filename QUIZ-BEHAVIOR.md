# Davranış gözlemleri — ilk aşama

Bu aşama veri toplama ve öğretmen raporlamasıdır. Risk puanı, otomatik
ceza, doğrulama sorusu üretimi veya yeni yarışma kısıtı eklenmez.

## Toplanan bilgiler

- Soru görünürken geçirilen süre (cevap kaydından önce; tekrar ziyaretler dahil).
- Görünür/arka plan toplamı, görünürlükten arka plana geçiş sayısı.
- Kontrol edilmeden önce seçeneğin değiştirilmesi; ilk seçim değişiklik sayılmaz.
- Mevcut Firestore başlangıç, gönderim ve tamamlanma zamanlarından test süresi
  ve test başlangıcından cevap kaydına geçen süre.
- Aynı kademe/ders/ünitede önceki üç tamamlanmış teste göre başarı değişimi.

`teachers/{teacherUid}/students/{studentId}/quizzes/{testId}/behavior/{0..7}`
belgelerinde toplu, birikimli özet tutulur. Soru dizileri mevcut template sırasına
göre on elemanlıdır; küçük testler sıfırla doldurulur. İsim, cevap metni, tuş kaydı,
ekran görüntüsü, başka uygulama/sekme adresi, IP veya cihaz parmak izi eklenmez.

Kalıcı yazım bir saniye/zamanlayıcı döngüsüne bağlı değildir: cevap kontrolü,
test bitirme, görünürlük değişimi ve ekranın terk edilmesi checkpoint oluşturur.
Sekiz tarayıcı kaydı, kayıt başına 120 güncelleme ve 24 saatlik süre sınırı vardır.
Sayfa yenileme yeni kayıt açabilir; süreler aynı anda açık sekmelerde çakışabilir.
Bu, tek aktif oturumun güvenli biçimde uygulandığı anlamına gelmez.

## Güven ve gizlilik

Yalnız ilgili öğrenci kendi testine yazabilir. Başka öğrenci/öğretmen okuyamaz;
ilgili öğretmen okuyabilir. Kurallar şekil, boyut, kimlik ve zaman damgalarını
denetler. Tarayıcı sayımlarının doğru veya tam olduğunu **kanıtlamaz**.
Davranış alanları XP, doğru/yanlış veya ödül kurallarında kullanılmaz.

Test ekranında öğrenciye toplama bilgisi gösterilir. Öğretmen detayındaki rapor
yalnız sayımları ve inceleme notlarını gösterir; öğrenciye hileci etiketi verilmez.
Eski testlerde kayıt yokluğu sıfır davranış diye gösterilmez.

Tarayıcının ani kapanması/işletim sisteminin uygulamayı öldürmesi son yazımı
engelleyebilir. Bağlantı kesilirse kayıt eksik olabilir; quiz/XP bloke edilmez.
Firestore sunucu süresi mola, ağ gecikmesi ve testin sonradan açılmasını kapsar;
aktif düşünme süresi değildir. Tarayıcı gönderim verileri değiştirilebilir.

Bu aşamada mevcut test geçmişi saklama düzeni korunur; otomatik veri silme veya
TTL etkinleştirilmez. Canlı kullanımdan önce saklama süresi ve kurumun öğrenci/
veli bilgilendirmesi belirlenmelidir. Risk modeli gerçek örneklerle ayrıca
kalibre edilmeden 0–100 puan verilmez.

## Sonraki aşama sınırı

Soru/seçenek rastgele sıralama, yeni süre sınırları, tek aktif yarışma oturumu
ve benzer doğrulama soruları bu değişikliğe dahil değildir. Kritik yarışma
süreleri için `request.time` ve güvenilir Firestore kayıtları kullanılmalıdır;
tarayıcı ölçümü bu amaçla otorite yapılamaz. Başka cihazdan AI kullanımı
bu ölçümlerle kesin tespit edilemez. Yeni Cloud Functions/ücretli servis yoktur.

Bu değişiklik yerelde hazırlanmıştır; canlı Rules veya GitHub Pages yayını
bu görevde yapılmaz.

## Hedefli doğrulama

- `tests/quiz-behavior.test.mjs`: 5 test; süre, görünürlük, seçim değişikliği,
  sınırlar, sonuç ekranında sayımın durması ve geçmiş karşılaştırması.
- `tests/behavior-render.test.mjs`: 1 test; eski/yeni kayıtların 360×800 ve
  1366×900 rapor görünümü.
- `tests/behavior-isolated.test.mjs`: 3 test; Firestore erişim/sınır kuralları,
  cevap/XP korunması ve gerçek öğrenci/öğretmen tarayıcı ekranları. Yalnız
  `demo-test-arena-behavior`, Auth 9198, Firestore 8189 kullanır.

Yayın kopyasında 17 birim/import/render ve 3 izole emulator/browser testi
geçti (20/20). Canlı Firebase ayarlarıyla TypeScript/Pages build başarılıdır. Tarayıcı
testinde görünürlük olayları simüle edildi; gerçek Android/iOS arka plana alma
ve işletim sisteminin uygulamayı öldürmesi test edilmiş değildir. Test oturumu
Admin fixture ile hazırlandı; bu test tüm ders seçimi navigasyonunun regresyonu
değildir. Yeni rapor ve quiz ekranlarında console error/yatay taşma görülmedi.
Eşzamanlı öğretmen yönetimi çalışmaları nedeniyle bu sonuç geniş ortak test
paketinin tamamının geçtiği anlamına gelmez.
