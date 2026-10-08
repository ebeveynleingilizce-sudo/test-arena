# MVP Aşama 2B — Bağımsız AI verifier / dry-run

Bu modül yalnız server tarafında, bellekte ACCEPT / REJECT üretir. Firestore,
yayınlama, öğrenci akışı, scheduler veya worker ile bağlantısı yoktur.

## İki doğrulama yolu

`dryRun` eski senkron `validateCandidate` yolunu korur. İsteğe bağlı
`VerificationRouter` sağlandığında common validator sonrasında async doğrulama
yapılır. Router'ın deterministik registry'si dry-run registry'siyle aynı olmalıdır.

1. Capability için deterministik validator varsa önce ve yalnız o kullanılır.
   Yanlış cevap, scope hatası veya validator exception AI fallback başlatmaz.
2. Deterministik validator yoksa yalnız server tarafından kayıt edilmiş verifier
   binding'i kullanılabilir. Capability, tam kanonik context, family, içerik boyutu
   ve desteklenen visual kind sınırları kontrol edilir. Kayıt yoksa REJECT.
3. AI kanıtı server quality gate'e girer. Sonra mevcut fingerprint/duplicate gate
   çalışır. ACCEPT bir yayınlama kararı değildir.

Subject adına dayalı router dalları yoktur. `QuestionVerifier.verify(input)` bir
`Promise<unknown>` döndürür; başka provider'lar da aynı sözleşmeye takılabilir.
Unknown dönüş, model/provider çıktısına otomatik güvenilmediğini ifade eder.

## Kör çözüm girdisi

DTO yalnız `curriculum`, server `gradePolicy`, `question`, `options` ve desteklenen
güvenli visual semantics içerir. Generator `correctOptionId`, `explanation`, model,
candidate ID, family veya kullanıcı bilgisi gönderilmez. Verifier konuşması
generator konuşmasından ayrıdır. DTO ve iç alanları dondurulur; provider adayın
seçeneklerini/cevap anahtarını değiştiremez.

Router visual semantics için ortak parser'dan geçmiş veriyi kullanır, `alt`
alanını çıkarır. İlk GeminiVerifier binding'i **yalnız metin soruları** destekler.
Görselleri sessizce atmak yerine REJECT eder. BASE_TEN_TO_NUMBER zaten deterministik
yoldadır. İleride başka visual capability açıkça eklenebilir; raw SVG/HTML/URL
taşınmaz. Bu aşamada renderer veya genel görsel verifier geliştirilmedi.

## Structured çıktı ve server kararı

```json
{
  "selectedOptionId": "a",
  "justification": "Plan yapmak görevleri zamanında tamamlamaya yardımcı olur.",
  "hasSingleCorrectAnswer": true,
  "curriculumAligned": true,
  "gradeAppropriate": true,
  "factuallySound": true,
  "questionClear": true,
  "visualConsistent": true,
  "confidence": 0.97,
  "issues": []
}
```

Tek kesin doğru seçenek bulunmuyorsa `selectedOptionId: null` kullanılır.
Schema ek alanlara kapalıdır; bütün alanlar zorunludur. Backend aynı contract'ı
Gemini dışında bir verifier kullanıldığında da kontrol eder.

Nihai gate: seçilen ID seçeneklerde bulunmalı ve generator ID'siyle eşleşmeli;
tek kesin doğru cevap, kanonik unit/topic/outcome uyumu, yaş/kademe uygunluğu,
factual doğruluk, açıklık/eksiksizlik/dil/seçenek tutarlılığı ve görsel tutarlılık
kontrolleri true olmalı; issues boş olmalı. Herhangi bir hard failure güven
puanından bağımsız REJECT olur. Eşik `confidence >= 0.95`.

0.95 temkinli bir MVP filtresidir; kalibre edilmiş doğruluk olasılığı değildir.
AI değerlendirmesi factual doğruluğun deterministik kanıtı değildir. Generator ve
verifier aynı model ailesini kullandığında ortak hata riski devam eder. Kör çözüm
confirmation bias'ı azaltır; tam model bağımsızlığını garanti etmez. Gerçek non-math
sonuçlar henüz kullanıcı dry-run'ı ile sınanacaktır. Generator açıklaması bu ilk
bağımsız çözümde değerlendirilmez; çıktıdaki justification ayrı model kanıtıdır.

## İlk kapsam ve hata davranışı

Mevcut `life-studies-planning` profili: 2. sınıf Hayat Bilgisi → Ben ve Okulum →
Zaman Yönetimi → HB.2.1.1. Context resolver, kanonik kaynaktaki
“Planlı olmanın kişisel yaşama etkilerini fark edebilme” metnini doğrular.
Navigasyon/müfredat dosyaları değiştirilmez.

Timeout, HTTP/provider hatası, boş/kesik/bozuk çıktı, tool part ve schema dışı
alanlar fail-closed'dur. Provider güvenli sabit hata kodu verir; router dışarıya
`VERIFICATION_FAILURE` döndürür. Key, remote body veya soru payload'u loglanmaz.
Verifier çağrıları sıralı ve aday sayısıyla sınırlıdır; retry yoktur.

## Manuel gerçek çağrı

API key bulunan yerel PowerShell'de:

```powershell
npm run question-engine:gemini-dry-run -- life-studies-planning
```

5 generator adayı için en fazla 5 ayrı verifier isteği yapılır. Rapor generator
ve verifier latency/token kullanımını ayrı verir; toplam verifier değerleri bütün
çağrıların toplamıdır. Eksik token bilgisi null kalır. `combinedTotalTokens` iki
tarafın toplamıdır. `GEMINI_VERIFIER_MODEL` verifier modelini generator'dan ayrı
seçebilir; tanımlı değilse GEMINI_MODEL / mevcut varsayılan kullanılır.

Gerçek API otomatik testlerden çağrılmaz. Test komutu:

```powershell
npm run build --workspace functions
node --test tests/question-engine/*.test.mjs
```
