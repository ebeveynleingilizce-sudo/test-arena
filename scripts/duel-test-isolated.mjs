import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const config='prototypes/spark/duel-test.firebase.json',test='tests/duel-isolated.test.mjs';
try{
 writeFileSync(config,JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{auth:{host:'127.0.0.1',port:29199},firestore:{host:'127.0.0.1',port:28180},hub:{host:'127.0.0.1',port:24411},logging:{host:'127.0.0.1',port:24511},ui:{enabled:false},singleProjectMode:true}}));
 writeFileSync(test,readFileSync('tests/spark.test.mjs','utf8').replaceAll('8180','28180').replaceAll('9199','29199'));
 const r=spawnSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config',config,'--project','demo-test-arena-spark-prototype','--only','auth,firestore',`node --test --test-concurrency=1 ${test}`],{stdio:'inherit',windowsHide:true});process.exitCode=r.status??1;
}finally{for(const p of [config,test])try{unlinkSync(p);}catch{}}
