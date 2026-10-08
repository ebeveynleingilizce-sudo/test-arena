# MVP Aşama 3B — Smart pool refill (manuel/emulator)

## Sayım ve mevcut sistem

Refill, Question Engine / publisher / Quiz dışında bir CLI/server modülüdür.
Öğrenci endpoint'i refill, generator veya verifier çağırmaz. Soru/cevap koleksiyonları,
Quiz, XP, analytics, navigation ve Rules değiştirilmedi.

EmulatorRefillStore normal Test Builder'ın curated ID + AI scope birleştirmesini
kullanır. Published, non-demo kayıtlar exact grade/subject/unit/theme/topic/subtheme
kapsamında seçilir. Private cevap anahtarı ve güvenli presentation geçerli olmalıdır.
Tam outcomeCode eşleşmesi ve sourceDatasetId kontrol edilir; AI sorularında
curriculumVersion da eşleşmelidir. Optional difficulty sayım filtresi desteklenir.

Kullanılabilir curated sorular kapasiteye dahildir. Emekli/unmapped pilot kayıtlar,
demo soruları, geçersiz anahtarlar ve kesin outcome eşleşmesi olmayan theme-level-only
içerik aynı kazanımın doğrulanmış kapasitesi olarak sayılmaz. Kazanım uydurulmaz.
Bu conservative sayım, kanıtlanmış iki scope'ta mevcut öğrenci pool'u ile örtüşür;
gelecekte bir konu birden çok kazanım barındırırsa kazanım başına alt kapasite sayılır.

## Config ve sınırlar

`data/question-engine/refill-policy.json` varsayılanları:

| Ayar | Değer |
|---|---:|
| targetVerifiedQuestions | 30 |
| overgenerationFactor | 1.4 |
| batchSize | 5 |
| maxBatches / maxProviderCalls | 6 / 6 |
| maxGeneratedCandidates / maxVerifierCalls | 30 / 30 |
| maxTotalTokens | 50000 |
| maxNoProgressBatches | 2 |

Target ürünün kalıcı sabiti değildir. Config'teki `targets` array'i grade, subject,
unit/theme, topic/subtheme, outcomeCode, family ve difficulty selector'larıyla
override edilebilir. Son eşleşen override kazanır. Büyük/unbounded config reddedilir.
Pool target test boyutunu değiştirmez; mevcut 10'luk paketleme aynen kalır.

Batch = min(ceil(gap × 1.4), batchSize, kalan candidate bütçesi). Gemini'nin mevcut
en fazla 5 adaylık isteği korunur. Örneğin gap 5 için ilk batch 5; bir aday reddedilip
gap 1 kalırsa sonraki batch 2 olur. Genel core farklı provider için batchSize ≤20
destekler; Gemini CLI config'i 5 kullanmalıdır. Provider/model/prompt değişmedi.

API çağrıları ve candidate request bütçesi kesin olarak sınırlandırılır. Token
sayacı response usage metadata'sından birikir. 50000 eşiği sonrasında yeni çağrı
yapılmaz; devam eden tek çağrı toplamı eşiğin üstüne çıkarabilir. Bu mutlak fatura
limiti değildir. Usage yoksa totalTokens null kalır, hard call/candidate sınırları
geçerlidir. Ek retry veya sonsuz generation yoktur.

## Algoritma

1. Kanonik context'i doğrula, usable count al, gap hesapla.
2. Count ≥ target ise ALREADY_FULL: runtime kurulmaz, 0 AI ve 0 write.
3. Plan yalnız sayım/öngörü gösterir; lease almaz, AI/yayınlama yoktur.
4. Publish çalışmasında scope lease al; sayımı yeniden kontrol et.
5. Gap'e bağlı bounded batch üret. Common-valid persistent fingerprint
   duplicate'lerini pahalı verifier çağrısı öncesinde ele.
