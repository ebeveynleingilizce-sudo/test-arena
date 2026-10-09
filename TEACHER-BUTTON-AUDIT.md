# Öğretmen paneli — buton incelemesi

9 Ekim 2026. İncelenen alanlar: giriş ekranı, ana panel, sınıf listesi/detayı, öğrenci yönetimi ve performans raporları.

## Bu görevde tamamlanan

- **Sınıfı sil**: Sınıflarım listesindeki her sınıfın altında ve sınıf detayındaki yönetim butonları arasında bulunur.
- Sınıf adıyla açık onay ve Vazgeç seçenekleri vardır. Onaydan önce hiçbir kayıt silinmez.
- Aktif veya kayıt işlemi devam eden öğrencisi olan sınıf silinmez. Öğretmen önce öğrencileri Düzenle ile başka sınıfa taşımalı veya Kaldır ile erişimini kapatmalıdır.
- Kaldırılmış öğrenci kayıtları ve öğrenme geçmişi korunur; bu işlem yalnız sınıf belgesini siler. Firestore alt koleksiyonları toplu temizlenmez.
- Sunucu verisine göre tekrar kontrol edilir. Kontrol sırasında sınıf `deleting` durumuna alınır; yeni öğrenci ekleme ve taşıma engellenir. Dolu sınıf kontrolü başarısız olursa durum tekrar aktif yapılır. Bağlantı kesilirse boş sınıf silme aynı butondan yeniden denenebilir.
- Yalnız sınıfın sahibi öğretmen işlem yapabilir. Başarıyla silinince Sınıflarım ekranına dönülür.
- Çok öğretmenli yapıda depolama sahibinin `storageUid` değeri kullanılır; sahiplik devrinden sonra yetki yeni sahibine geçer. Diğer öğretmenlerde silme butonu devre dışıdır.
- Sınıf yönetimindeki **Sınıfı ve verilerini kalıcı sil** ayrı bir işlemdir: sınıf adını yazdırır ve öğrenci geçmişini de siler. Normal **Sınıfı sil** boş sınıf işlemi geçmişi korur.

## Hâlâ eksik / iyileştirme gereken işlemler

1. **Şifremi unuttum**: öğretmen e-posta giriş ekranında parola sıfırlama işlemi yok.
2. **Kod yenileme onayı**: Kodu yenile tek tıkla çalışıyor; önceki kısa kod ve oturumlar iptal edilmeden önce ayrı onay gösterilmiyor.

Bu iki işlem bu görevde eklenmedi. Önceki incelemede eksik olan sınıf düzenleme ve öğrenci ad/soyad düzeltme diğer çalışmalarda tamamlandı. Diğer mevcut butonların kodda bağlı işlem veya gezinme hedefleri var: sınıf oluşturma/düzenleme, tek/toplu öğrenci ekleme, kısa kod kopyalama, öğrenci kaldırma, öğrenci detayı, rapor sekmeleri/filtreleri, öğretmen daveti, sahiplik devri ve verileri yenileme.

## Doğrulama

- Son yapı üzerinde sonuç: **22/22 regresyon testi geçti**. Ayrı sınıf silme tarayıcı akışları telefon (390×844) ve masaüstünde (1366×900) geçti; konsol hatası ve yatay taşma yok. Kaldırılmış öğrencinin 7 XP'lik örnek geçmişi silme sonrasında korundu; ortak öğretmende silme butonu devre dışı doğrulandı.
- İlk denemede yerel tarayıcı sayfası yükleme bekleyişi zaman aşımına uğradı. Testin ilk gezinmesi `domcontentloaded` ve 60 saniye sınırıyla güncellendi; tekrar çalıştırma başarılı oldu.
- `npm run build`
- `node scripts/class-delete-test-isolated.mjs`: mevcut Spark regresyonlarını ve yeni silme testini ayrı demo projesinde çalıştırır; ardından telefon ve masaüstü tarayıcı akışını kontrol eder.
- Silme testleri: boş sınıf silme, onaydan vazgeçme, dolu/pending sınıf koruması, öğrenciyi taşıdıktan sonra silme, geçmişin korunması, başka öğretmen/öğrenci erişiminin reddedilmesi ve silme sırasında ekleme/taşıma koruması.
- Tarayıcı testleri: listede/detayda butonlar, onay ve vazgeçme, dolu sınıf uyarısı, başarılı silme ve geri dönüş, yatay taşma ve console error kontrolü. Görseller `artifacts/class-delete` altında saklanır.

Bu görev commit, push veya canlı yayın yapmadı. Diğer çalışmanın yayını bu rapordaki yerel testlerin yerine geçmez.

## Canlı yayın
9 Ekim 2026: Kullanıcının talebiyle test-arena-20261008 projesine yayınlandı. Eşzamanlı dist derlemelerinden korunmak için .release/class-delete-20261009 paketi kullanıldı. 180 canlı dosyanın tamamı paketle eşleşti; Firestore kuralları eşleşti. Canlı telefon/masaüstü giriş kontrolü ve yetkisiz erişimin reddi geçti, konsol hatası yok. Commit veya push yapılmadı.
