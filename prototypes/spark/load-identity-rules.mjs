import {readFile} from 'node:fs/promises';
export async function loadIdentityQuizRules(){
  const [quiz,identity]=await Promise.all(['quiz.rules','identity.rules.fragment'].map(f=>readFile(new URL(f,import.meta.url),'utf8')));
  const marker='    match /{document=**}';
  if(quiz.split(marker).length!==2)throw Error('Unexpected prototype rules boundary');
  return quiz.replace(marker,()=>identity+'\n'+marker);
}
