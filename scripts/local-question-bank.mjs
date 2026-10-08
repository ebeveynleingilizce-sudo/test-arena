// Development middleware only: preserves local Admin sync without a Functions emulator.
// Never included in dist; cannot access a production project or accept a source path.
export function localQuestionBank(){return {name:'local-question-bank',apply:'serve',configureServer(server){
 server.middlewares.use('/__local/question-bank-sync',async(req,res)=>{
  try{
   const remote=req.socket.remoteAddress;if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote)||req.method!=='POST')throw Error('Local POST required');
   if(req.headers.origin&&!['http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin))throw Error('Origin denied');
   for(const [key,value]of Object.entries({GCLOUD_PROJECT:'demo-test-arena',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'})){if(process.env[key]&&process.env[key]!==value)throw Error('Local emulator required');process.env[key]=value;}
   const {initializeApp,getApps}=await import('firebase-admin/app'),{getAuth}=await import('firebase-admin/auth'),{getFirestore}=await import('firebase-admin/firestore');
   const app=getApps().find(a=>a.name==='local-sync-auth')||initializeApp({projectId:'demo-test-arena'},'local-sync-auth');
   const token=String(req.headers.authorization||'');if(!token.startsWith('Bearer '))throw Error('Auth required');
   const decoded=await getAuth(app).verifyIdToken(token.slice(7)),user=await getAuth(app).getUser(decoded.uid),db=getFirestore(app);
   if(user.disabled||user.email!=='demo.ogretmen@testarena.local'||(await db.doc(`roles/${decoded.uid}`).get()).data()?.role!=='teacher'||(await db.doc(`studentBindings/${decoded.uid}`).get()).exists)throw Error('Admin required');
   let body='';for await(const chunk of req){body+=chunk;if(body.length>128)throw Error('Invalid request');}if(body!=='{}')throw Error('No parameters accepted');
   const {importQuestionFolder}=await import('./import-question-folder.mjs');
   const report=await importQuestionFolder({log:()=>{}});res.statusCode=200;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(report));
  }catch{res.statusCode=403;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Yetkili local admin ve emulator gerekli.'}));}
 });
}};}
