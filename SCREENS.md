# TEST ARENA — SCREEN SPECIFICATIONS

## 01 — Açılış / Rol Seçimi

Amaç:

Kullanıcının öğrenci veya öğretmen olduğunu seçmesi.

Göster:

- Test Arena marka alanı
- slogan
- Öğrenci Girişi
- Öğretmen Girişi

Çıkış yapan kullanıcı bu ekrana dönmelidir.

---

## 02 — Öğrenci Kod Girişi

Göster:

- kısa kod giriş alanı
- Giriş Yap

Öğrenci bağlantısı veya URL isteme.

Öğrenci yalnızca kısa kod kullanmalıdır.

Başarılı girişten sonra oturum cihazda hatırlanabilir.

---

## 03 — Öğrenci Ana Ekranı

2. sezon duyurusu yalnız doğrulanmış öğrenci oturumunda bu ana ekranda açılır. Onay/kapatma, mevcut profil aboneliği üzerinden izlenen `season2WelcomeSeen` alanına tek durum yazması yapar; ek sorgu açılmaz ve diğer cihazlarda yeniden gösterilmez. Kapatınca rota değişmez. Sıfırlama ve eşit başlangıç cümleleri yalnız doğrulanmış 33 öğrenci kapsamı için kullanılır; diğer öğrenciler genel yeni sezon metnini görür. Duyuru XP veya geçmiş sıfırlamaz. Giriş ve öğrenci rotalarında bakım ekranı gösterilmez.

Göster:

- öğrenci adı
- sınıf/grup adı
- kademe
- toplam XP
- sınıf sırası
- bir üst sıradaki öğrenciye kalan XP
- günlük soru hedefi
- Soru Çöz CTA

Örnek:

Ahmet

DOSTLAR
6. Sınıf

1725 XP

#3

Mehmet'i geçmene 46 XP kaldı.

---

## 04 — Kademe Seçimi

Öğrenci yalnızca izin verilen kademeleri görür.

PRODUCT.md ana kaynaktır. Kademe erişim kuralı:

- 2. sınıf öğrencisi yalnızca 2. sınıf içeriklerine erişebilir.
- 3–12. sınıf öğrencisi kendi kademesine ve bir önceki kademeye erişebilir.

Örnek 6. sınıf öğrencisi:

6. Sınıf — Güncel

5. Sınıf — Tekrar

6. sınıf öğrencisi 7. sınıf içeriğine erişemez.

Kademe öğrenci tarafından değiştirilemez.

---

## 05 — Ders Seçimi

Seçilen kademeye ait dersleri göster.

Örnek:

- Matematik
- Türkçe
- Fen Bilimleri
- Sosyal Bilgiler
- İngilizce

---

## 06 — Konu Seçimi

Seçilen derse ait konuları göster.

Mümkünse:

- çözülen soru
- başarı oranı

gibi ikincil bilgi gösterilebilir.

---

## 07 — Soru Sayısı

Seçenekler:

10
20
30
50

Başla CTA.

---

## 08 — Soru Çözme

Öğretmen Soru Bankası da varsayılan olarak aynı soru ve seçenek görünümünü kullanır. Kademe/ders/ünite seçimi, soru sayacı ve ilerleme göstergesi bulunur. Öğretmen cevap seçmeden önceki/sonraki soruya geçebilir; **Doğru cevabı göster** ve **Cevabı gizle** yalnız yerel inceleme durumunu değiştirir. Seçenek işaretlemek isteğe bağlıdır. Öğretmen incelemesi test sonucu, davranış kaydı veya XP oluşturmaz. Sonraki soru sayfası açık istekle yüklenir. Mevcut tam ekran ve hata bildirme korunur. Yetkili yöneticilerin eski düzenleme araçları **Soru yönetimini aç** arkasındadır; yetkiler değişmez.

Göster:

- ders
- konu
- mevcut soru / toplam soru
- ilerleme göstergesi
- soru
- cevap seçenekleri

Soru okunabilirliği her şeyden önemlidir.

---

## 09 — Doğru Cevap

Doğru cevap sonrası:

+1 XP

görsel olarak hissedilmelidir.

