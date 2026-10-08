# Düello modu

Öğrenci → Arena → Düello. Aynı öğretmenin aynı sınıfındaki çevrimiçi öğrenciler birbirine davet gönderir. Mevcut kısa kod girişi, importer, soru bankası ve öğrenme geçmişi korunur.

- Çevrimiçi sinyali 25 saniyede bir yenilenir; 75 saniyedir yenilenmeyen öğrenciler listeden çıkar.
- Davet 60 saniye geçerlidir. İki öğrenci slotu tek transaction ile kilitlenir; eşzamanlı davetler kabul edilmez. Yalnız davet edilen öğrenci kabul veya ret verebilir.
- Mevcut aktif 10 soruluk test paketlerinden biri seçilir. Güvenlik kuralları paketin kademesine iki öğrencinin de erişebildiğini doğrular.
- Kabulden 10 saniye sonra başlanır. Aynı soru sırası ve sunucu zamanına göre 30 saniyelik 10 tur kullanılır. Erken cevap veren öğrenci tur bitene kadar bekler.
- Doğru cevap 1000 yarışma puanı, kalan her tam saniye 10 ek puan getirir (en fazla 300). Yanlış/boş/zamanında gönderilmeyen cevap 0 yarışma puanı getirir. Puan, değiştirilemeyen sunucu gönderim zamanı ve mevcut doğrulanmış quiz sonucu üzerinden hesaplanır.
- Yarışma puanı XP değildir. PRODUCT.md gereği ilk kez doğru çözülen soru +1 XP getirir; yanlış ve tekrar doğru cevap +0 XP. Kazanma veya katılım bonusu ve öğretmenin XP oranını değiştirmesi eklenmedi.
- Düello kayıtları ve iki öğrencinin normal quiz oturumları saklanır. Sonuçlar Düello geçmişinden açılır. Bağlantı kaybında süre işlemeye devam eder; dönüşte kaçırılan sorular boş kaydedilir ve tamamlanan quiz XP'si mevcut sistemle eşitlenir.
- Süresi dolan davetler `expired`, biten yarışmalar `completed` durumuna geçirilir. Aktif öğrenciler durum güncellemesini yapar; herkes çevrimdışıysa güncelleme bir katılımcının dönüşünde yapılır. Slot uygunluğu ayrıca sunucu zamanından kontrol edildiğinden eski durum yeni daveti engellemez.

## Spark güvenlik sınırı

Doğru cevap düello arayüzünde gösterilmez. Ancak mevcut Spark quiz altyapısı kilitlenen bir cevap sonrasında o sorunun anahtarını ilgili öğrenciye açar. Daha önce çözülmüş soruların cevapları da bilinebilir. Bu nedenle istemci araçları veya ikinci bir normal quiz üzerinden cevap öğrenmeyi bütünüyle engelleyen bir sınav güvenliği sunulmaz. İstemci hesapladığı puanı doğrudan yazamaz; güvenlik kuralları quiz doğruluğunu ve gönderim aralığını doğrular. Güvenilir, gizli ve tüm yarışma bitene kadar açılmayan değerlendirme için ayrı bir güvenilir sunucu bileşeni gerekir.

Geçici bağlantı kesilmelerinde sonuç ekranı cevap kayıtları geldikçe güncellenebilir. İstemci saati başlangıçta Firestore sunucu zamanıyla eşitlenir; ağ gecikmesi tam milisaniye eşzamanlılığı sağlamaz. Son gönderim kabulü sunucu zamanına bağlıdır.

## Dosyalar ve doğrulama

`src/features/Duel.tsx`, `src/app/DuelLobby.tsx`, `src/data/duel.mjs` ve `src/ui/duel.css` entegrasyonu içerir. `prototypes/spark/duel.rules.fragment` kuralları `scripts/spark-rules.mjs` ile mevcut Spark kurallarına eklenir.

- `npm run build`
- `npm test` — mevcut Spark testleri ve yeni iki öğrenci düello/güvenlik testi.
- Portlar kullanılamıyorsa `node scripts/duel-test-isolated.mjs` — yalnız demo projesinde 28180/29199 portları; geçici dosyalar çalışma bitince kaldırılır. Normal uygulama portları değişmez.
- `npx playwright test tests/e2e/duel.spec.ts --project=phone --project=desktop` — arayüz durumları, yatay taşma, konsol hatası ve ekran görüntüleri. Bu arayüz testi veri katmanını taklit eder; gerçek Firestore/Auth akışı ayrıca Spark testleriyle doğrulanır.

Bu çalışma yerel kod entegrasyonudur; canlı Firebase kuralları veya site deploy edilmedi.
