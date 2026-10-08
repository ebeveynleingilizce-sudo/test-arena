import {readFileSync,lstatSync,realpathSync,mkdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,relative,join,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {parseVisual} from '../functions/visuals/contract.mjs';
const ensure=(ok,message)=>{if(!ok)throw Error('Paket görseli: '+message);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

export function packageVisual(value,packageDirectory,assets){
 if(value===undefined)return undefined;
 if(value?.type!=='image'&&value?.kind!=='image')return value?.kind==='scene'&&Array.isArray(value.items)?{...value,items:value.items.map(v=>packageVisual(v,packageDirectory,assets))}:value;
 ensure(packageDirectory,'görsel için paket klasörü gerekli.');
 ensure(!(value.type&&value.kind)&&Object.keys(value).every(k=>['type','kind','src','alt'].includes(k)),'beklenmeyen görsel alanı.');
 const src=value.src;
 ensure(typeof src==='string'&&src.length<=240&&!src.startsWith('/')&&!/[\\:%?#\x00-\x1f]/.test(src),'yalnız yerel relative path kabul edilir.');
 const parts=src.split('/');
 ensure(parts.every(p=>p&&p!=='.'&&p!=='..'&&/^[\p{L}\p{N} _.-]+$/u.test(p)),'path traversal veya geçersiz dosya adı.');
 const extension=extname(src).toLowerCase();
 ensure(['.png','.jpg','.jpeg','.webp'].includes(extension),'yalnız PNG/JPEG/WebP kabul edilir.');
 const base=realpathSync(packageDirectory),path=resolve(base,...parts);
 ensure(relative(base,path)&&!relative(base,path).startsWith('..'+sep),'dosya paket dışında.');
 let current=base;for(const part of parts){current=join(current,part);ensure(existsSync(current)&&!lstatSync(current).isSymbolicLink(),'dosya eksik veya sembolik bağlantı.');}
 const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
 ensure(lstatSync(path).isFile()&&samePath(realpathSync(path),path),'dosya paket içinde normal bir dosya olmalı.');
 const bytes=readFileSync(path);ensure(bytes.length>12&&bytes.length<=10*1024*1024,'görsel 10 MB sınırında olmalı.');
 const valid=extension==='.png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
 extension==='.webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 ensure(valid,'dosya içeriği görsel uzantısıyla uyuşmuyor.');
 const fingerprint=hash(bytes),file=fingerprint+extension;
 const visual=parseVisual({kind:'image',src:'/assets/question-images/'+file,alt:value.alt});
 assets.push({path,base,fingerprint,file,bytes});return visual;
}

// Only validated raster bytes are public. JSON/private keys never enter public/.
export function publishPackageImages(assets,publicDirectory){
 if(!assets.length)return;
 let ancestor=resolve(publicDirectory);while(true){if(existsSync(ancestor))ensure(!lstatSync(ancestor).isSymbolicLink(),'public görsel yolu bağlantı olamaz.');const parent=resolve(ancestor,'..');if(parent===ancestor)break;ancestor=parent;}
 mkdirSync(publicDirectory,{recursive:true});ensure(!lstatSync(publicDirectory).isSymbolicLink(),'public görsel klasörü bağlantı olamaz.');
 for(const asset of assets){let current=asset.base;for(const part of relative(asset.base,asset.path).split(sep)){current=join(current,part);ensure(!lstatSync(current).isSymbolicLink(),'görsel yolu tarama sırasında değişti.');}ensure(hash(readFileSync(asset.path))===asset.fingerprint,'görsel tarama sırasında değişti.');const target=join(publicDirectory,asset.file);
  if(existsSync(target)){ensure(!lstatSync(target).isSymbolicLink()&&hash(readFileSync(target))===asset.fingerprint,'public görsel özeti uyuşmuyor.');}
  else writeFileSync(target,asset.bytes,{flag:'wx'});
 }
}