Kısa mikro animasyon kullanılabilir.

Gereksiz uzun kutlama yapılmamalıdır.

---

## 10 — Yanlış Cevap

Yanlış cevap:

0 XP

Doğru cevap gösterilebilir.

Çözümü Gör özelliği desteklenebilir.

---

## 11 — Test Sonucu

Göster:

- toplam soru
- doğru
- yanlış
- başarı oranı
- kazanılan XP
- sıralama değişimi

Örnek:

17 / 20

+17 XP

#4 → #3

---

## 12 — Arena

Öğrencinin kendi sınıf/grup sıralaması.

Göster:

- grup adı
- kademe
- öğrenci sayısı
- sıralama
- kendi öğrenci satırı
- XP değerleri

İleride:

Genel
Bu Hafta

sekmeleri olabilir.

---

## 13 — Öğrenci Profil

Göster:

- öğrenci adı
- grup
- kademe
- toplam XP
- çözülen soru
- başarı
- sıralama
- Çıkış Yap

---

## 14 — Öğretmen Girişi

Destek:

- Google ile giriş
- e-posta / şifre

Öğrenci kısa kod sistemiyle karıştırılmamalıdır.

---

## 15 — Öğretmen Ana Panel

**Soru Bankasını Güncelle** yalnızca `tunc@test.com` hesabında ve mevcut soru bankası admin yetkisi doğrulanınca görünür. Tek düğme GitHub'daki private soru deposunun yeni/değişmiş JSON dosyalarını sunucu üzerinden senkronize eder; düzenleme veya dosya seçme ekranına yönlendirmez. Diğer öğretmenlerin ana paneli bu alan için ek yetki sorgusu açmaz. Yeni soru sayısı ve hatalı dosyalar kısa bir sonuçta gösterilir. Sunucu bağlantısı ve Secret yapılandırması tamamlanmadan canlı senkronizasyon kullanılamaz.

Göster:

- öğretmenin sınıfları
- toplam öğrenci
- güncel çalışma istatistikleri
- hızlı sınıf erişimi

Öğretmen paneli öğrenci ekranından daha veri odaklı olabilir.

---

## 16 — Sınıflar

Öğretmenin oluşturduğu grupları göster.

Örnek:

6/A
6/B
DOSTLAR
LGS Grubu

Her grup için:

- grup adı
- kademe
- öğrenci sayısı

gösterilebilir.

Sınıf Oluştur bulunmalıdır.

Öğretmen davet işlemleri yalnız bu ekranda bulunur: **Öğretmen Davet Et** ve **Davet Kodu ile Sınıfa Katıl** iki ayrı işlemdir. Davet oluştururken kendi sınıflarından en fazla beşi çoklu seçimle belirlenir; **Davet Kodu Oluştur**, kod kopyalama ve bekleyen davetleri iptal etme bulunur. Kodla katılan öğretmen yalnız seçilen sınıflarda tam yönetim yetkisi kazanır; bu sınıflar Sınıflarım listesine eklenir. Ana panelde ve sınıf detayında davet oluşturma/katılma alanı gösterilmez.

Sınıf oluşturma ve düzenlemede Tek Sınıf / Karma Sınıf seçimi bulunur. Karma Sınıf için 1–12 arasından en az iki kademe seçilir. Öğrenci eklerken karma grubun kademeleri arasından öğrencinin kendi kademesi atanır. Toplu eklemede listeye uygulanacak kademe açıkça seçilir.

Öğrenci listesi, grup genel bakışı ve konu analizi kademe filtresini destekler. Grup seçiminden çıkarılan kademelerdeki mevcut öğrenciler korunur; yeni atama için kademe tekrar seçilmelidir.

---

## 17 — Öğrenci Ekleme

ÖNEMLİ:

Sınıf / Grup ve Kademe farklı kavramlardır.

Alanlar:

Sınıf / Grup:
DOSTLAR

Kademe:
6. Sınıf

Ad:
Ali

Soyad:
Yılmaz

Öğrenci oluşturulduğunda benzersiz kısa kod gösterilir.

Örnek:

K7M4Q9

---

## 18 — Öğrenci Listesi

