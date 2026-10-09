# Canlı Test Arena

Firebase projesi: `test-arena-20261008` (bağımsız Spark projesi).
Güncel canlı site: https://test-arena-20261008.web.app

Eski GitHub Pages adresi: https://ebeveynleingilizce-sudo.github.io/test-arena/

Authentication: e-posta/şifre ve Google. Firestore Rules/indexler bu projeye
ayrı dağıtılır; Cloud Functions veya Blaze kullanılmaz.

GitHub Pages `.github/workflows/pages.yml` üzerinden main dalını build eder; güncel
canlı yayın Firebase Hosting üzerinden yerel üretim build'i ile yapılır.
Firebase WEB yapılandırması repository Actions variables içindedir;
özel anahtar/servis hesabı/Gemini anahtarı kullanılmaz. Yerel canlı build ayarı
gitignore kapsamındaki `.env.production.local` içindedir.

Hazır bankalar `data/questions` altında yerelde korunur. Bu kaynaklar cevap
anahtarları içerdiğinden yeni yayınlara commit edilmez. Canlıya yalnız mevcut
importer sözleşmesiyle doğrulanmış questions/privateQuestionAnswers ve güvenilir
Spark katalog/test projeksiyonları yüklenmiştir. Banka JSON'ları dist içinde yoktur.

Bu ilk bağımsız canlı kurulumda 21 banka / 1050 soru ve 1050 private cevap vardır.
Local emulator kullanıcıları/test geçmişi canlıya kopyalanmamıştır; local yedekleri
korunmaktadır. Canlı öğretmen kendi hesabını oluşturup öğrencilerine yeni kod verir.

GitHub Pages alt dizininde renderer asset yolları BASE_URL kullanır. PWA worker
sürüm hash'i her build'de yenilenir; Auth/Firestore cevapları cache'e alınmaz.
App Check enforcement etkin değildir. Native Auth öğrencinin kendi şifresini
değiştirme riski Spark geçişinde kabul edildiği haliyle sürer.

## 9 Ekim 2026 — Tüm uygulama güncellemelerinin yayını

Öğretmen paylaşımı, karma sınıflar, test davranış raporları, sınıf silme ve
öğretmen viewport düzeltmesini içeren mevcut kaynaklardan `npm run build` ile
üretim paketi oluşturuldu. Yayın komutu:

```
firebase deploy --project test-arena-20261008 --only firestore,hosting --non-interactive
```

Hosting yayını, Firestore kuralları ve indeks dağıtımı başarılı. Mevcut kurallar
buluttaki sürümle aynıydı. Canlı ön kontrolde 4 sınıfın erişim geçişi tamamlanmıştı;
güncellenecek sınıf sayısı 0. 15 öğrencinin kayıt/kod/XP/Auth bağı parmak izi
değişmedi; bu yayında öğrenci verisi veya soru bankası importu yapılmadı.

Önceki doğrulamada mevcut Spark paketi 22/22 ve gerçek öğretmen viewport giriş
testleri 4/4 geçti. Yayın öncesinde birim/görünüm/PWA testleri 19/19 ve karma
sınıf emülatör/mobil/masaüstü testleri 4/4 geçti. Canlı mobil/masaüstü öğretmen
girişinde konsol hatası yok; girişsiz Firestore erişimi reddediliyor. Git commit,
push veya branch oluşturulmadı; GitHub Pages bu yayında güncellenmedi.
