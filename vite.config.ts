import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {readFileSync,writeFileSync,copyFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {localQuestionBank} from './scripts/local-question-bank.mjs';
function pwaBuild() {
  let directory = '', base = '/';
  return {name:'arena-pwa-build', apply:'build' as const,
    configResolved(config: {root: string; base: string; build: {outDir: string}}) {directory=resolve(config.root,config.build.outDir);base=config.base;},
    closeBundle() {
      const worker=join(directory,'service-worker.js'), source=readFileSync(worker,'utf8');
      const hash=createHash('sha256').update(source).update(readFileSync(join(directory,'index.html'))).update(readFileSync(join(directory,'offline.html')));
      hash.update(readFileSync(join(directory,'manifest.webmanifest'))).update(readFileSync(join(directory,'arena.svg')));
      for(const file of readdirSync(join(directory,'icons')).sort()) hash.update(readFileSync(join(directory,'icons',file)));
      writeFileSync(worker,source.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,16)));
      if(base!=='/')copyFileSync(join(directory,'index.html'),join(directory,'404.html'));
    }};
}
export default defineConfig({ plugins: [react(),pwaBuild(),localQuestionBank()], server: { host: '127.0.0.1', port: 5173, strictPort: true,
  fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.firebase/**', '**/data/questions/**', '**/data/soru-bankasi/**'] },
  watch: { ignored: ['**/.firebase/**', '**/firebase-export-*/**'] } },
  build: { rollupOptions: { output: { manualChunks: { 'firebase-auth': ['firebase/auth'], 'firebase-data': ['firebase/firestore'], 'react': ['react', 'react-dom', 'react-router-dom'] } } } }
});
