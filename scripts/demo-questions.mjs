// Local technical fixtures only. Never imported by the frontend or production seed.
const choices = (answer, wrong, index) => {
  const texts = [answer, ...wrong];
  const shift = index % 4;
  const result = texts.map((_, i) => ({ choiceId: String.fromCharCode(97 + i), text: texts[(i + shift) % 4] }));
  return { choices: result, correctChoiceId: result.find(c => c.text === answer).choiceId };
};
function entry(gradeLevel, subject, subjectName, topic, topicName, index, questionText, answer, wrong, explanation) {
  const generated = choices(answer, wrong, index);
  return { question: { questionId: `demo_g${gradeLevel}_${subject}_${topic}_${String(index + 1).padStart(3, '0')}`,
    gradeLevel, subject, subjectName, topic, topicName, questionText, choices: generated.choices, status: 'published',
    curriculum: { source: 'local-technical-demo', learningOutcomeId: null, reviewStatus: 'technical-only' }, isDemo: true },
    answer: { correctChoiceId: generated.correctChoiceId, explanation } };
}
export const demoQuestions = [
  ...Array.from({ length: 12 }, (_, i) => {
    const d = i + 4;
    return entry(5, 'matematik', 'Matematik', 'kesirler', 'Kesirler', i,
      `1/${d} + 1/${d} işleminin sonucu hangisidir?`, `2/${d}`, [`1/${d}`, `3/${d}`, `2/${d + 1}`],
      'Paydalar eşit olduğunda paylar toplanır; payda aynı kalır.');
  }),
  ...Array.from({ length: 12 }, (_, i) => {
    const d = i + 5, n = i + 3;
    return entry(6, 'matematik', 'Matematik', 'kesirler', 'Kesirler', i,
      `${n}/${d} − 1/${d} işleminin sonucu hangisidir?`, `${n - 1}/${d}`,
      [`${n}/${d}`, `${n + 1}/${d}`, `${n - 1}/${d + 1}`], 'Paydalar eşit olduğunda paylar çıkarılır; payda aynı kalır.');
  }),
  ...[['Book', 'Kitap', ['Kalem', 'Masa', 'Kapı']], ['Water', 'Su', ['Süt', 'Ekmek', 'Çay']],
    ['Apple', 'Elma', ['Armut', 'Muz', 'Üzüm']], ['Cat', 'Kedi', ['Köpek', 'Kuş', 'Balık']],
    ['School', 'Okul', ['Ev', 'Park', 'Dükkan']], ['Teacher', 'Öğretmen', ['Öğrenci', 'Doktor', 'Aşçı']],
    ['Sun', 'Güneş', ['Ay', 'Bulut', 'Yağmur']], ['Red', 'Kırmızı', ['Mavi', 'Yeşil', 'Sarı']],
    ['Door', 'Kapı', ['Pencere', 'Duvar', 'Tavan']], ['Friend', 'Arkadaş', ['Komşu', 'Öğretmen', 'Doktor']],
    ['Pencil', 'Kalem', ['Kitap', 'Silgi', 'Çanta']], ['Happy', 'Mutlu', ['Üzgün', 'Yorgun', 'Kızgın']]
  ].map(([word, answer, wrong], i) => entry(6, 'ingilizce', 'İngilizce', 'temel-kelimeler', 'Temel Kelimeler', i,
    `“${word}” kelimesinin Türkçesi hangisidir?`, answer, wrong, `${word}: ${answer}.`))
];
