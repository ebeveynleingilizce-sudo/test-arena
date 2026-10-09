# Çok öğretmenli sınıflar

Sınıf sahibi ve davetle katılan öğretmenler aynı sınıf, öğrenci, kısa kod ve test kayıtlarını kullanır. Katılımcı sayısına uygulama sınırı konmaz. Öğrenci verileri başka öğretmenin alanına kopyalanmaz.

## Kullanım

Öğretmen davet işlemleri yalnız **Sınıflarım** ekranındadır. **Öğretmen Davet Et** ile kendi sınıflarınızdan bir veya birkaçını seçip **Davet Kodu Oluştur** düğmesine basın; oluşan kodu kopyalayın. **Davet Kodu ile Sınıfa Katıl** ayrı bir akıştır. Katılım sonrasında seçilen sınıflar bu listede görünür. Bekleyen davetler aynı bölümden iptal edilir. Ana panelde ve sınıf detayında davet alanı bulunmaz.

Bir kod en fazla beş sınıfı kapsar; Firestore işlem ve güvenlik kuralı okuma sınırları içinde tüm üyelikler tek atomik işlemle açılır. Daha fazla sınıf için ayrı kod oluşturulur. Kod, bir öğretmen tarafından kullanılabilir. Eski tek sınıflı kodlar çalışmaya devam eder. Sınıf yönetimi bölümünde mevcut öğretmen erişimini kaldırabilir, etkinlikleri yönetebilir ve işlem geçmişini inceleyebilirsiniz. Öğrenci satırındaki **XP / yıldız** düğmesi, gerekçeli verme ve geri alma işlemlerini kaydeder.

Kurucu ve davetle katılan aktif öğretmenler öğrenci ekleyebilir, ad/kademe/grup düzenleyebilir, kaldırabilir, kısa kod yenileyebilir, test/gelişim verilerini görebilir, sınıf bilgilerini değiştirebilir ve öğretmen davet edebilir. Sınıf silme ve sahiplik devri dahil tam yönetim yetkileri sınıf bazında uygulanır. Sınıfı oluşturan öğretmenin erişimi sahiplik devrinde de korunur; kurucu üyelikten çıkarılamaz. Kalıcı silmenin sınıf adıyla açık onay şartı korunur.

## Veri ve güvenlik

- Kanonik yollar `teachers/{storageUid}/classes/{classId}` ve `teachers/{storageUid}/students/{studentId}` olarak kalır. `storageUid`, sahiplik devrinde değişmez.
- `ownerUid` güncel sahibi, `createdBy` kurucuyu gösterir. Sınıftaki `teacherMembers/{uid}` belgeleri yetkiyi belirler.
- `teacherClassAccess/{uid}/classes/{storageUid}~{classId}` yalnız erişim adreslerini içerir. Panel sınıf/öğrenci/kod değişikliklerini Firestore dinleyicileriyle izler; erişim kaldırıldığında paneldeki veriler temizlenir.
- 120 bit rastgele davet kodunun SHA-256 özeti belge kimliğidir. Açık davet kodu saklanmaz. Davet 24 saat geçerli, tek kullanımlı ve iptal edilebilirdir. Süre ve katılım Security Rules tarafından sunucu saatiyle kontrol edilir.
- Öğretmen değişiklikleri aynı atomik işlemde `audit/{id}` kaydı ve `lastActionId` içerir. Kayıtta kimlik, e-posta, işlem, hedef ve sunucu zamanı vardır. İstemci geçmişi değiştiremez/silemez veya başka öğretmeni aktör gösteremez.
- `teacherXP` öğretmen ayarlamasıdır; akademik kazanımları değiştirmez. `totalXP = academicXP + teacherXP`. Yıldız sayısı ve toplam XP negatif olamaz. Bir doğru cevap hâlâ +1 akademik XP kazandırır; tekrar kazanım engeli ve akademik Arena sıralaması korunur.
- Öğrenci kaldırma ve öğretmen erişimini kaldırma geçmişi korur. **Sınıfı sil** yalnız aktif/pending öğrencisi olmayan sınıf kaydını siler, kaldırılmış öğrencilerin geçmişini korur. **Kalıcı sil** sınıf adını yazarak onay gerektirir, öğrenci verilerini de siler. Silme işleminin denetim kaydı güncel sahibin erişebildiği arşivde kalır.

## Doğrulama ve geçiş

`node scripts/teacher-sharing-test-isolated.mjs` ayrı `demo-test-arena-teacher-sharing` projesi ve 29299/28280 portlarını kullanır. Mevcut test/XP/duello/öğrenci girişlerini, davet ve yetki saldırılarını, erişim iptalini, sahiplik devrini, kalıcı silmeyi, mobil/masaüstü ortak paneli ve eski veri geçişini sınar. Tarayıcı görüntüleri `test-results/teacher-sharing` altına yazılır.

Eski sınıflar için geçiş yalnız eksik sahiplik, üyelik ve erişim belgelerini ekler. Öğrenci kayıtları, kısa kodlar, XP ve Auth bağlarının SHA-256 parmak izi önce/sonra karşılaştırılır. Tekrar çalıştırılabilir; devredilmiş sahipliği değiştirmez. Uygulamadan önce değiştirilecek sınıf metadata yedeği `.firebase/teacher-sharing-migration` altında tutulur.

```
node scripts/migrate-teacher-sharing.mjs --production
node scripts/migrate-teacher-sharing.mjs --production --apply
node scripts/spark-rules.mjs --write
npm run build
firebase deploy --project production --only firestore:rules,hosting
```

İlk komut salt okunur ön kontroldür. Canlı geçiş ve yayın ayrı test ortamında doğrulama tamamlandıktan sonra yapılır. Geçiş öğrenci giriş bilgilerini yenilemez.

## Tamamlanan doğrulama — 9 Ekim 2026

- Ayrı demo ortamında 22/22 test geçti. Mobil (360 px) ve masaüstü (1366 px) ortak panel, ödül penceresi, öğrenci/test/düello akışları ve konsol kontrolleri başarılı.
- Üretim derlemesi ve Firebase kurallarının bulutta derlenmesi başarılı.
- Canlı 4 sınıfın erişim metadata geçişi yapıldı. 15 öğrenci, kısa kod, XP ve Auth bağı için önce/sonra SHA-256 aynı. Tekrar ön kontrolde güncellenecek sınıf sayısı 0.
- Hosting ve Firestore Security Rules yayınlandı: https://test-arena-20261008.web.app
- `node scripts/teacher-sharing-live-check.mjs` canlı paketin derlemeyle eşleştiğini, girişsiz erişimin reddedildiğini ve mobil/masaüstü giriş ekranlarında konsol hatası olmadığını doğruladı.
- Silme yarım kalırsa sınıf sahibinin panelinde kurtarma adımı görünür. Silme arşivi, aktif bir sınıfta erişimi kaldırılmış eski sahibin verilere tekrar erişmesine izin vermez.
