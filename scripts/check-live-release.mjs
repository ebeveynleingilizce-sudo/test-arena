import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join,relative} from 'node:path';
const project=JSON.parse(await readFile('.firebaserc','utf8')).projects.production;
if(project!=='test-arena-20261008')throw Error('Beklenen canlı proje bulunamadı.');
const hash=v=>createHash('sha256').update(v).digest('hex');
async function files(path){return (await Promise.all((await readdir(path,{withFileTypes:true})).map(d=>d.isDirectory()?files(join(path,d.name)):[join(path,d.name)]))).flat();}
const paths=await files('dist'),different=[],failed=[];let next=0;
await Promise.all(Array.from({length:6},async()=>{while(next<paths.length){const path=paths[next++],name=relative('dist',path).replaceAll('\\','/');try{const response=await fetch(`https://${project}.web.app/${name}?release-check=${Date.now()}`);if(!response.ok){different.push({file:name,status:response.status});continue;}if(hash(await readFile(path))!==hash(Buffer.from(await response.arrayBuffer())))different.push({file:name,status:'content-differs'});}catch(e){failed.push({file:name,error:e.message});}}}));
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth'),account=auth.getProjectDefaultAccount(process.cwd());if(!account?.tokens?.refresh_token)throw Error('Firebase CLI oturumu gerekli.');
const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
async function readRules(path){const response=await fetch(`https://firebaserules.googleapis.com/v1/${path}`,{headers:{Authorization:`Bearer ${token.access_token}`}});if(!response.ok)throw Error(`Rules kontrolü başarısız (${response.status}).`);return response.json();}
const release=await readRules(`projects/${project}/releases/cloud.firestore`),ruleset=await readRules(release.rulesetName),remote=ruleset.source.files.find(f=>f.name.endsWith('firestore.rules'))||ruleset.source.files[0];
const rulesMatch=hash(remote.content)===hash(await readFile('firestore.rules'));
console.log(JSON.stringify({hostingFilesChecked:paths.length,differentFiles:different,failedChecks:failed,firestoreRulesMatch:rulesMatch,liveRulesUpdated:release.updateTime},null,2));
if(failed.length||different.length||!rulesMatch)process.exitCode=2;
