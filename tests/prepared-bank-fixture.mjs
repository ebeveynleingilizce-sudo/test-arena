import {readdirSync, readFileSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';

// Read real prepared banks; never write/import fixtures into the working pool.
export function preparedBankFixture(subjectId, grade = 2, minimum = 1) {
  function find(directory) {
    for (const entry of readdirSync(directory, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const path = join(directory,entry.name);
      if (entry.isDirectory()) { const found = find(path); if (found) return found; }
      else if (entry.name.endsWith('.json') && !/^(schema|manifest)\.json$/i.test(entry.name)) {
        const bank = JSON.parse(readFileSync(path,'utf8'));
        if (bank.grade === grade && bank.subjectId === subjectId && bank.questions?.length >= minimum) {
          return {bank, path, prepared:prepareQuestionBank(bank,undefined,{packageDirectory:dirname(path)})};
        }
      }
    }
  }
  const found = find(resolve('data/questions'));
  if (!found) throw Error(`Real prepared test bank missing: grade=${grade}, subject=${subjectId}`);
  return found;
}
