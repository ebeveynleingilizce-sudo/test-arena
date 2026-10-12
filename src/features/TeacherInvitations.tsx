import {useMemo,useState,type FormEvent} from 'react';
import {collection,documentId,orderBy,query,where} from 'firebase/firestore';
import {usePagedCollection} from '../app/usePagedCollection';
import {call,db} from '../data/firebase';
import {errorMessage} from '../ui/components';
import type {ArenaClass} from '../domain/models';
import '../ui/class-sharing.css';

type Invitation={id:string;storageUid:string;classId:string;classIds?:string[];createdAt?:{toMillis:()=>number};revoked:boolean;consumedBy:string};
export function TeacherInvitations({classes,uid}:{classes:ArenaClass[];uid:string}){
 const [mode,setMode]=useState<'invite'|'join'|null>(null),[selected,setSelected]=useState<string[]>([]),[code,setCode]=useState(''),[issued,setIssued]=useState<{code:string;invitationId:string;names:string[];classId:string}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
 const invitationQuery=useMemo(()=>mode==='invite'?query(collection(db,'teacherInvitations'),where('createdBy','==',uid),orderBy(documentId())):undefined,[uid,mode]);
 const invitationPage=usePagedCollection(invitationQuery,uid+':'+mode),invites=invitationPage.rows as Invitation[];
 const own=classes.filter(c=>(c.storageUid||uid)===uid&&c.status!=='deleting');
 async function work(task:()=>Promise<void>){setBusy(true);setError('');setStatus('');try{await task();}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 function generate(e:FormEvent){e.preventDefault();void work(async()=>{
  const chosen=own.filter(c=>selected.includes(c.classId));if(chosen.length!==selected.length||!chosen.length)throw Error('Davet edeceğin sınıfları seç.');
  const result=await call<{code:string;invitationId:string}>('inviteTeacherClasses',{classIds:chosen.map(c=>c.classId)});
  setIssued({...result,names:chosen.map(c=>c.className),classId:chosen[0].classId});setStatus('Davet kodu hazır. Yalnız seçtiğin sınıflara erişim sağlar.');
 });}
 function join(e:FormEvent){e.preventDefault();void work(async()=>{
  const result=await call<{classIds?:string[]}>('acceptTeacherInvitation',{code});setCode('');setStatus(`${result.classIds?.length||1} sınıfa tam yönetim yetkisiyle katıldın. Sınıfların aşağıdaki listede.`);
 });}
 return <section className="teacher-invitations" aria-label="Öğretmen davet işlemleri">
  <div className="invitation-actions"><button className="button secondary" aria-expanded={mode==='invite'} disabled={busy} onClick={()=>{setMode(mode==='invite'?null:'invite');setError('');setStatus('');}}>Öğretmen Davet Et</button><button className="button secondary" aria-expanded={mode==='join'} disabled={busy} onClick={()=>{setMode(mode==='join'?null:'join');setError('');setStatus('');}}>Davet Kodu ile Sınıfa Katıl</button></div>
  {mode==='invite'&&<div className="invitation-panel"><h2>Öğretmen Davet Et</h2><p>Kendi sınıflarından paylaşmak istediklerini seç. Davetli öğretmen seçilen sınıfları tam yetkiyle yönetebilir.</p>
   <form onSubmit={generate}><fieldset disabled={busy}><legend>Davet edilecek sınıflar</legend><p className="field-hint">Bir kodla en fazla 5 sınıf paylaşabilirsin. Kod 24 saat geçerli ve tek öğretmen için kullanılır.</p><div className="invitation-class-options">{own.map(c=><label key={c.classId}><input type="checkbox" checked={selected.includes(c.classId)} disabled={!selected.includes(c.classId)&&selected.length>=5} onChange={e=>setSelected(e.target.checked?[...selected,c.classId]:selected.filter(id=>id!==c.classId))}/><span>{c.className}</span></label>)}</div>{!own.length&&<p>Önce bir sınıf oluştur; ardından burada seçebilirsin.</p>}</fieldset><button className="button primary" disabled={busy||!selected.length}>{busy?'Oluşturuluyor…':'Davet Kodu Oluştur'}</button></form>
   {issued&&<div className="invitation-code"><p><strong>Seçilen sınıflar:</strong> {issued.names.join(', ')}</p><label>Oluşturulan davet kodu<input aria-label="Oluşturulan davet kodu" readOnly value={issued.code} onFocus={e=>e.target.select()}/></label><button className="button secondary" onClick={()=>void navigator.clipboard.writeText(issued.code).then(()=>setStatus('Davet kodu kopyalandı.')).catch(()=>setError('Kod kopyalanamadı. Kod alanına dokunup seçili kodu kopyalayabilirsin.'))}>Kodu kopyala</button><p className="field-hint">Kodu davet edeceğin öğretmene paylaş. Bu sayfadan ayrıldığında kod tekrar gösterilmez.</p></div>}
   <h3>Davet kayıtları</h3><ul className="sharing-rows">{invites.map(i=>{const pending=!i.revoked&&!i.consumedBy&&(i.createdAt?.toMillis()||0)+86400000>Date.now();return <li key={i.id}><span>{i.revoked?'İptal edilmiş davet':i.consumedBy?'Kullanılmış davet':pending?'Bekleyen davet':'Süresi dolmuş davet'} · {(i.classIds||[i.classId]).map(id=>classes.find(c=>c.classId===id&&c.storageUid===i.storageUid)?.className||'Sınıf').join(', ')}</span>{pending&&<button className="text-button" disabled={busy} onClick={()=>void work(async()=>{await call('revokeTeacherInvitation',{storageUid:i.storageUid,classId:i.classId,invitationId:i.id});if(issued?.invitationId===i.id)setIssued(null);invitationPage.reload();setStatus('Davet iptal edildi.');})}>Daveti iptal et</button>}</li>;})}</ul>
   {issued&&!invites.some(i=>i.id===issued.invitationId)&&<button className="text-button" disabled={busy} onClick={()=>void work(async()=>{await call('revokeTeacherInvitation',{storageUid:uid,classId:issued.classId,invitationId:issued.invitationId});setIssued(null);invitationPage.reload();setStatus('Davet iptal edildi.');})}>Yeni daveti iptal et</button>}
   {invitationPage.busy&&<p role="status">Davetler yükleniyor…</p>}{invitationPage.error&&<><p role="alert">{invitationPage.error}</p><button className="button secondary" onClick={invitationPage.reload}>Davetleri yeniden yükle</button></>}{invitationPage.hasMore&&<button className="button secondary" disabled={invitationPage.busy} onClick={()=>void invitationPage.loadMore()}>Daha fazla davet yükle</button>}<p className="field-hint">{invites.length} davet kaydı yüklendi. Diğer kayıtlar sonraki sayfalarda bulunur.</p>
  </div>}
  {mode==='join'&&<div className="invitation-panel"><h2>Davet Kodu ile Sınıfa Katıl</h2><p>Başka bir öğretmenin verdiği kodu gir. Davet edildiğin sınıflar Sınıflarım listene eklenir.</p><form className="invitation-join-form" onSubmit={join}><label>Davet kodu<input aria-label="Öğretmen davet kodu" value={code} onChange={e=>setCode(e.target.value)} placeholder="24 karakterli davet kodu" maxLength={40} required autoComplete="off" disabled={busy}/></label><button className="button primary" disabled={busy||!code.trim()}>{busy?'Katılıyor…':'Sınıfa katıl'}</button></form></div>}
  {error&&<p role="alert" className="error-message">{error}</p>}{status&&<p role="status" className="status-message">{status}</p>}
 </section>;
}
