import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {spawn,spawnSync} from 'node:child_process';
const config='prototypes/spark/sharing-test.firebase.json',suite='tests/sharing-isolated.test.mjs';
let preview;
try{
 const environment={...process.env,VITE_SPARK_TEST:'true',VITE_TEST_PROJECT_ID:'demo-test-arena-teacher-sharing',VITE_USE_EMULATORS:'true',VITE_TEST_AUTH_PORT:'29299',VITE_TEST_FIRESTORE_PORT:'28280',SPARK_BROWSER_URL:'http://127.0.0.1:5184'};
 const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode','sharing-test','--outDir','.firebase/teacher-sharing-test-dist'],{env:environment,stdio:'inherit',windowsHide:true});if(build.status!==0)throw Error('Test uygulaması derlenemedi.');
 preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','5184','--strictPort','--outDir','.firebase/teacher-sharing-test-dist'],{env:environment,stdio:'inherit',windowsHide:true});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(environment.SPARK_BROWSER_URL)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}if(!ready)throw Error('Test önizlemesi açılamadı.');
 writeFileSync(config,JSON.stringify({firestore:{rules:'firestore.rules'},emulators:{auth:{host:'127.0.0.1',port:29299},firestore:{host:'127.0.0.1',port:28280},hub:{host:'127.0.0.1',port:24611},logging:{host:'127.0.0.1',port:24711},ui:{enabled:false},singleProjectMode:true}}));
 writeFileSync(suite,readFileSync('tests/spark.test.mjs','utf8').replaceAll('demo-test-arena-spark-prototype','demo-test-arena-teacher-sharing').replaceAll('8180','28280').replaceAll('9199','29299').replaceAll('5174','5184').replace("VITE_SPARK_TEST:'true'","VITE_SPARK_TEST:'true',VITE_TEST_PROJECT_ID:'demo-test-arena-teacher-sharing'").replace(/page\.goto\(([^;]+?)\);/g,"page.goto($1,{waitUntil:'domcontentloaded',timeout:60000});"));
 const result=spawnSync(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec','--config',config,'--project','demo-test-arena-teacher-sharing','--only','auth,firestore',`node --test --test-concurrency=1 ${suite}`],{env:environment,stdio:'inherit',windowsHide:true});process.exitCode=result.status??1;
}finally{preview?.kill();for(const p of [config,suite])try{unlinkSync(p);}catch{}}