Göster:

- öğrenci adı
- kısa kod
- XP
- sıra

Öğretmen öğrenciyi seçerek detayına gidebilir.

Öğrenci bağlantısı gösterilmemelidir.

Kısa kod yeterlidir.

Yeni eklenen veya kodu bu ekranda yenilenen öğrenci, yalnızca istemci durumunda listenin başına taşınır. İlgili satır görünür alana kaydırılır; gerekiyorsa kademe filtresi tüm kademelere döner. Toplu eklemenin başarılı öğrencileri de başa alınır. Sıralama için Firestore alanı veya sorgusu eklenmez.

Sınıf yönetimindeki **Sınıf Öğretmenleri**, mevcut üyelik aboneliğini kullanır. Kurucu, sahip ve aktif davetliler gösterilir; mevcut öğretmen **Siz** etiketiyle belirtilir. Hazır kayıtta veya mevcut Auth oturumunda ad varsa kullanılır, yoksa e-posta ve eksik ad açıklaması gösterilir. Ad bilgisi için ek sorgu açılmaz.

---

## 19 — Öğrenci Detayı

Öğrenci adına tıklandığında seçilen öğrencinin genel, haftalık, ders, ünite ve konu analizi tek seferde otomatik yüklenir. Genel görünümde tüm analiz bölümleri birlikte gösterilir. Öğrenci detayındaki dönem, ders, ünite ve sekme değişimleri hazır veri üzerinde uygulanır; tekrar Raporu göster düğmesi gerektirmez ve yeni analiz sorgusu başlatmaz. Test geçmişi ilgili bölümde istek üzerine sayfalanır. Sınıf genel raporunun butonla yüklenmesi korunur.

Hazır raporda **PDF indir** bulunur. Öğrenci PDF'si sekmeden bağımsız olarak tüm ders, ünite ve konu istatistiklerini genel ve haftalık ayrı tablolar halinde içerir; ekranın yerel filtresi PDF'yi daraltmaz. Dosya hazır veriden tarayıcıda oluşturulur; yeni Firestore sorgusu açılmaz. Raporda öğrenci kimliği, kapsam ve hazırlama zamanı yer alır. En az beş yanıt bulunan konulardan güçlü alanlar ve tekrar önerileri hesaplanır. Eksik boş sayısı, dönem başlangıcı ve günlük gelişim verisi uydurulmaz. Test geçmişi ayrı sayfalı akıştır; yalnızca daha önce açılmış ve yüklenmiş sayfalar PDF'ye dahil edilebilir. Kısmi geçmişin kapsamı açıkça belirtilir; PDF yeni geçmiş sorgusu başlatmaz.

Göster:

- öğrenci adı
- grup
- kademe
- toplam XP
- toplam çözülen
- doğru
- yanlış
- başarı
- sınıf sırası
- son çalışma performansı

---

## 20 — Sınıf Genel Raporu

Sınıf/kademe/dönem seçimi tek başına analiz sorgusu başlatmaz. **Raporu göster** ile mevcut doğrulanmış genel sayaçlar yüklenir. Kısa süreli tekrar açılışlarda mevcut önbellek ve güncel yetki kontrolü korunur. **Verileri yenile** güncel veriyi açıkça ister; son rapor zamanı gösterilir.

Göster:

- toplam öğrenci
- toplam çözülen soru
- ortalama başarı
- ortalama XP
- en aktif öğrenciler
- geride kalan öğrenciler

---

## 21 — Ders / Konu Analizi

Ders/ünite/dönem seçimleri taslak olarak tutulur; **Raporu göster** ile birlikte uygulanır. Ders ve ünite seçenekleri ilk istenen ayrıntılı rapordan elde edilir. Dersler/Konular arasında aynı yüklü boyut verisi kullanılabilir. Genel rapor açılırken ders/konu geçmişi okunmaz.

Öğretmenin sınıf bazında konu performansını incelemesini sağlar.

Örnek:

Matematik

Kesirler — %85
Ondalık Gösterim — %72
Oran — %68

Amaç öğretmenin yalnızca yarış sıralamasını değil öğrenme durumunu da görebilmesidir.
