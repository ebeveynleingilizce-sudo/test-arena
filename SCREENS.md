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

---

## 19 — Öğrenci Detayı

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

Göster:

- toplam öğrenci
- toplam çözülen soru
- ortalama başarı
- ortalama XP
- en aktif öğrenciler
- geride kalan öğrenciler

---

## 21 — Ders / Konu Analizi

Öğretmenin sınıf bazında konu performansını incelemesini sağlar.

Örnek:

Matematik

Kesirler — %85
Ondalık Gösterim — %72
Oran — %68

Amaç öğretmenin yalnızca yarış sıralamasını değil öğrenme durumunu da görebilmesidir.
