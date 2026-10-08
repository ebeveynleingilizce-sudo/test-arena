import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react(),{name:'classroom-isolated-fixture',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/data/firebaseEnvironment.ts'))return code.replaceAll('demo-test-arena-spark-prototype','demo-test-arena-classroom-test').replaceAll('9199','9399').replaceAll('8180','8380');}}],server:{host:'127.0.0.1',port:5176,strictPort:true}});

