# Düello modu

Öğrenci → Arena → Düello. Aynı öğretmenin aynı sınıfındaki çevrimiçi öğrenciler birbirine davet gönderir. Mevcut kısa kod girişi, importer, soru bankası ve öğrenme geçmişi korunur.

- Çevrimiçi sinyali 25 saniyede bir yenilenir; 75 saniyedir yenilenmeyen öğrenciler listeden çıkar.
- Davet 60 saniye geçerlidir. İki öğrenci slotu tek transaction ile kilitlenir; eşzamanlı davetler kabul edilmez. Yalnız davet edilen öğrenci kabul veya ret verebilir.
- Mevcut aktif 10 soruluk test paketlerinden biri seçilir. Güvenlik kuralları paketin kademesine iki öğrencinin de erişebildiğini doğrular.
- Kabulden 10 saniye sonra başlanır. Yeni yarışmalarda aynı soru sırası ve sunucu zamanına göre 20 saniyelik 10 tur kullanılır. Erken cevap veren öğrenci tur bitene kadar bekler. Eski kayıtlarda tur süresi alanı yoksa 30 saniye korunur.
- Doğru cevap 1000 yarışma puanı ve kullanılan her tam saniye için 10 azaltılan hız bonusu getirir (başlangıçta 300). Yanlış/boş/zamanında gönderilmeyen cevap 0 yarışma puanı getirir. Puan, değiştirilemeyen sunucu gönderim zamanı ve mevcut doğrulanmış quiz sonucu üzerinden hesaplanır. Sunucu kuralları erken/geç veya yarışma bittikten sonraki yeni cevapları reddeder.
- Yarışma puanı XP değildir. PRODUCT.md gereği ilk kez doğru çözülen soru +1 XP getirir; yanlış ve tekrar doğru cevap +0 XP. Kazanma veya katılım bonusu ve öğretmenin XP oranını değiştirmesi eklenmedi.
- Düello kayıtları ve iki öğrencinin quiz oturumları saklanır. Sonuçlar Düello geçmişinden açılır. Doğru cevabın +1 XP'si doğrulanmış düello oturumunda hemen öğrenme özetine, hafta ve sınıf sıralamasına işlenir. Normal testlerin tamamlanma şartı korunur; aynı sorudan iki kez XP alınamaz.
- **Yarışmadan ayrıl**, başka ekrana geçiş ve arka plana alma yarışı sonlandırır. Yarışmada canlılık sinyali 5 saniyede bir yenilenir; 15 saniye sinyal vermeyen rakip için kalan katılımcı yarışı kapatır. Sunucu bu koşulu doğrular; başka öğrenciyi ayrılmış göstermek mümkün değildir. Sonuç ayrılan kişiye göre değil, bitiş anına kadar gönderilen doğrulanmış puanlara göre belirlenir. Eşitlik beraberliktir. Kesin kapanış tarihi ve nedeni kaydedilir; sonradan gelen yeni cevap puanı değiştiremez.
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

## Soru yükleme

Yalnız değiştirilemeyen kamuya açık paketler kullanıcıya göre ayrılmış, en fazla
32 kayıt ve 5 dakika sınırı olan bellek önbelleğinde tutulur. Özel cevap anahtarı,
rol, öğrenci bağları ve quiz durumu sunucudan doğrulanır. Aynı anda başlayan
eşdeğer ekran okuma istekleri paylaşılır; başarısız istek önbellekten kaldırılır.
Quiz XP sorgusu tüm geçmiş yerine ilgili oturumu getirir. XP eşitlemesi yalnız
eksik ödülleri yazar. Öğretmen bankasında cevaplar 30 ID'lik sorgularla, en fazla
dört eşzamanlı grupta okunur; yan menü yalnız izin sorgular.

`node scripts/teacher-sharing-test-isolated.mjs` gerçek Auth/Firestore akışıyla
mobil ve masaüstü düello, ekrandan ayrılma, anlık/tekrarsız XP, yanlış cevap,
sahte ayrılma, zaman sınırı ve bağlantı kopması testlerini de çalıştırır.
