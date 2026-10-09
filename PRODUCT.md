# TEST ARENA — Ürün Tanımı

## Ana Fikir

Test Arena, Türkiye'deki 2. sınıftan 12. sınıfa kadar öğrencilerin soru çözerek XP kazandığı ve kendi sınıf/gruplarındaki öğrencilerle yarıştığı eğitim uygulamasıdır.

Ana döngü:

Soru çöz → Doğru cevap ver → XP kazan → Sıralamada yüksel → Daha fazla soru çöz.

Slogan:

Çöz. XP kazan. Zirveye çık.

---

# Kullanıcı Rolleri

Tek uygulama vardır.

İki kullanıcı rolü bulunur:

1. Öğrenci
2. Öğretmen

Ayrı öğretmen ve öğrenci uygulaması oluşturulmayacaktır.

İlk açılışta:

- Öğrenci Girişi
- Öğretmen Girişi

seçenekleri gösterilir.

Kullanıcı giriş yaptıktan sonra oturum hatırlanır.

Çıkış yapıldığında tekrar rol seçim ekranına dönülür.

---

# Öğrenci Girişi

Öğrencinin e-posta veya şifre oluşturması gerekmez.

Öğretmen tarafından verilen benzersiz kısa kod kullanılır.

Örnek:

K7M4Q9

Öğrenci bir kez giriş yaptıktan sonra cihaz öğrenciyi hatırlayabilir.

Öğrenci çıkış yaparsa tekrar giriş ekranına döner.

Bu sayede aynı cihaz kardeşler tarafından da kullanılabilir.

---

# Öğretmen Girişi

Öğretmen:

- Google
- e-posta / şifre

ile giriş yapabilir.

Her öğretmenin verileri diğer öğretmenlerden tamamen ayrılmalıdır.

---

# Sınıf / Grup Sistemi

"Sınıf / Grup" ile "Kademe" aynı şey değildir.

## Sınıf / Grup

Öğretmenin özgürce oluşturduğu öğrenci grubudur.

Örnek:

- 6/A
- 6/B
- DOSTLAR
- LGS Grubu
- Salı Grubu
- Özel Ders
- Matematik Takımı

Öğretmen grup adını istediği şekilde belirleyebilir.

Bu grup öğrencinin kimlerle yarışacağını belirler.

## Kademe

Öğrencinin eğitim seviyesidir.

Örnek:

- 2. Sınıf
- 3. Sınıf
- ...
- 12. Sınıf

Kademe öğrencinin hangi soru içeriklerine erişebileceğini belirler.

Öğrenci kendi kademesini değiştiremez.

Kademe öğretmen tarafından belirlenir.

## Karma Sınıf

Öğretmen tek sınıf seçimini koruyabilir veya Karma Sınıf ile 1–12 arasından en az iki kademe seçebilir. Öğrenciler aynı grupta yönetilir ve yarışır; her öğrencinin `gradeLevel` değeri ayrı tutulur.

Karma grupta öğrenciler yalnız kendi kademelerinin ders, ünite ve testlerine erişir. Aşağıdaki kendi/önceki kademe kuralı tek sınıflı ve eski gruplarda korunur. Grup kademelerini düzenlemek mevcut öğrenci kademelerini veya geçmiş sonuçları değiştirmez.

---

# İçerik Erişim Kuralı

Öğrenci:

- kendi kademesinin
- bir önceki kademenin

tüm soru içeriklerine erişebilir.

Örnek:

6. sınıf öğrencisi:
- 5. sınıfın tamamını
- 6. sınıfın tamamını

çözebilir.

8. sınıf öğrencisi:
- 7. sınıf
- 8. sınıf

içeriklerini çözebilir.

2. sınıf öğrencisi yalnızca 2. sınıf içeriklerini görür.

Amaç öğrencinin çok düşük sınıf seviyesindeki kolay soruları çözerek XP kasmasını önlemektir.

---

# Soru Çözme Akışı

Öğrenci:

Kademe
→ Ders
→ Konu
→ Soru sayısı
→ Test

akışını kullanır.

Örnek:

6. Sınıf
   → Matematik
   → Kesirler
   → 20 soru

Soru sayısı seçenekleri:

- 10
- 20
- 30
- 50

---

# XP Sistemi

Temel kural:

1 doğru cevap = +1 XP

Yanlış cevap = 0 XP

Örnek:

20 soru
17 doğru
3 yanlış

Sonuç:

+17 XP

Bütün derslerden kazanılan XP aynı toplam XP hesabına eklenir.

Önceki sınıf seviyesindeki sorular da normal XP kazandırır.

---

# XP Suistimal Koruması

Öğrenci aynı kolay soruyu tekrar tekrar çözerek sınırsız XP kazanamamalıdır.

Sistem mümkün olduğunca öğrencinin henüz XP kazanmadığı soruları sunmalıdır.

Bir sorudan XP kazanımı için kalıcı kayıt tutulmalıdır.

Tekrar çözme öğrenme amacıyla mümkün olabilir fakat aynı soru sürekli XP üretmemelidir.

---

# Arena / Liderlik Sistemi

Öğrenci yalnızca bağlı olduğu sınıf/grubun sıralamasını görür.

Örnek:

DOSTLAR

1. Ece — 1820 XP
2. Mehmet — 1770 XP
3. Ahmet — 1725 XP
4. Kerem — 1680 XP

Öğrencinin kendi konumu belirgin gösterilir.

Örneğin:

3. sıradasın.

Mehmet'i geçmene 46 XP kaldı.

İleride iki sıralama kullanılabilir:

- Genel
- Bu Hafta

---

# Öğretmen Paneli

Sınıfı oluşturan öğretmenin tam yönetim erişimi sahiplik devrinde de korunur.
Davetle katılan aktif öğretmenler aynı sınıfta tam yönetim yetkisine sahiptir.
Yetkisiz hesaplar ve erişimi kaldırılmış davetliler sınıf verilerini yönetemez.

Öğretmen:

- sınıf/grup oluşturabilir
- sınıf/gruba kademe atayabilir
- öğrenci ekleyebilir
- öğrenci kısa kodunu görebilir
- öğrenciyi kaldırabilir
- öğrenci performansını inceleyebilir

Öğretmen sınıf içinde şunları görebilmelidir:

- öğrenci adı
- toplam çözülen soru
- doğru sayısı
- yanlış sayısı
- başarı oranı
- toplam XP
- sınıf sırası
- son dönem çalışma miktarı

Öğretmen öğrenci detayında:

- ders performansı
- konu performansı
- çalışma geçmişi

gibi verileri inceleyebilir.

---

# Soru İçeriği

Hedef:

MEB öğretim programına uyumlu özgün soru havuzu oluşturmaktır.

Soru üretim süreci:

MEB öğretim programı
→ öğrenme çıktısı
→ özgün soru üretimi
→ doğrulama
→ soru havuzu

Canlı olarak her öğrenci için yapay zekâya soru ürettirmek ana sistem değildir.

Önceden hazırlanmış ve doğrulanmış soru havuzu tercih edilir.

---

# Temel Ürün İlkesi

Test Arena'nın ana özelliği yalnızca oyunlaştırma değildir.

Ürünün temel farkı:

Öğrenci gerçek ders sorularını çözerek doğrudan XP kazanır ve kendi gerçek sınıf/grubundaki öğrencilerle yarışır.

Ana davranış hedefi:

"Biraz daha soru çözersem arkadaşımı geçebilirim."
