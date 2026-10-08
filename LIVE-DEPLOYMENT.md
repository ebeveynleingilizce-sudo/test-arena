# Canlı Test Arena

Firebase projesi: `test-arena-20261008` (bağımsız Spark projesi).
Site: https://ebeveynleingilizce-sudo.github.io/test-arena/

Authentication: e-posta/şifre ve Google. Firestore Rules/indexler bu projeye
ayrı dağıtılır; Cloud Functions veya Blaze kullanılmaz.

GitHub Pages `.github/workflows/pages.yml` üzerinden main dalını build eder.
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
