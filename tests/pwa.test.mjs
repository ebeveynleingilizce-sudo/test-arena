import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('manifest has standalone mode, relative scope and PNG icons with matching sizes',()=>{
  const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone');
  for(const field of ['id','start_url','scope'])assert.equal(manifest[field],'./');
  for(const icon of manifest.icons){
    assert(!icon.src.startsWith('/'));
    const png=readFileSync('public/'+icon.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`,icon.sizes);
  }
  const apple=readFileSync('public/icons/apple-touch-icon.png');assert.equal(apple.readUInt32BE(16),180);
});
function worker(){
  const handlers={},removed=[],precached=[],stored=[];
  let skipCount=0,claimed=0,offline=false;
  const cache={addAll:async urls=>precached.push(...urls),match:async()=>undefined,put:async req=>stored.push(req.url)};
  const self={location:{href:'https://example.test/test-arena/service-worker.js'},addEventListener:(name,fn)=>handlers[name]=fn,
    clients:{claim:async()=>claimed++},skipWaiting:async()=>skipCount++};
  const caches={open:async()=>cache,keys:async()=>['test-arena-shell-v1','unrelated-app'],delete:async key=>removed.push(key),match:async()=>new Response('offline')};
  vm.runInNewContext(readFileSync('public/service-worker.js','utf8'),{self,caches,URL,fetch:async()=>{if(offline)throw Error('offline');return new Response('online');}});
  return {handlers,removed,precached,stored,get skipCount(){return skipCount;},get claimed(){return claimed;},goOffline(){offline=true;}};
}
test('worker scopes precache to Pages subdirectory and updates only its own caches',async()=>{
  const w=worker();let done;w.handlers.install({waitUntil:p=>done=p});await done;
  assert(w.precached.every(url=>url.startsWith('https://example.test/test-arena/')));
  w.handlers.activate({waitUntil:p=>done=p});await done;
  assert.deepEqual(w.removed,['test-arena-shell-v1']);assert.equal(w.claimed,1);
  assert.equal(w.skipCount,0);w.handlers.message({data:{type:'SKIP_WAITING'}});assert.equal(w.skipCount,1);
});
test('worker never intercepts Firebase, API, POST, private data or question images',()=>{
  const w=worker();
  for(const [url,method] of [['https://firestore.googleapis.com/x','GET'],['https://example.test/test-arena/api/data','GET'],['https://example.test/test-arena/data/questions/bank.json','GET'],['https://example.test/test-arena/assets/question-images/q.webp','GET'],['https://example.test/test-arena/api/submit','POST'],['http://127.0.0.1:5001/demo-test-arena/europe-west1/submitAnswer','POST']]){
    let intercepted=false;w.handlers.fetch({request:{url,method,mode:'cors'},respondWith:()=>intercepted=true});assert.equal(intercepted,false,url);
  }
});
test('offline navigation returns an explicit connection-required screen',async()=>{
  const w=worker();w.goOffline();let response;
  w.handlers.fetch({request:{url:'https://example.test/test-arena/ogrenci',method:'GET',mode:'navigate'},respondWith:p=>response=p});
  assert.equal(await (await response).text(),'offline');
  assert(readFileSync('public/offline.html','utf8').includes('İnternet bağlantısı gerekiyor'));
});
