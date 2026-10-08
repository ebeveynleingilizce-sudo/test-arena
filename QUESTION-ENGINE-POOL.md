# MVP Aşama 3A — Verified Question Pool (yalnız emulator)

## Mevcut soru sistemi

Tek soru havuzu `questions/{questionId}` olarak kalır. Curated kayıtlar ve ID'ler
değişmez. AI sorusu da mevcut `questionText/choices`, grade/subject/unit/topic,
published status ve güvenli visual sözleşmesini kullanır. Cevap ve öğrenciye
cevap sonrası gösterilen açıklama `privateQuestionAnswers/{questionId}` içinde
kalır. Yeni bir client soru sistemi veya callable yayınlama endpoint'i yoktur.

## Server publication gate

Pipeline, common/domain veya bağımsız AI kontrolü ve quality/duplicate gate
sonrasında ACCEPT sonucuna process-local WeakMap receipt bağlar. Receipt içinde
doğrulanan adayın kopyası, canonical context, capability ve doğrulama yöntemi vardır.
Publisher ham candidate, `verified: true`, JSON ACCEPT, result kopyası veya REJECT
kabul etmez. Candidate/result sonradan değiştirilse de snapshot korunur.

Receipt bir client yetkilendirme token'ı değildir; server modülleri arasında
kontrollü provenance sağlar. Güvenilir Admin kodunun kendisi bu sınırın dışındadır.
JSON'dan receipt yeniden oluşturulmaz. Ayrı process'te publication için aday aynı
engine doğrulamasından yeniden geçirilmelidir.

## Fiziksel yapı ve transaction

```text
questions/qe_ai_<content SHA-256>
privateQuestionAnswers/qe_ai_<content SHA-256>
questionFingerprints/content_<SHA-256>       → questionId
questionFingerprints/structural_<SHA-256>    → questionId
```

Server mevcut content/structural fingerprint algoritmasını kullanır. İki index,
soru ve private key tek transaction'da create edilir. Kalıcı index mevcutsa aynı
soru döndürülür; duplicate işlem hiçbir belgeyi güncellemez. Eşzamanlı transaction
çatışmaları SDK retry ile yeniden okunur; yalnız bir soru kalır. Kırık index veya
yarım kayıt otomatik onarılmaz/üzerine yazılmaz, hata verir.

Fingerprint'e scope da dahildir. Farklı scope'lar birleşmez. `qe_ai_` öneki mevcut
g2-* curated ID'lerden sonra sıralanarak mevcut tam paketleri korur. Duplicate
kontrolü mevcut fingerprint tanımının sınırları içindedir; semantik vector benzerlik
arama veya curated içeriklere fingerprint migration yapılmaz.

Soru kaydında `source: ai_verified` ve minimum provenance bulunur:
curriculumVersion, providerFamily, verificationMethod, capability, questionFamily,
content/structural fingerprint, validationVersion ve createdAt. API key, prompt,
kimlik/veri geçmişi veya verifier justification/chain-of-thought saklanmaz.
Eski curated kayıtların eksik source alanı geriye dönük değiştirilmez.

## Test Builder ve DTO

`quizCatalog` ve `startTest`, mevcut grade-checked published/non-demo sorgusundaki
AI kayıtlarını exact grade/subject/unit/topic scope'unda curated ID'lere ekler.
`curricula` ve navigation JSON belgeleri değiştirilmez. Bu yüzden curated seed
yeniden çalıştırılsa da AI soruları katalog/test seçimine dahil kalır.

Mevcut `testPacks` kullanılır: 10'luk paketler ve son eksik paket. Örneğin 6 soru
varsa bir 6 soruluk paket oluşur; aynı soru çoğaltılmaz, AI çağrılmaz. Boş havuzda
test paketi bulunmaz ve mevcut kontrollü hata davranışı korunur.

Öğrenci DTO'su mevcut whitelist üzerinden hazırlanır. Source/provenance,
fingerprint, outcomeCode, cevap anahtarı ve explanation test başlangıcında
gönderilmez. `submitAnswer` mevcut privateTestKeys snapshot'ını kullanır. Cevap
sonrası doğru seçenek ve açıklama gösterimi mevcut davranıştır. Yanlış=0 XP,
ilk doğru=1 XP, awardedQuestions üzerinden tekrar doğru=0 XP aynen korunur.

Rules değiştirilmedi: soru, cevap anahtarı ve private test key için deny-all;
yeni questionFingerprints koleksiyonu mevcut catch-all deny-all kapsamındadır.
Teacher/student/guest client publication yapamaz.

## Manuel komutlar

Emulatorlar ve Java 21 açıkken, gerçek Gemini çağrısı olmadan preview:

```powershell
npm run question-engine:publish-local -- math-base-ten
```

Doğrulanan beş deterministik yerel fixture'ı emulator'a publish:

```powershell
npm run question-engine:publish-local -- math-base-ten --publish
```

Gerçek Gemini generator/verifier yalnız `--gemini` açıkça verilirse kullanılır.
API key'in bulunduğu PowerShell'de kullanıcı tarafından çalıştırılabilir:

```powershell
npm run question-engine:publish-local -- life-studies-planning --gemini
npm run question-engine:publish-local -- life-studies-planning --gemini --publish
```

İki komut ayrı generation çalışmalarıdır; ilk komuttaki receipt process kapandığında
kaybolur. Tek çalışmada generate→verify→publish için ikinci komut yeterlidir.
`--publish` ilk kabul edilen kayıt öncesinde mevcut curated emulator seed'ini
idempotent çalıştırır; mevcut soruların içeriğini değiştirmez.

Rapor: generated, accepted, rejected, rejectReasons, newlyPublished,
duplicatesSkipped. Generator/verifier hataları veya publication hataları başarılı
gibi sessizce geçilmez. Batch publication soru başına atomiktir; sonraki soruda
hata olursa önceki tamamlanmış sorular kalır, yeniden çalıştırmak idempotent'tir.

EmulatorQuestionPublisher yalnız `127.0.0.1:8080` ve `demo-test-arena` ile kurulabilir;
host ve project constructor'da ayrıca sabittir. Production publication yolu yoktur.
Engine/publisher modülleri öğrenci request handler'larından çağrılmaz; Quiz yalnız
pool-navigation'ın saf birleştirme yardımcılarını kullanır.

## Kapsam dışı

Scheduler, cron, generationJobs, worker, background refill, 2–12. sınıfları doldurma,
öğretmen/admin review UI, yeni renderer, ikinci provider ve production deploy yoktur.
Bağımsız AI doğrulamanın model hata riski ve açıklama kapsamının sınırları önceki
QUESTION-ENGINE-VERIFICATION.md dokümanında geçerlidir.
