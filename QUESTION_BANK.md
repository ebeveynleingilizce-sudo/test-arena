# Öğretmen soru bankası ve hata bildirimleri

Öğretmen panelindeki **Soru Bankası**, mevcut müfredatın 1–12 kademe seçimini,
ders/ünite filtrelerini, doğru cevap ve açıklama incelemesini sunar. İçeriği
bulunmayan kademeler boş görünür; uygulama yeni müfredat veya soru üretmez.
**Test Modu** seçilen en fazla 50 soruyu yalnız React oturumunda değerlendirir.
Öğrenci oturumu, sonuç, XP veya sıralama kaydı oluşturmaz.

Yönetim hakkı korunan `roles/{uid}.questionBankAdmin` alanıdır. Önceden tanımlı
`admin` rol bayrağı ve `admin`/`questionBankAdmin` custom claim hakları da
korunur. Öğretmen kendi rolünü yükseltemez. Demo e-posta istisnası yalnız
`demo-*` emülatör projelerinde çalışır; canlıda e-posta adı yetki vermez.
`scripts/grant-question-bank-admin.mjs --production` salt okunur kontrol;
`--apply` yalnız `tunc@test.com` hesabının mevcut öğretmen rolüne ek bayrak
yazar. Önceki rol/claim kaydı `.firebase` altında yedeklenir; claim değiştirilmez.

Yayınlama, süreli ortak kilit ve işlem günlüğü kullanır. Yeni paket ve tüm cevap
anahtarları birlikte, değiştirilemez belgeler olarak hazırlanır. Soru değişimi,
önceki sürüm yedeği, katalog geçişi ve eski paketlerin yeni testlere kapatılması
tek transaction içindedir. Açık testler sabit eski paket/anahtarla tamamlanır ve
mevcut XP kurallarıyla sonuçlanır. Silme, kanonik soruyu `archived` yapar;
soru ID'si, cevap, önceki paketler ve öğrenci geçmişi silinmez.

JSON yükleme en fazla 2 MB ve 50 yeni soru içerir. `question`/`answer` kayıt
dizisi veya hazırlanmış banka biçimi kabul edilir. Mevcut ID üzerine yazılmaz;
düzenleme ekranı kullanılır. Ders, ünite ve konu mevcut müfredatta bulunmalıdır.
Yeni kesin kazanım kodları mevcut onaylı kapsamla doğrulanmalıdır. Sunum ve
görseller ortak görsel sözleşmesiyle doğrulanır; cevap kamuya açık soru alanına
yazılmaz. JSON örneği yönetim arayüzünde bulunur.

Quiz, düello, sınıf arenası ve öğretmen soru bankası ortak `QuestionReport`
bileşenini kullanır. Bildirim `questionReports` içinde dokuz türden biriyle,
kimlik/kademe/ders/ünite, oturum, kullanıcı UID ve sunucu tarihiyle kaydedilir.
Öğrenci bildirimi kendi etkin bağının testindeki gerçek soruyla eşleşmelidir.
Bildiren yalnız kendi belgesini okuyabilir; liste ve durum güncellemesi yalnız
yöneticilere açıktır. Bildirim metni, kullanıcı ve soru metadata'sı sonradan
değiştirilemez. Yönetici aynı soru bildirimlerini bir arada görür ve soruya
doğrudan gider. `pending/reviewing/fixed/rejected` dört durumdur.

Doğrulama: `node scripts/teacher-sharing-test-isolated.mjs` mevcut öğrenci,
öğretmen, sınıf paylaşımı, XP ve düello testlerine yeni banka güvenliği, bildirim
izolasyonu, sürümleme, açık testin tamamlanması, 50 soruluk JSON ve mobil/masaüstü
arayüz senaryolarını ekler. `npm run build` TypeScript ve üretim paketini doğrular.
Güvenlik kaynağı `prototypes/spark/question-bank.rules.fragment`;
`node scripts/spark-rules.mjs --write` canlı `firestore.rules` dosyasını üretir.
