# Karma sınıf geçişi

Grup kayıtlarına isteğe bağlı `classMode: single | mixed` ve `gradeLevels: number[]` eklenir. `defaultGradeLevel` korunur. Eski gruplar değiştirilmez; alanları olmayan grupların kademe atama ve kendi/önceki kademe erişimi sürer.

Yeni tek sınıflı gruplarda bir kademe (2–12), karma gruplarda en az iki farklı kademe (1–12) kaydedilir. Öğrenci `gradeLevel` alanı bağımsız kalır. Karma gruptaki yeni atamalar grubun seçili kademeleriyle doğrulanır; Firestore kuralları doğrudan SDK yazılarını da denetler.

Karma grupta katalog, soru, test şablonu, test başlatma ve cevap/XP yetkisi öğrencinin kendi kademesine bağlıdır. 1. sınıf için katalog yoksa boş içerik durumu gösterilir; soru üretilmez.

Grup düzenleme öğrenci kademelerini değiştirmez. Seçimden çıkarılmış bir kademedeki mevcut öğrenciler ve tarihçe korunur; yeni atama için kademe tekrar seçilmelidir. Grup türü değişimi gelecekteki içerik erişimini etkiler. Test sonuçları, cevaplar, XP kayıtları ve kimlikler taşınmaz veya silinmez.

Rapor filtresi öğrencinin güncel kademesine göre öğrenci altkümesini seçer; bu öğrencilerin geçmiş çalışma toplamlarını ve ders/konu boyutlarını birlikte hesaplar. Grup Arena sırası tüm grup üzerinden kalır.

Yayın sırası: geriye uyumlu Firestore kuralları, eksik öğretmen erişim indekslerinin geçişi, sonra uygulama. Öğrenci veya sonuç göçü gerekmez. Yerel soru importer, eski gruplar için eksik `teacherClassAccess` indeks bağlantılarını ekler; grup/öğrenci kayıtlarını değiştirmez. Canlı ortamda eski grupların erişim indeksleri yoksa mevcut `scripts/migrate-teacher-sharing.mjs` geçişi önce plan olarak incelenmeli; uygulama sırasında yedek ve öğrenci verisi parmak izi karşılaştırması kullanılmalıdır. Geri dönüşte ek alanlar ve öğrenciler korunmalıdır; 1. sınıf ve karma erişimi eski istemcide desteklenmez.