6. Adayları mevcut deterministic veya bağımsız AI yolu ile doğrula.
7. Yalnız engine ACCEPT receipt'lerini mevcut publisher'a ver. Her publication
   sonrası ve her batch sonunda gerçek count tekrar okunur.
8. Target'a ulaşınca kalan overgenerated adayları yayınlama/doğrulama; unprocessed
   olarak raporla. Hard limit veya iki ilerlemesiz batch sonrasında PARTIAL.
9. Lease'i finally'de bırak. Hata halinde mevcut soruları silme/değiştirme.

Dry-run bir batch generate/validate eder, yayınlama ve lease yazımı yapmaz; gerçek
pool count artmış gibi gösterilmez. Rapor: initialCount/targetCount/initialGap,
generated/requestedCandidates, accepted/rejected, duplicatesSkipped/published,
unprocessed, finalCount/remainingGap, generatorCalls/verifierCalls/totalTokens,
batches, status/stopReason ve difficulty/family dağılımı.

## Duplicate, çeşitlilik ve difficulty sınırı

Content/structural fingerprint mevcut family/model/visual/option bilgilerini içerir.
Aynı hash/model düzenine doymuş generation iki ilerlemesiz batch ile durur. Kalıcı
publication idempotency korunur. Embedding veya semantic similarity yoktur.

Difficulty alanları mevcut etiketlerdir; bağımsız, kalibre edilmiş bir zorluk
ölçümü değildir. Dağılım raporlanır, zoraki oran veya yeni difficulty engine yoktur.
Core optional difficulty scope'unu sayım/aday eleme ve target seçiminde destekler.
Mevcut iki profile birer family tanımlıdır: yeni family/soru üretmeden karışık-family
havuzu garanti edilemez. Farklı deterministic model/structural fingerprint'ler
minimum çeşitlilik sağlar; family/difficulty dağılımı görünürdür. Yeni ders aynı
generic core'u profile/capability kaydı ile kullanır.

## Concurrency ve hata

`refillLeases/<canonical-context SHA-256>`: yalnız owner UUID ve expiresAt içerir.
15 dakikalık lease transaction ile alınır, batch/candidate öncesinde yenilenir.
Süre dolunca yeni owner alabilir; eski owner yeni lease'i silemez/yenileyemez.
Rakip run PARTIAL / REFILL_BUSY ile 0 AI'da durur. Client erişimi mevcut catch-all
Rules ile kapalıdır. Bu bir job/queue, scheduler veya kalıcı generation geçmişi değildir.

Provider/verifier/bozuk batch/publication hataları kontrollü FAILED veya mevcut
publication varsa PARTIAL üretir. Bütçe, lease kaybı ve duplicate saturation
PARTIAL'dır. Bir adayın matematik/kalite REJECT olması kalan bounded adayların
denenmesini engellemez. Refiller'lar arasındaki lease korunur; ayrı manuel
publication komutu lease kullanmadığından onunla eşzamanlı yazım yalnız publication
transaction/idempotency ve yeniden sayımla korunur.

## Komutlar

Emulator ve curated seed hazır olmalıdır. Varsayılan **plan** (API çağrısı yok):

```powershell
npm run question-engine:refill-local -- life-studies-planning --plan
```

Gerçek API ile bir batch değerlendirme, yayınlama yok:

```powershell
npm run question-engine:refill-local -- life-studies-planning --gemini --dry-run
```

Kullanıcının API key bulunan PowerShell'inde gerçek bounded refill + yalnız emulator
publication (bu geliştirme görevinde çalıştırılmadı):

```powershell
npm run question-engine:refill-local -- life-studies-planning --gemini --publish
```

Publisher ve store host/project olarak sabit `127.0.0.1:8080` / `demo-test-arena`
kullanır; production fallback yoktur. Plan bile remote emulator/project ayarında
reddedilir. CLI pool dökümü, API key, prompt, kişisel veri veya reasoning loglamaz.

Scheduler/cron/worker/refill queue/admin UI/vector DB/production deploy eklenmedi.
