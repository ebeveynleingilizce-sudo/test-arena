import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const temporary='tests/class-delete-isolated.test.mjs',suite='tests/class-delete-suite.tmp.mjs';
try{
 writeFileSync(temporary,readFileSync('tests/spark.test.mjs','utf8').replaceAll('demo-test-arena-spark-prototype','demo-test-arena-classroom-test').replaceAll('8180','8380').replaceAll('9199','9399').replaceAll('5174','5176').replace("'--host','127.0.0.1','--port','5176'","'--config','tests/classroom.vite.config.mjs'"));
 writeFileSync(temporary,readFileSync(temporary,'utf8').replace("await page.goto(baseUrl+'/ogrenci-giris');","await page.goto(baseUrl+'/ogrenci-giris',{waitUntil:'domcontentloaded',timeout:60000});"));
 writeFileSync(suite,`import {spawnSync} from 'node:child_process';let failed=0;for(const args of [['--test','--test-concurrency=1','${temporary}'],['tests/class-delete.browser.mjs']]){const r=spawnSync(process.execPath,args,{stdio:'inherit',windowsHide:true});if(r.status!==0)failed=1;}process.exitCode=failed;`);
 const result=spawnSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config','firebase.classroom-test.json','--project','demo-test-arena-classroom-test','--only','auth,firestore',`node ${suite}`],{stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;
}finally{for(const p of [temporary,suite])try{unlinkSync(p);}catch{}}
