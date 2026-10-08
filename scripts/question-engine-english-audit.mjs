import {readFileSync} from 'node:fs';
import {auditCuratedEnglishQuestion} from '../functions/lib/question-engine/english-curated-audit.js';
// No Firebase, provider, seed or publication imports. Missing canonical outcome
// assignments require review, never an invented School Life family/mapping.
const bank=JSON.parse(readFileSync(new URL('../data/soru-bankasi/2-sinif/ingilizce.json',import.meta.url),'utf8'));
console.log(JSON.stringify(bank.questions.map(q=>auditCuratedEnglishQuestion(q)),null,2));
