import {useEffect,useState,useRef} from 'react';
import {useSession} from '../app/Session';
import {call} from '../data/firebase';
import {errorMessage} from '../ui/components';
import '../ui/admin-question-bank.css';
interface SyncResult {imported:number;unchanged:number;unchangedFiles?:number;remainingFiles?:number;failed:number;conflicts:number;completedAt:string;upToDate?:boolean;files:{file:string;ok:boolean;reason?:string}[]}
export function AdminQuestionBank(){
 const {user,role}=useSession();
 if(role!=='teacher'||user?.email?.toLowerCase()!=='tunc@test.com')return null;
 return <AdminBankSync key={user.uid} uid={user.uid}/>;
}
function AdminBankSync({uid}:{uid:string}){
 const [allowed,setAllowed]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState<SyncResult>(),[error,setError]=useState('');
 const running=useRef(false),alive=useRef(true);
 useEffect(()=>{let current=true;alive.current=true;void call<{canManage:boolean}>('teacherBankPermissions',{}).then(p=>{if(current)setAllowed(p.canManage);}).catch(()=>{});return()=>{current=false;alive.current=false;};},[uid]);
 async function sync(){
  if(running.current||!allowed)return;running.current=true;setBusy(true);setError('');setResult(undefined);
  try{const value=await call<SyncResult>('syncQuestionBank',{});if(alive.current)setResult(value);}
  catch(e){if(alive.current){const code=(e as {code?:string}).code;setError(code==='functions/failed-precondition'?'Özel GitHub soru deposu bağlantısı henüz hazır değil.':code==='functions/aborted'?'Başka bir güncelleme sürüyor. Biraz sonra yeniden dene.':errorMessage(e));}}
  finally{running.current=false;if(alive.current)setBusy(false);}
 }
 if(!allowed)return null;
 return <section className="admin-question-bank" aria-label="Soru Bankası Yönetimi"><h2>Soru Bankası</h2>
  <button className="button primary" disabled={busy} onClick={()=>void sync()}>{busy?'Yeni sorular kontrol ediliyor…':'Soru Bankasını Güncelle'}</button>
  {error&&<p role="alert">{error}</p>}
  {result&&<div role="status"><p><strong>{result.upToDate?'Soru bankası zaten güncel.':result.failed?'Güncelleme tamamlandı; bazı dosyaları kontrol et.':'Soru bankası güncellendi.'}</strong></p>
   {!result.upToDate&&<p>{result.imported} yeni soru · {result.unchanged} soru zaten mevcut{result.unchangedFiles?` · ${result.unchangedFiles} dosya değişmedi`:''}{result.failed?` · ${result.failed} dosyada hata`:''}</p>}
   {!!result.remainingFiles&&<p>{result.remainingFiles} dosya daha var. Devam etmek için güncellemeye tekrar bas.</p>}
   {result.files.filter(f=>!f.ok).map((f,i)=><p key={i}>{f.file}: {f.reason}</p>)}
  </div>}
 </section>;
}
