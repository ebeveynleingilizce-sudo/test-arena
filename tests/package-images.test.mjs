import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {packageVisual,publishPackageImages} from '../scripts/package-images.mjs';
import {prepareQuestionBank} from '../scripts/curriculum-bank.mjs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG1kAAAAASUVORK5CYII=','base64');
test('actual shared renderer renders a validated image without HTML or answer data',async()=>{
 const server=await createServer({server:{middlewareMode:true},appType:'custom'});try{
 const {MathVisual}=await server.ssrLoadModule('/src/ui/MathVisual.tsx');
 const markup=renderToStaticMarkup(createElement(MathVisual,{visual:{kind:'image',src:'/assets/question-images/'+'a'.repeat(64)+'.webp',alt:'Okul bahçesinde öğrenciler'}}));
 assert(markup.includes('class="package-question-image"'));assert(markup.includes('alt="Okul bahçesinde öğrenciler"'));assert(!markup.includes('correctOptionId'));
 }finally{await server.close();}
});
const root=resolve('.firebase');mkdirSync(root,{recursive:true});
test('package image import keeps public/private separation and existing visuals',()=>{
 const dir=mkdtempSync(join(root,'image-unit-'));try{
 mkdirSync(join(dir,'images'));writeFileSync(join(dir,'images/q.png'),png);
 const file=readdirSync('data/questions').find(f=>f.startsWith('2-sinif-ingilizce'));
 const bank=JSON.parse(readFileSync('data/questions/'+file,'utf8'));bank.questions=bank.questions.slice(0,1);delete bank.questionCount;
 bank.questions[0].visual={type:'image',src:'images/q.png',alt:'Okulda öğrenciler'};
 const prepared=prepareQuestionBank(bank,undefined,{packageDirectory:dir}),record=prepared.records[0];
 assert.equal(record.question.visual.kind,'image');assert.match(record.question.visual.src,/^\/assets\/question-images\/[a-f0-9]{64}\.png$/);
 assert(!('correctOptionId' in record.question));assert(!('explanation' in record.question));assert.equal(record.answer.correctOptionId,bank.questions[0].correctOptionId);
 publishPackageImages(prepared.assets,join(dir,'public'));publishPackageImages(prepared.assets,join(dir,'public'));assert.equal(readdirSync(join(dir,'public')).length,1);
 bank.questions[0].visual={kind:'geometry',shape:'cube',alt:'Geometrik cisim'};assert.equal(prepareQuestionBank(bank).records[0].question.visual.kind,'geometry');
 bank.stimuli=[];assert.throws(()=>prepareQuestionBank(bank));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('package visual rejects unsafe paths, missing files/alt, unknown fields and disguised raster',()=>{
 const dir=mkdtempSync(join(root,'image-security-'));try{
 mkdirSync(join(dir,'images'));writeFileSync(join(dir,'images/q.png'),png);
 const value={type:'image',src:'images/q.png',alt:'Okulda öğrenciler'};
 symlinkSync(join(dir,'images'),join(dir,'linked'),process.platform==='win32'?'junction':'dir');assert.throws(()=>packageVisual({...value,src:'linked/q.png'},dir,[]));
 for(const src of ['https://a/q.png','http://a/q.png','data:image/png;base64,x','/q.png','C:\\q.png','../q.png','images/../q.png','images\\q.png','images/%2e%2e/q.png','images/q.svg','images/no.png'])assert.throws(()=>packageVisual({...value,src},dir,[]),src);
 for(const patch of [{alt:''},{alt:undefined},{width:100},{kind:'image',type:undefined,src:'/assets/question-images/'+'a'.repeat(64)+'.png'}])assert.throws(()=>packageVisual({...value,...patch},dir,[]));
 writeFileSync(join(dir,'images/fake.png'),'<svg><script>alert(1)</script></svg>');assert.throws(()=>packageVisual({...value,src:'images/fake.png'},dir,[]));
 const assets=[];packageVisual(value,dir,assets);writeFileSync(join(dir,'images/q.png'),Buffer.concat([png,Buffer.from('changed')]));assert.throws(()=>publishPackageImages(assets,join(dir,'public')));
 for(const ext of ['jpg','jpeg','webp']){const bytes=ext==='webp'?Buffer.from('RIFF1234WEBP1234'):Buffer.from([255,216,255,...Array(20).fill(0)]);writeFileSync(join(dir,'images/q.'+ext),bytes);assert.equal(packageVisual({...value,src:'images/q.'+ext},dir,[]).kind,'image');}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
