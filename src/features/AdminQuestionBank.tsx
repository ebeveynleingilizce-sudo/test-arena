import {useEffect,useState,useRef} from 'react';
import {useNavigate} from 'react-router-dom';
import {useSession} from '../app/Session';
import {call} from '../data/firebase';
import '../ui/admin-question-bank.css';
interface SyncResult {scanned:number;validBanks:number;imported:number;unchanged:number;removedQuestions:number;removedAnswers:number;conflicts:number;failed:number;deletionSkipped:boolean;totalActive:number;completedAt:string;files:{file:string;ok:boolean;reason?:string}[]}
export function AdminQuestionBank(){
 const {user}=useSession(),navigate=useNavigate(),[permission,setPermission]=useState<{uid:string;canManage:boolean}>();
 const localDemo=user?.email?.toLowerCase()==='demo.ogretmen@testarena.local';
 useEffect(()=>{let alive=true;const uid=user?.uid;if(uid&&!localDemo)void call<{canManage:boolean}>('teacherBankPermissions',{}).then(p=>{if(alive)setPermission({uid,canManage:p.canManage});}).catch(()=>{if(alive)setPermission({uid,canManage:false});});return()=>{alive=false;};},[user?.uid,localDemo]);
 const [busy,setBusy]=useState(false),[result,setResult]=useState<SyncResult>(),[error,setError]=useState('');const running=useRef(false);
 const [last,setLast]=useState(()=>localStorage.getItem('question-bank-last-sync')||'');
 async function sync(){if(running.current)return;running.current=true;setBusy(true);setError('');setResult(undefined);
 try{const r=await call<SyncResult>('syncQuestionBank',{});setResult(r);setLast(r.completedAt);localStorage.setItem('question-bank-last-sync',r.completedAt);}catch{setError('Soru bankası güncellenemedi. Admin yetkisini ve local emulator bağlantısını kontrol et.');}finally{running.current=false;setBusy(false);}}
 if(!localDemo){if(permission?.uid!==user?.uid||!permission?.canManage)return null;return <section className="admin-question-bank" aria-label="Soru Bankası Yönetimi"><span className="eyebrow">Yönetim Araçları</span><h2>Soru Bankası</h2><p>Soruları düzenle veya JSON soru bankası yükle.</p><button className="button primary" onClick={()=>navigate('/ogretmen/soru-bankasi')}>Soru Bankasını Güncelle</button></section>;}
 return <section className="admin-question-bank" aria-label="Admin Araçları"><span className="eyebrow">Admin Araçları</span><h2>Soru Bankası</h2><button className="button primary" disabled={busy} onClick={()=>void sync()}>{busy?'Güncelleniyor…':'Soru Bankasını Güncelle'}</button>{last&&<p>Son güncelleme: {new Date(last).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</p>}{error&&<p role="alert">{error}</p>}{result&&<div role="status"><h3>{result.failed||result.conflicts?'Güncelleme kontrol gerektiriyor':'Soru Bankası Güncellendi'}</h3><dl>{[['Taranan dosya',result.scanned],['Geçerli banka',result.validBanks],['Yeni soru',result.imported],['Değişmeyen soru',result.unchanged],['Silinen soru',result.removedQuestions],['Silinen cevap',result.removedAnswers],['ID çakışması',result.conflicts],['Hata',result.failed],['Toplam aktif soru',result.totalActive]].map(([label,n])=><div key={label}><dt>{label}</dt><dd>{n}</dd></div>)}</dl>{result.deletionSkipped&&<p>Güvenlik nedeniyle silme senkronizasyonu yapılmadı.</p>}{result.files.filter(f=>!f.ok).map((f,i)=><p key={i}>{f.file}: {f.reason}</p>)}<button className="button outline" onClick={()=>window.location.reload()}>Tamam</button></div>}</section>;
}
