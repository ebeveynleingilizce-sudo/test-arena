# MVP Aşama 3C — Read-only curriculum pool plan

`npm run question-engine:orchestrate-local -- --plan` tarayıcı/öğrenci yolundan bağımsız,
manuel bir plan komutudur. `--plan` varsayılandır. `--grade 2 --subject hayat-bilgisi
--unit <canonical-id> --topic <canonical-id>` filtreleri birlikte kullanılabilir.
Execution, Gemini ve publish flag'leri kabul edilmez.

CLI mevcut `data/mufredat/[2–12]-sinif.json` dosyalarını keşfeder ve karşılık gelen
`*-sinif-ui-v2.json` ile mevcut resolveCurriculumContext adapter'ını kullanır.
Kanonik units/themes/skill_domains ve topics/subthemes taranır; yalnız kaynakta
bulunan outcome ilişkileri alınır. Eksik metin, çıplak outcome_codes, navigasyon
eşleşmesi olmayan beceri alanı ve kazanımı olmayan leaf node sessizce atlanmaz.
Bu eksik kayıtlar da discoveredScopes sayısına dahildir; üretilebilir tam scope
oldukları iddia edilmez. Kodlar tema düzeyinde kalır; alt konulara dağıtılmaz.
Duplicate scope kaynağı hata verir. Mevcut veri yalnız 2. sınıftır; diğer sınıflar
için veri veya kazanım üretilmez.

Strategy registry scope içermez. `base-ten-mcq@1` mevcut deterministic matematik
family'sini kullanır; `knowledge-mcq@1` exact outcome + bağımsız verifier için
tekrar kullanılabilir metin MCQ şablonudur. Güvenilir JSON binding, scope selector'ı,
family ve strategy'yi bağlar. Her konu için TypeScript profile gerekmemektedir.
Yeni binding ve grade policy güvenilir kişi tarafından doğrulanmalıdır; AI config
üretmez. Şu anda yalnız gerçek üretim kanıtı bulunan iki scope desteklenmektedir.
Knowledge strategy'nin varlığı bütün diğer kazanımları destekli yapmaz.
Reading/listening/language için henüz yeni strategy veya üretim kanıtı yoktur.
Eski dry-run/refill profilleri, validator/router ve runtime değiştirilmedi.

Resolution fail closed: mapping incomplete, no generation strategy, conflicting
mapping, missing grade policy veya unsupported visual requirement raporlanır.
Deterministic binding varsa independent AI yerine öncelik alır. Registry'deki iki
strategy mevcut verification yollarına karşılık gelir; bilinmeyen strategy kapalıdır.

Inventory aynen 3B EmulatorRefillStore.summary metodudur: curated + ai_verified,
private key, exact outcome/dataset/version kontrolleri korunur. Hata sıfır kapasite
olarak gösterilmez; INCOMPLETE plan, inventoryErrors ve başarısız CLI exit üretir.
Yalnız 127.0.0.1:8080 / demo-test-arena kullanılır. Planner yalnız summary interface'i
alır; lease, publication, generator, verifier yöntemleri yoktur.

Target mevcut refill-policy.json'dan gelir. Minimum usable orchestration-policy.json'da
varsayılan 10 ve selector override desteğiyle ayrı tutulur. Bu, tam bir 10 soruluk
paket için planlama eşiğidir; mevcut Quiz'in az sorulu test açma davranışını değiştirmez.
Minimum target'ı aşamaz. FULL target ve üstüdür; usableButLow minimum ve üstünde
fakat target altında, unusable minimum altındadır. Unsupported count bu gruplara
eklenmez. Priority: 0 boş, 1 minimum altında, 2 target'ın yarısı altında, 3 diğer
eksikler. Aynı priority'de büyük gap önce gelir.

Estimated candidates = ceil(gap × mevcut overgenerationFactor), estimated batches =
ceil(candidates / batchSize). Independent verifier estimate aday sayısıdır;
deterministic için sıfırdır. Bunlar ideal kabul varsayımında kaba iş yükü tahminidir;
duplicate/reject/token tüketimi tahmin edilmez. Bir run'ın hard limitini aşan tahmin
birden fazla manuel run gerektirebilir; runLimits ayrıca gösterilir. Token fiyatı,
parasal maliyet veya tamamlama garantisi yoktur. Her detay listesi CLI'da 100 kayıtla
sınırlıdır; tüm kayıtların özeti ve omittedDetails sayıları korunur.

Scheduler, cron, queue, worker, otomatik refill, UI, production ve tüm havuzları
doldurma bu aşamada uygulanmadı. Execution açılırsa mevcut refillPool kullanılmalıdır.
