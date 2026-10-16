# 2. sezon karşılama duyurusu

Öğrenci ana ekranında koyu lacivert/altın native dialog gösterilir. Giriş, öğretmen ve test çözme ekranlarında açılmaz. CTA, kapat düğmesi ve Escape aynı onay akışını kullanır; rota değişmez.

`season2WelcomeSeen: true`, mevcut öğrenci profilinin isteğe bağlı duyuru durumudur. Öğrenci başına ilk onayda yalnız bu alan yazılır. Mevcut SessionProvider profil aboneliği diğer cihazlara sonucu taşır; yeni get/query/listener yoktur. Yazma tamamlanmadan pencere kapanmaz; hatada tekrar deneme sunulur. Mevcut XP, soru geçmişi, kademe, sınıf, kısa kod ve Auth alanları bu işlemle değişmez. Kural, yalnız geçerli öğrenci oturumunun kendi profilinde false/eksik → true geçişine izin verir. Aynı alan geri alınamaz ve başka alanlarla birlikte değiştirilemez.

16 Ekim 2026 resetinin tam önceki doğrulaması ve bu görevde 33 özet/3 sınırlı geçmiş örneğinin salt okunur kontrolü temel alındı. Doğrulanmış 33 kimliğin SHA-256 parmak izleri `season2-reset-scope.ts` içindedir; ad, giriş kodu veya ham kimlik yayımlanmaz. Parmak izleri yalnız metin seçimini belirler, yetkilendirme değildir. Bu kapsam için istenen “XP ve geçmiş sıfırlandı / herkes eşit” metni kullanılır. Diğer öğrenciler için sıfırlama iddiası içermeyen yeni sezon metni gösterilir. Yeni sıfırlama yapılmaz.

Kuralların yalnız ilgili ekini üretmek için `scripts/season2-welcome-rules.mjs` kullanılabilir. Canlı yayın hazırlanırken mevcut canlı ruleset yedeklenip bu ek uygulandı; çalışma alanında önceden bulunan başka kural/indeks değişiklikleri yayımlanmadı. Kaynak firestore.rules'a aynı dar ek işlendi.

Temel testler: `tests/season2-welcome-ui.test.mjs` (5), `tests/season2-welcome-rules.test.mjs` (4, demo emülatör 8288). Fiziksel cihaz oturumu yerine tarayıcı görünümleri ve emülatör kullanılır; canlı öğrencilerin duyuru hakkı test amacıyla tüketilmez.
