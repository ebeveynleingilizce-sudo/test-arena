# Milestone 3 — Arena / Sınıf Rekabeti

Yerel `demo-test-arena` Emulator sürümü. M1 authentication, kısa kod, teacher
isolation ve kalıcı studentId; M2 cevap kilidi ve benzersiz XP ödülü korunur.
Commit, push veya production deploy yapılmadı.

## Firestore ve Academic XP

```text
teachers/{teacherUid}/students/{studentId}/learning/summary
  totalXP                  // M2 alanı korunur
  academicXP               // yalnızca sorulardan kazanılan toplam
  answeredCount, correctCount, wrongCount

teachers/{teacherUid}/students/{studentId}/academicWeeks/{weekKey}
  weekKey, academicXP      // kişisel haftalık akademik ilerleme

teachers/{teacherUid}/classes/{classId}/leaderboard/{studentId}
  studentId, classId, displayName,
  academicXP, weeklyAcademicXP, weekKey

teachers/{teacherUid}/classes/{classId}
  mevcut alanlar + arenaVersion=1

teachers/{teacherUid}/students/{studentId}/awardedQuestions/{questionId}
  mevcut alanlar + source="academic", weekKey   // yeni ödüller
```

Leaderboard minimum alanlı türetilmiş görünüm; canonical kaynakların yerine
geçmez. Kısa kod, e-posta, session, test geçmişi, doğru/yanlış ayrıntıları veya
özel öğretmen alanları içermez. Avatar verisi olmadığı için UI adın ilk harfini
kullanır; karakter/satın alma sistemi eklenmedi.

`classId` kimlerle yarışılacağını, `gradeLevel` soru erişimini belirler. Arena
üyeleri kademeye göre filtrelenmez. Başlıktaki kademe öğrencinin kendi kademesidir;
grubun defaultGradeLevel değeri değildir. Farklı kademeler aynı grupta yarışabilir.

`totalXP` kaldırılmadı; M2 callable sonuçları korunur. İlk benzersiz doğru totalXP
ve academicXP'yi +1 artırır. Bu sürümde tek ödül kaynağı akademik olduğu için
değerler eşittir. Arena totalXP yerine academicXP kullanır; ileride başka ödül
kaynakları otomatik karışmaz.

M2'nin bütün XP'si sorulardan geldiği için academicXP yoksa totalXP akademik değer
olarak alınır. Eski sınıf ilk kez açıldığında prepareArena, aktif öğrencilerin
canonical özetlerini ve gerektiğinde mevcut haftanın awardedAt kayıtlarını tek
transaction'da okuyup read model'i hazırlar. arenaVersion=1 normal girişlerde
geçmiş taramasını engeller. Eşzamanlı hazırlık, cevap, taşıma ve kaldırma transaction
conflict/retry ile yeniden doğrulanır. İlk M3 cevap/taşıma da eksik alanları
tamamlayabilir; ilk cevap yanlışsa bile eski haftalık XP kaybolmaz. Geçiş yeni ödül
üretmez. Yeni öğrenci sıfır XP'li satırı createStudent transaction'ında oluşturulur.

## Hafta ve atomik işlem

Europe/Istanbul takviminde Pazartesi 00:00 dahil → sonraki Pazartesi 00:00 hariç.
ISO hafta-yıl bucket anahtarı: `2026-W41`. Yıl sınırı doğru ele alınır; 1 Ocak 2021
`2020-W53` içindedir. Saat dilimi Intl/IANA verisinden hesaplanır; host saat dilimi
ve cihaz saati XP haftasını belirlemez. 2026-W41 başlangıcı 4 Ekim 21:00 UTC'dir.

Bucket'lar fiziksel sıfırlanmaz. Yeni hafta ilk ödül yeni belgeye yazılır; eski
haftalar kalır. Arena satırının weekKey'i güncel hafta değilse Bu Hafta puanı 0
kabul edilir. Genel puan değişmez. Cron/reset veya sınıftaki bütün satırlara toplu
yazı yoktur. prepareArena serverNow, weekKey ve başlangıç/bitiş zamanlarını döndürür.
İstekten saat/XP/sınıf kabul edilmez.

M2 submitAnswer transaction'ı genişletildi:

1. Session, canonical öğrenci, status/version, kademe ve test sahipliği doğrulanır.
2. İlk cevap kilidi ve benzersiz soru ödülü kontrol edilir.
3. Canonical özet ve server tarihinin haftalık bucket'ı okunur.
4. İlk doğru için answer, awardedQuestions, totalXP, academicXP, academicWeeks,
   mevcut sınıf Arena satırı, test ve performans aynı transaction'da yazılır.
