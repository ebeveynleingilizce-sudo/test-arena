import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',testMatch:'teacher-viewport.spec.ts',workers:1,timeout:60000,
 expect:{timeout:15000},reporter:'list',
 use:{baseURL:'http://127.0.0.1:5177',serviceWorkers:'block'},
 webServer:{cwd:'..',command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5177',url:'http://127.0.0.1:5177',env:{VITE_SPARK_TEST:'true',VITE_USE_EMULATORS:'true'}},
 projects:[{name:'phone',use:{viewport:{width:360,height:800}}},{name:'board',use:{viewport:{width:1920,height:1080}}}]
});
