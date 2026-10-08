# TEST ARENA — AGENT INSTRUCTIONS

Bu repository Test Arena uygulamasıdır.

Her görevden önce:

1. PRODUCT.md dosyasını oku.
2. DESIGN.md dosyasını oku.
3. SCREENS.md içinde ilgili ekranı oku.
4. design-reference/test-arena-master.png görselini incele.
5. Mevcut kodu incele.
6. Ardından değişiklik yap.

---

# Temel Kural

Çalışan özellikleri gereksiz yere yeniden yazma.

Bir UI görevi verildiğinde:

Firebase,
authentication,
veri modeli,
security rules

gibi çalışan sistemleri yalnızca görsel değişiklik yapmak için değiştirme.

---

# Scope Kontrolü

Kullanıcı hangi ekranı veya özelliği istediyse yalnızca gerekli alanlara müdahale et.

Örneğin:

"Öğrenci Ana Ekranı'nı düzelt"

denildiğinde öğretmen panelini yeniden tasarlama.

---

# Görsel Referans

Ana görsel kaynak:

design-reference/test-arena-master.png

Bu görsel mutlaka incelenmelidir.

Ancak görsel uygulamaya arka plan resmi olarak yerleştirilmemelidir.

UI gerçek HTML/CSS bileşenlerinden oluşturulmalıdır.

---

# Tasarım

DESIGN.md zorunlu tasarım sözleşmesidir.

Özellikle:

- lacivert + turuncu / altın
- sıcak krem yüzey
- kompakt CTA
- yaş bağımsız görünüm
- Arena kimliği

korunmalıdır.

Klasik parlak teknoloji mavisini ana UI rengi olarak kullanma.

Duolingo'yu birebir kopyalama.

Pixel / Minecraft UI oluşturma.

Aşırı büyük butonlar kullanma.

Her bilgiyi ayrı karta koyma.

---

# Responsive

Mobile-first çalış.

Her değişiklikte en az:

- telefon
- masaüstü

görünümünü kontrol et.

Yatay overflow oluşturmamalıdır.

---

# Veri Kuralları

Sınıf / Grup ile Kademe farklıdır.

Örnek:

className = "DOSTLAR"

gradeLevel = 6

Bunları tek veri alanına dönüştürme.

Öğrenci kendi gradeLevel değerini değiştirememelidir.

---

# XP

Temel kural:

1 doğru = +1 XP

Yanlış = 0 XP

Aynı sorudan sınırsız XP kazanılmasını engelleyen sistemi bozma.

---

# Öğrenci Girişi

Öğrenci kısa kodla giriş yapar.

Öğrenci bağlantısı zorunlu değildir.

Öğretmen panelinde öğrenci için bağlantı göstermek yerine kısa kod gösterilir.

---

# Öğretmen Girişi

Öğretmen authentication sistemi öğrenci kısa kod sisteminden ayrıdır.

Farklı öğretmenlerin verileri birbirine karışmamalıdır.

---

# Test

Değişiklik tamamlandıktan sonra:

- ilgili akışı test et
- mevcut testleri çalıştır
- console error kontrol et
- mobil responsive görünümü kontrol et
- desktop görünümü kontrol et

Bir hata varsa mümkünse görev tamamlanmadan düzelt.

---

# Git

Kullanıcı açıkça istemediği sürece:

- commit yapma
- push yapma
- branch oluşturma

Değişiklikleri ve test sonuçlarını raporla.

---

# Öncelik

Çelişki durumunda:

1. Kullanıcının son açık talimatı
2. PRODUCT.md
3. DESIGN.md
4. SCREENS.md
5. mevcut uygulama davranışı

önceliklidir.