5. Yanlış/ödüllendirilmiş soru 0 yeni XP verir. Retry ilk authoritative cevabı
   döndürür; akademik, haftalık ve Arena XP tekrar artmaz.

## Rank ve hedef

Küçük public satır listesi puan azalan sıralanır. Eşitlikte studentId deterministik
görsel sıra sağlar; rank'i değiştirmez. Rank = daha yüksek puanlı kişi sayısı +1.
`[120,120,115]` → `[1,1,3]`: competition ranking.

Hedef, kendi puanından kesin yüksek en yakın puan grubudur. Grup eşitse
deterministik ilk ad ve eşit sıradaki kişi sayısı gösterilir. Kendisiyle eşit puanlı
biri üst hedef sayılmaz. Geçmek için gereken XP = hedef − kendi +1.
1770 −1725 +1 =46. Yüksek puanlı kimse yoksa eşit liderler dahil "Zirvedesin!".

Algoritma src/domain/arena.ts içinde tek yerde; UI ve testler aynı kodu kullanır.
Rank saklanmaz: biri kaldırılınca diğer öğrencilere sıra yazıları gerekmez.
Render yalnızca minimum public satırları işler, akademik/test geçmişini taramaz.

## Güvenlik, taşıma ve kaldırma

Bütün istemci leaderboard yazıları kapalı; sahibi öğretmen de XP yazamaz.
Öğrencinin query/get izni session eşlemesi, canonical status/version, teacherUid ve
güncel classId ile doğrulanır. Başka grup/öğretmen okunamaz. Öğretmen yalnızca kendi
UID'si altındaki Arena'yı okuyabilir. Canonical academicWeeks sadece kendi öğrenci
ve öğretmenine açıktır; sınıf arkadaşlarına özel veri açılmaz.

prepareArena aktif öğrenci ve boş istek kabul eder; kimlik session'dan gelir.
Kod yenileme/kaldırma sonrası eski token Arena API'sini kullanamaz. App Check
emulator dışında mevcut Functions yaklaşımıyla zorunlu; production kurulumu bu
görevde yapılmadı.

updateStudent canonical classId ve classMembers ile eski satır silme/yeni satır
yazmayı aynı transaction'da yapar. studentId, toplam XP ve bütün haftalık geçmiş
korunur. Yeni grupta mevcut haftanın kişisel XP'si görünür. GradeLevel grubun
varsayılan kademesine zorla eşitlenmez. Eşzamanlı cevap taşıma ile çatışır ve güncel
sınıfa yazmak üzere yeniden doğrulanır; eski satır yeniden oluşmaz.

removeStudent aynı transaction'da Arena satırını siler ve eski session'ı revoke
eder. Canonical geçmiş öğretmen için kalır; kalanların rank'i listeden hesaplanır.
UI abonelik anahtarı Auth UID + teacherUid + classId + credentialVersion'dır.
Değişimde eski veri maskelenir, listener kapatılır; eski sınıf yeni ekrana sızmaz.

## Gerçek zamanlılık ve maliyet

Ana/Arena/Profil açıkken tek collection listener mevcut sınıf leaderboard'unu
dinler: N aktif öğrenci için N küçük belge. Bu Hafta/Genel aynı listener'ı kullanır;
sekme değişimi query açmaz. XP değişiminde yalnızca değişen öğrenci belgesi iletilir.
Soru çözme ekranında Arena listener yok; route değişiminde kapatılır.
M1 canonical öğrenci izleme korunur. Profilde ayrıca yalnızca kendi summary belgesi
dinlenir; Ana/Arena'da ikinci özet listener'ı yok. Rules session/öğrenci bağımlı
okumaları ayrıca maliyet oluşturabilir.

Normal prepareArena girişi session, öğrenci ve sınıf olmak üzere 3 sunucu belge
okuması; render/sekme başına RPC yok. Hafta sınırında tek zamanlayıcı server period'u
yeniler; uyuyan sekme görünür olunca gerektiğinde yeniler. Sürekli polling yok.
Rakibin açık ekranını yenilemesiz güncellemek için küçük sınıfta tek listener
seçildi. Server-confirmed snapshot beklenir; cache yetki/gerçek puan yerine geçmez.

## Ekranlar ve dosyalar

