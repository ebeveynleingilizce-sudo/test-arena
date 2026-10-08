# MVP Aşama 3D — Academic mapping and safe strategy expansion

3C discovery/orchestrator/strategy/policy/CLI dosyaları değişmedi. Yeni 3D adapter
aynı 219 kaydı, aynı resolver ve aynı pool summary ile BEFORE/AFTER olarak inceler.
Komut: `npm run question-engine:mapping-plan-local -- --plan --grade 2`.
Mevcut grade/subject/unit/topic filtreleri geçerlidir; AI/execution/publish flag'i yoktur.
3C komutu orijinal sonucu üretmeye devam eder. 3D genişlemesi bu ayrı plan komutundadır;
mevcut refill çalışma yolu veya profile'lar otomatik genişletilmedi.

## Mapping kök nedenleri

| Ders | Kayıt | Kesin akademik ilişki | 3C mapping incomplete |
|---|---:|---:|---:|
| Türkçe | 28 | 20 skill-domain → outcome | 28 |
| Matematik | 25 | 25 topic → outcome | 0 |
| Hayat Bilgisi | 23 | 23 topic → outcome | 0 |
| İngilizce | 143 | 128 theme → code; metin yok | 143 |

Türkçe 8 theme kazanım içermiyor. 20 skill-domain kazanımının tam metni var fakat
öğrenci temalarına kesin bağ yok. Adapter academicRelation=EXACT ile bu bilgiyi
korur; navigationRelation=UNRESOLVED ile öğrenci havuzuna sokmaz. Bu 20 kayıt
kazanımı bilinmeyen kayıtlar değildir. Dinleme, konuşma ve yazma performansları
metin MCQ ile tam ölçülemez. Okuma anlam/çözümleme kazanımları ileride pasaj temelli
strategy ile ele alınabilir; tema bağlantısı ve pasaj sözleşmesi bugün eksiktir.

İngilizce 128 outcome_codes tema üzerinde bulunur, hiç birinin tam kazanım metni
bu JSON'da yoktur. 15 subtheme kendi outcome bağını içermez. Kodların L/R/W/S
harflerinden kazanım metni veya topic üyeliği üretilmez. 128 × 15 çapraz eşleme yoktur.
Kaynak metadata'sı XLSX/DOCX isimlerini anıyor; dosyalar repo'da mevcut değildir.
Bu aşamada dış kaynak metni veya uydurma kaynak ilişkisi eklenmedi.

Topic tüm derslerin akademik scope'u için zorunlu değildir: resolver, exact theme-level
outcome ve theme-test navigation ile topic'siz scope çözebilir (sentetik test).
Bu, mevcut İngilizceyi destekli yapmaz; outcome metni eksiktir ve mevcut topic-based
öğrenci havuzuna keyfi dağıtım yapılamaz. Türkçenin skill_domain alanı öğrenci topic'i
veya theme'i değildir. Mevcut Quiz/navigation/pool contract değiştirilmedi.

## Ölçme politikası ve strategy

İki mevcut strategy ailesi korunur: deterministic base-ten-mcq@1 ve independent-AI
knowledge-mcq@1. Yeni renderer/provider/verifier ailesi eklenmedi. Genişleme, tek
güvenilir assessment group + kısa reviewed outcome listesiyle yapılır; her kazanım
için ayrı executable profile yoktur. Canonical context unit/topic üyeliğini sağlar.
Approval listesi üyelik veya kazanım metni kaynağı değildir; kaynak metin ile birebir
eşleşme yalnız bu insan değerlendirmesinin değişen kazanıma otomatik uygulanmasını
engelleyen config güvenlik kontrolüdür. Soru explanation validator'ı ile ilgili değildir.

HB.2.1.1 mevcut DAILY_PLANNING profile ile kalır. HB.2.2.1, HB.2.3.1, HB.2.4.4,
HB.2.4.5, HB.2.5.1 ve HB.2.6.3 için generic KNOWLEDGE_MCQ binding oluşturulur.
Bu kavramsal ilişkiler/önem/ayırt etme alanında MCQ ölçme desteğidir; davranış ve
performans değerlendirmesi iddiası yoktur. Yeni kapsamda gerçek AI üretimi bu aşamada
doğrulanmadı; pipeline common + bağımsız verifier kapısı gelecekte aynen gerekir.

9 Hayat Bilgisi kazanımı gerçek davranış/performance; 1 trafik işareti kazanımı özel
görsel; 6 kazanım yerel bağlam, kaynak araştırması veya kanıt materyali ister.
Bunlar sırf sayıyı artırmak için generic MCQ'ya bağlanmadı. Matematikte mevcut tek
deterministic family korunur; diğer 24 kazanım mevcut matematik görseli olsa bile
uygun üretim+doğrulama family'si kanıtlanmadığından kapalıdır. Renderer desteği,
generation/validation capability desteğiyle aynı değildir.

## BEFORE → AFTER

219 / 2 supported / 217 unsupported → 219 / 8 supported / 211 unsupported.
6 scope güvenli planlama kapsamına eklendi. 171 incomplete ilişki onarılmış gibi
gösterilmedi; 8 THEME_OUTCOME_LINK_MISSING, 20 SKILL_THEME_LINK_MISSING,
128 OUTCOME_TEXT_MISSING, 15 TOPIC_OUTCOME_LINK_MISSING olarak ayrıldı.
Diğer kalan nedenler: 24 DETERMINISTIC_OR_VISUAL_CAPABILITY_REQUIRED,
9 PERFORMANCE_ASSESSMENT_REQUIRED, 6 SOURCE_OR_LOCAL_CONTEXT_REQUIRED,
1 SPECIAL_VISUAL_CAPABILITY_REQUIRED. Toplam 211.

Kanonik/nav JSON, 3C, Quiz, XP, Auth, Rules ve yayınlama mantığı korunur. Emulator
yalnız demo-test-arena / 127.0.0.1:8080 üzerinden okunur. Plan hiçbir lease, generation,
verification veya publication çağırmaz. Scheduler/execution ve production yoktur.
