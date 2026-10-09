# Sınıf erişimi ve tam öğretmen yetkisi

## Doğrulanan hata

İki canlı origin farklı uygulama sürümlerini çalıştırıyordu. GitHub Pages paketi
öğretmenin namespace'i altındaki tüm sınıf ve öğrencileri eski sorgularla okuyor,
işlemleri yeni denetim kaydı olmadan yazıyordu. Firebase Hosting paketi ise
`teacherClassAccess`, sınıf bazlı üyelik ve atomik audit işlemlerini kullanıyordu.
Yeni Firestore kuralları yalnız yeni istemci akışlarıyla test edilmişti.

Canlıdan alınan özel metadata kopyası ve yayınlanmış kurallar emülatörde test
edildi. Eski sınıf/öğrenci liste sorguları `permission-denied` aldı; aynı UID'nin
erişim bağlantıları ve sınıf bazlı öğrenci sorguları çalıştı. Auth UID, kanonik
storage UID, `ownerUid`, `createdBy`, aktif üyelik ve erişim bağlantıları
eşleşiyordu. `ownerId`/`teacherId` alanları bu modelde kullanılmıyor. Sınıflar
silinmemişti; veri taşıma veya kimlik değiştirme gerekmiyordu.

## Düzeltme

- Kurucu namespace'indeki sınıf/öğrenci listeleri yalnız aynı UID'nin öğretmen
  hesabına açıktır. Başka namespace'teki sınıflar ancak sınıf sahibi, kurucusu
  veya davetle katılan aktif üyesi tarafından okunur/yönetilir.
- Kurucu `createdBy` üzerinden yetkilidir; alanı olmayan eski sınıflarda
  değişmeyen kanonik storage UID kullanılır. İstemci kurucuyu değiştiremez.
- Sınıf keşfi kendi namespace'i ile erişim indeksini birleştirir. Eksik indeks
  kurucunun kendi sınıfını görünmez yapmaz. Geçersiz/eski paylaşım bağlantısı
  diğer sınıfların listelenmesini durdurmaz.
- Öğrenci/kod alt sorgusunda hata, sınıfı listeden silmez. Hata ilgili alan için
  görünür olur. Sınıf erişimi gerçekten iptal edildiğinde yetkisiz veriler temizlenir.
- Kurucu ve aktif davetliler tam yönetim yetkisine sahiptir. Sahiplik devri,
  sınıf silme ve kalıcı silme kontrolleri hem Firestore hem arayüzde buna uyar.
  Kurucu üyelikten çıkarılamaz; davetlilerin erişimi iptal edilebilir.
- Audit, davet süresi/tek kullanımlılık, onaylı kalıcı silme, öğrenci kademe ve XP
  korumaları sürer. Eski denetimsiz yazmalar serbest bırakılmaz; eski origin'e
  de yeni uygulama paketi yayınlanır.

## Doğrulama

`tests/teacher-sharing-cases.mjs` kurucu keşfi, sahiplik devrinden sonra erişim,
eksik indeks/üyelik, davetli tam yönetim, sahte üyelik/index yazmalarının reddi,
başka sınıfa erişimin reddi ve erişim iptalini sınar. Mevcut öğrenci giriş/quiz,
XP, düello ve paylaşım regresyonları `npm test` ile birlikte çalışır.

Canlıya ait özel metadata kopyaları ve ekran görüntüleri `.firebase/class-access/`
altında gitignore kapsamındadır. Canlı öğrenci/kod/XP verilerine yazılmaz;
sınıf düzenleme ve silme testleri yalnız ayrı demo emülatöründe yapılır.

Doğrulama sonucu: ana emülatör paketi 23/23, viewport/PWA/ortam/kademe/davranış kontrolleri 19/19 geçti. Canlı metadata kopyasında iki sınıf ve 10 aktif öğrenci okunabildi; 360 ve 1366 piksel genişliklerinde giriş, sınıf görünürlüğü, sınıf düzenleme ve yönetim ekranı başarılıydı, console hatası yoktu. Bu oturum canlı hesabın şifresiyle değil izole emülatör kimliğiyle yapıldı.