Ana gerçek akademik toplam, **Genel** sınıf sırası, hedef ve Soru Çöz gösterir.
Arena varsayılan **Bu Hafta**, Genel sekmesi, öğrenci sayısı, rank/XP, SEN satırı ve
zirve/eşitlik mesajlarını gösterir. Ana/Çöz/Arena/Profil navigasyonu çalışır;
desktop'ta dikey gezinme vardır. Profil temel gerçek kimlik/XP/rank, çözülen/başarı
ve çıkış ekranıdır. Başarı rozetleri/streak gibi kapsam dışı alanlar eklenmedi.
Referans arka plan olarak kullanılmadı; yıldız/basamaklar gerçek SVG/HTML/CSS'tir.

Yeni dosyalar:

- functions/src/arena-store.ts, functions/src/arena.ts
- src/domain/arena.ts, src/app/useArena.ts
- src/ui/StudentLayout.tsx, src/ui/arena.css
- src/features/Arena.tsx, src/features/StudentProfile.tsx
- tests/arena.test.mjs, tests/e2e/arena.spec.ts
- MILESTONE-3.md

Değiştirilen dosyalar:

- functions/src/index.ts: yeni öğrenci, sınıf taşıma/kaldırma, Arena export.
- functions/src/quiz.ts: atomik akademik/haftalık/read model XP.
- firestore.rules, firestore.indexes.json: güvenlik ve legacy hazırlık sorgusu.
- src/features/Welcome.tsx, src/main.tsx: ana ekran ve rotalar.
- package.json, README.md: tam test ve yerel kullanım açıklaması.

## Test sonucu

5 Ekim 2026 son doğrulama: `npm run build` başarılı, `npm test` çıkış kodu 0.

| Kontrol | Geçen | Başarısız | Atlanan |
|---|---:|---:|---:|
| M1 güvenlik/entegrasyon | 13 | 0 | 0 |
| M2 güvenlik/entegrasyon | 23 | 0 | 0 |
| M3 rank/takvim/güvenlik/entegrasyon | 25 | 0 | 0 |
| Playwright (telefon 5 + desktop 5) | 10 | 0 | 0 |
| Toplam | 71 | 0 | 0 |

M3 testleri: İstanbul Pazartesi ve ISO yıl sınırı; competition ranking ve
deterministik eşitlik; fark+1 ve eşit lider; sınıf/teacher isolation; minimum public
alanlar; özel veri ve istemci yazı yasakları; ilk doğru/yanlış/tekrar/concurrent
retry; taşıma ve eşzamanlı cevap; kaldırma/revoke; yeni hafta/genel XP; idempotent
M2 backfill ve yanlış cevap sonrası legacy haftalık XP korunumu.

E2E: iki öğrenci aynı grupta; biri önceden +1 kazanır, diğeri #2'den soru çözerek
eşit #1 olur. Rakibin zaten açık Arena'sı reload olmadan güncellenir. Bu Hafta/
Genel, Ana/Çöz/Arena/Profil, profil tekrar açma ve çıkış, canlı sınıf taşıma
kontrol edildi. Eski sınıf satırı diğer öğrencinin açık ekranından da kalkar.

360×800 telefon ve 1366×900 desktop: horizontal overflow yok, normal akışlarda
console/page error yok. Mobil Ana ekran CTA'sının fixed navigasyon altında
kalmadığı ayrıca bounding box ile doğrulandı. M2'nin kasıtlı kayıp yanıt testi
korunur; o senaryoda beklenen ağ kesintisi dışında uygulama page error yok.
Ekran görüntüleri test-results/, HTML raporu playwright-report/ altında; görsel
olarak telefon/desktop Ana ve Arena kontrol edildi. Üretilen test dosyaları
gitignore kapsamındadır. Emulator test sonunda kapatıldı.

## Bilinen sınırlar ve Milestone 4

Canlı Firebase, gerçek OAuth/App Check, kurulu PWA ve production Node runtime
testleri yapılmadı. Node 22 hedefi / yerel Node 24 host farkı ve mevcut Functions
SDK güncelleme uyarısı sürer. Büyük sınıflar/toplu legacy göç için yük testi yok;
tek seferlik sınıf backfill'i küçük sınıflar için tasarlandı. Geçmiş bucket'lar
saklanır fakat geçmiş hafta Arena ekranı yok. Offline server doğrulaması olmadan
Arena puanı açılmaz.

Milestone 4 önerisi: öğretmen öğrenci detayı, sınıf ve ders/konu raporları.
performance, testSessions ve academicWeeks verisini teacherUid izolasyonu içinde
kullanarak öğrenme başarısını rekabet puanından ayrı raporla. Bu görevde manuel/
görev XP, para, sezon, global/sınıflar arası yarış veya AI içerik eklenmedi.
